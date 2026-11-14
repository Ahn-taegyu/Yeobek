import "server-only";
import { z } from "zod";
import { abortable, createDeadline } from "../ai/deadline";
import { AiError } from "../ai/errors";
import { normalizeAiOutcome } from "../ai/outcome";
import { PlaybookOrderError, startPlaybook, type PlaybookStepRecord } from "../ai/playbook";
import { capabilitiesFor, playbookPrompt } from "../ai/plugin";
import type { AiProviderTrace, AiTextProvider } from "../ai/providers/types";

const uuid = z.uuid();
const revision = z.number().int().positive().max(2147483647);
const count = z.number().int().nonnegative();
const contextSchema = z.strictObject({
  eventId: uuid,
  trigger: z.enum(["exhibition_created", "draft_ready", "published"]),
  sourceRevision: revision,
  exhibitionId: uuid,
  exhibitionRevision: revision,
  exhibitionState: z.enum(["draft", "published", "paused"]),
  artworkCount: count,
  approvedCount: count,
  publishedCount: count,
}).refine(context => context.approvedCount <= context.artworkCount && context.publishedCount <= context.artworkCount);

const outputSchema = z.strictObject({
  paragraph: z.string().max(600),
  citations: z.array(z.string()).max(1),
  outcome: z.enum(["ready", "escalate"]),
});

export const notificationJsonSchema = {
  name: "yeobek_ops_notification",
  definition: {
    type: "object",
    additionalProperties: false,
    required: ["paragraph", "citations", "outcome"],
    properties: {
      paragraph: { type: "string" },
      citations: { type: "array", items: { type: "string" } },
      outcome: { type: "string", enum: ["ready", "escalate"] },
    },
  },
};

type NotificationOutbound = { channel: "mail"; category: "transactional"; body: string };
export type NotificationResult = {
  state: "processed" | "suppressed" | "failed" | "escalated";
  resultCode: string;
  outbound: NotificationOutbound | null;
  usage: AiProviderTrace[];
  steps: readonly PlaybookStepRecord[];
  elapsedMs: number;
};

const heading = "안녕하세요. 여백입니다.";
const footer = "자세한 진행 상태는 여백의 작가 화면에서 확인해 주세요.";
const unsafeParagraph = /[<>@\p{Cc}\p{Cf}\p{Zl}\p{Zp}]|(?:\b(?:https?|file|data|mailto|ftp)\s*:|\bwww\.|(?:[\p{L}\p{N}-]+\.)+[\p{L}-]{2,})/iu;
const uuidInText = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/iu;

export async function runNotification(eventId: string, deps: {
  text: AiTextProvider;
  readContext: () => Promise<unknown | null>;
}, signal?: AbortSignal): Promise<NotificationResult> {
  const started = performance.now();
  const deadline = createDeadline(30_000, signal);
  const flow = startPlaybook("ops-notify");
  const capability = capabilitiesFor("ops-notify", { status: { read: deps.readContext } });
  const usage: AiProviderTrace[] = [];
  const read = () => abortable(deadline.signal, () => capability["status.read"]());
  const result = (state: NotificationResult["state"], resultCode: string,
    steps: readonly PlaybookStepRecord[], outbound: NotificationOutbound | null = null): NotificationResult =>
    ({ state, resultCode, outbound, usage, steps, elapsedMs: Math.round(performance.now() - started) });
  try {
    const context = await flow.step("status.read", async () => {
      deadline.signal.throwIfAborted();
      if (!uuid.safeParse(eventId).success) throw new AiError("invalid_input");
      const raw = await read();
      if (raw === null) return null;
      const current = contextSchema.safeParse(raw);
      if (!current.success || current.data.eventId !== eventId) throw new AiError("invalid_response");
      return current.data;
    });
    if (context === null) {
      for (const step of ["model.generate", "output.validate", "status.recheck"] as const) flow.skip(step, "stale_context");
      return result("suppressed", "STALE_CONTEXT", flow.finish());
    }
    const { trigger, sourceRevision, exhibitionState, artworkCount, approvedCount, publishedCount } = context;
    const statusId = `status:${trigger}:${sourceRevision}`;
    const output = await flow.step("model.generate", async () => {
      const generated = await abortable(deadline.signal, active => deps.text.generate({
        system: playbookPrompt("ops-notify"),
        schema: notificationJsonSchema,
        input: JSON.stringify({ statusId, trigger, exhibitionState, artworkCount, approvedCount, publishedCount }),
        maxOutputTokens: 1000,
        signal: active,
      }));
      usage.push(generated.trace);
      return generated.output;
    });
    const paragraph = await flow.step("output.validate", () => {
      deadline.signal.throwIfAborted();
      const parsed = outputSchema.safeParse(output);
      if (!parsed.success) throw new AiError("invalid_response");
      const value = parsed.data;
      if (value.outcome === "escalate") {
        if (value.paragraph !== "" || value.citations.length) throw new AiError("invalid_response");
        return null;
      }
      if (!/\p{Script=Hangul}/u.test(value.paragraph) || value.citations.length !== 1 || value.citations[0] !== statusId ||
          unsafeParagraph.test(value.paragraph) || uuidInText.test(value.paragraph) || /\bstatus\s*:/iu.test(value.paragraph)) {
        throw new AiError("invalid_response");
      }
      return value.paragraph;
    });
    const current = await flow.step("status.recheck", async () => {
      const latest = contextSchema.safeParse(await read());
      return latest.success && JSON.stringify(latest.data) === JSON.stringify(context);
    });
    const steps = flow.finish();
    if (signal?.aborted) return result("failed", "REQUEST_CANCELLED", steps);
    if (deadline.timedOut()) return result("failed", "REQUEST_TIMEOUT", steps);
    if (!current) return result("suppressed", "STALE_CONTEXT", steps);
    if (paragraph === null) return result("escalated", "MODEL_ESCALATED", steps);
    return result("processed", "NOTIFICATION_READY", steps,
      { channel: "mail", category: "transactional", body: [heading, paragraph, footer].join("\n\n") });
  } catch (error) {
    if (error instanceof PlaybookOrderError) throw error;
    const reason = signal?.aborted ? new AiError("cancelled") : deadline.timedOut() ? new AiError("timeout") : error;
    return result("failed", normalizeAiOutcome(reason).code, flow.fail(error));
  } finally {
    deadline.dispose();
  }
}
