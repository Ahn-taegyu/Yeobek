import "server-only";
import { setTimeout as wait } from "node:timers/promises";
import { z } from "zod";
import { abortable, createDeadline } from "../ai/deadline";
import { AutomationError } from "./errors";
import type { DispatchResult, MailPort, SupportPort } from "./ports";
import { outboundBodySchema } from "../contracts/automation";

const id = z.uuid();
const claimSchema = z.strictObject({ id, attempt: id, mock: z.boolean() });
const base = claimSchema.extend({ body: outboundBodySchema });
const channelId = z.string().regex(/^[A-Za-z0-9_-]{1,200}$/);
const permitSchema = z.discriminatedUnion("channel", [
  base.extend({ channel: z.literal("mail"), category: z.enum(["transactional", "marketing"]),
    recipient: z.email().max(254), channelId: z.null(), chatId: z.null() }),
  base.extend({ channel: z.literal("support"), category: z.enum(["usage", "status"]),
    recipient: z.null(), channelId, chatId: channelId }),
]);
const receiptSchema = z.discriminatedUnion("status", [
  z.strictObject({ status: z.literal("accepted"), code: z.literal("accepted"), mock: z.boolean(), providerMessageId: channelId.optional() }),
  z.strictObject({ status: z.literal("rejected"), code: z.enum(["provider_rejected", "rate_limited"]), mock: z.boolean() }),
  z.strictObject({ status: z.literal("unknown"), code: z.literal("ambiguous_transport"), mock: z.boolean() }),
]);

export interface OutboxDispatchStore {
  claim(limit: number, mock: boolean): Promise<unknown>;
  check(id: string, attempt: string, mock: boolean): Promise<unknown>;
  complete(id: string, attempt: string, status: DispatchResult["status"] | "failed",
    providerId: string | null, resultCode: string): Promise<unknown>;
}

const unknownReceipt = { status: "unknown", code: "ambiguous_transport" } as const;

export async function dispatchOutbox(deps: { store: OutboxDispatchStore; mail: MailPort; support: SupportPort },
  options: { limit: number; deadlineMs: number; mock: boolean; signal?: AbortSignal }) {
  if (!Number.isInteger(options.limit) || options.limit < 1 || options.limit > 100 ||
      !Number.isInteger(options.deadlineMs) || options.deadlineMs < 1 || options.deadlineMs > 60_000) {
    throw new AutomationError("invalid_input");
  }
  const deadline = createDeadline(options.deadlineMs, options.signal);
  const summary = { claimed: 0, accepted: 0, rejected: 0, unknown: 0, failed: 0, skipped: 0, persistenceFailures: 0 };
  let nextMailAt = 0;
  try {
    const seen = new Set<string>();
    for (let index = 0; index < options.limit && !deadline.signal.aborted; index++) {
      // The store must bound its RPC latency. Await one claim so a late
      // commit can still be settled rather than leaving a batch in flight.
      const claims = z.array(claimSchema).max(1).safeParse(await deps.store.claim(1, options.mock));
      if (!claims.success) throw new AutomationError("invalid_response");
      const claim = claims.data[0];
      if (!claim) break;
      if (seen.has(claim.id)) { summary.skipped++; break; }
      seen.add(claim.id);
      summary.claimed++;
      const complete = async (status: DispatchResult["status"] | "failed", code: string, providerId: string | null = null) => {
        summary[status]++;
        try { await deps.store.complete(claim.id, claim.attempt, status, providerId, code); }
        catch { summary.persistenceFailures++; }
      };
      if (claim.mock !== options.mock) { summary.skipped++; continue; }
      // The claim has no channel. Pace before check, so the permit still
      // rechecks consent immediately before dispatch. This pacing is local to
      // one batch and does not coordinate several workers.
      try {
        if (nextMailAt > performance.now()) await wait(Math.ceil(nextMailAt - performance.now()), undefined, { signal: deadline.signal });
      } catch { /* cancellation is settled below */ }
      if (deadline.signal.aborted) { await complete("failed", "CANCELLED_BEFORE_DISPATCH"); continue; }

      let raw: unknown;
      try { raw = await deps.store.check(claim.id, claim.attempt, options.mock); }
      catch { await complete("failed", "DISPATCH_CHECK_FAILED"); continue; }
      if (raw === null) { summary.skipped++; continue; }
      const parsed = permitSchema.safeParse(raw);
      if (!parsed.success || parsed.data.id !== claim.id || parsed.data.attempt !== claim.attempt || parsed.data.mock !== options.mock) {
        await complete("failed", "INVALID_DISPATCH_PERMIT");
        continue;
      }
      if (deadline.signal.aborted) { await complete("failed", "CANCELLED_BEFORE_DISPATCH"); continue; }
      const permit = parsed.data;

      let outcome: typeof unknownReceipt | z.infer<typeof receiptSchema> = unknownReceipt;
      try {
        const result = await abortable(deadline.signal, active => {
          if (permit.channel === "mail") {
            // Stibee allows three requests per second. Leave ≥334 ms between starts.
            nextMailAt = performance.now() + 334;
            return deps.mail.send({ recipient: permit.recipient, template: permit.category, paragraph: permit.body }, active);
          }
          return deps.support.reply({ channelId: permit.channelId, chatId: permit.chatId, text: permit.body }, active);
        });
        const receipt = receiptSchema.safeParse(result);
        if (receipt.success && receipt.data.mock === options.mock) outcome = receipt.data;
      } catch { /* The provider may already have accepted the message. */ }
      await complete(outcome.status, outcome.code.toUpperCase(),
        outcome.status === "accepted" ? outcome.providerMessageId ?? null : null);
      if (permit.channel === "mail") nextMailAt = performance.now() + 334;
    }
    return summary;
  } finally {
    deadline.dispose();
  }
}
