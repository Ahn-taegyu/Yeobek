import "server-only";
import { z } from "zod";
import { createWorkerSupabase } from "../supabase/worker";
import { rpc } from "../api/db";
import { decodeDatabase } from "../api/publication";
import { createDeadline } from "../ai/deadline";
import { isMockMode } from "../ai/routing";
import { createConfiguredTextProvider } from "../ai/runtime";
import { normalizeAiOutcome } from "../ai/outcome";
import { AUTOMATION_RUNTIME_LIMITS } from "../policy";
import { channelIdentifier } from "../contracts/support";
import { createConfiguredSupportPort } from "./channel-runtime";
import { runSupportReply } from "./support";
import { dispatchOutbox } from "./dispatch";
import { AutomationError } from "./errors";
import type { SupportPort } from "./ports";

const claimSchema = z.object({ id: z.uuid(), kind: z.literal("support"), attempt: z.number().int().positive(), mock: z.boolean() });
const reservationSchema = z.object({ jobId: z.uuid().nullable(), attempt: z.number().int().positive(), claimed: z.boolean() });

/** Inbox and outbox leases protect concurrent cron workers. Only DB-pinned
 * destinations reach the provider; neither question nor model chooses a chat. */
export async function runSupportBatch(signal?: AbortSignal) {
  const mock = isMockMode();
  const summary = { mock, dispatchReady: false, processed: 0, suppressed: 0, escalated: 0, failed: 0, persistenceFailures: 0,
    dispatch: { claimed: 0, accepted: 0, rejected: 0, unknown: 0, failed: 0, skipped: 0, persistenceFailures: 0 } };
  const channelId = process.env.CHANNEL_TALK_CHANNEL_ID;
  if (!channelIdentifier.safeParse(channelId).success) return summary;
  const channel = channelId!;
  const worker = createWorkerSupabase({ timeoutMs: AUTOMATION_RUNTIME_LIMITS.rpcMs });
  const policy = decodeDatabase(z.array(z.object({ key: z.string(), value: z.number().int().min(1).max(2147483647) })),
    (await worker.from("app_policies").select("key,value").in("key", ["automation_batch_events", "automation_batch_dispatch"])).data);
  const settings = new Map(policy.map(row => [row.key, Math.min(100, row.value)]));
  if (settings.size !== 2) throw new AutomationError("not_configured");
  const deadline = createDeadline(AUTOMATION_RUNTIME_LIMITS.deadlineMs, signal);
  try {
    const generation = createDeadline(AUTOMATION_RUNTIME_LIMITS.generationMs, deadline.signal);
    try {
      for (let index = 0; index < settings.get("automation_batch_events")! && !generation.signal.aborted; index++) {
        const claims = decodeDatabase(z.array(claimSchema).max(1), await rpc(worker, "claim_support_events", {
          p_limit: 1, p_mock: mock, p_channel_id: channel,
        }));
        const event = claims[0];
        if (!event) break;
        if (event.mock !== mock) throw new AutomationError("invalid_response");
        let jobId: string | null = null;
        let revision: string | null = null;
        try {
          const reserved = decodeDatabase(reservationSchema, await rpc(worker, "reserve_automation_job", {
            p_event_id: event.id, p_event_attempt: event.attempt, p_mock: mock,
          }));
          if (!reserved.claimed || !reserved.jobId) continue;
          jobId = reserved.jobId;
          const result = await runSupportReply(event.id, {
            text: { generate: input => createConfiguredTextProvider("automation").generate(input) },
            readContext: async () => {
              const context = await rpc(worker, "get_support_context", { p_event_id: event.id, p_attempt: event.attempt, p_mock: mock });
              if (revision === null && context && typeof context === "object" && !Array.isArray(context) && typeof context.revision === "string") {
                revision = context.revision;
              }
              return context;
            },
          }, generation.signal);
          const completed = decodeDatabase(z.object({ event: z.object({ state: z.enum(["processed", "suppressed", "failed", "escalated"]) }) }),
            await rpc(worker, "complete_support_job", {
              p_event_id: event.id, p_job_id: jobId, p_attempt: event.attempt, p_mock: mock, p_context_revision: revision,
              p_state: result.state, p_result_code: result.resultCode, p_body: result.outbound?.body ?? null,
              p_category: result.outbound?.category ?? null, p_usage: result.usage, p_steps: result.steps, p_elapsed_ms: result.elapsedMs,
            }));
          summary[completed.event.state]++;
        } catch (error) {
          if (jobId) summary.persistenceFailures++;
          else {
            try { await rpc(worker, "complete_automation_event", { p_id: event.id, p_attempt: event.attempt,
              p_state: "failed", p_result_code: normalizeAiOutcome(error).code, p_outbound: null }); }
            catch { summary.persistenceFailures++; }
          }
          summary.failed++;
        }
      }
    } finally { generation.dispose(); }
    if (!deadline.signal.aborted) {
      let support: SupportPort;
      try { support = createConfiguredSupportPort(channel); }
      catch (error) { if (error instanceof AutomationError && error.code === "not_configured") return summary; throw error; }
      summary.dispatchReady = true;
      summary.dispatch = await dispatchOutbox({ support,
        mail: { async send() { throw new AutomationError("invalid_input"); } },
        store: {
          claim: (limit, mode) => rpc(worker, "claim_support_outbound", { p_limit: limit, p_mock: mode, p_channel_id: channel }),
          check: (id, attempt, mode) => rpc(worker, "check_outbound_dispatch", { p_id: id, p_attempt: attempt, p_mock: mode }),
          complete: (id, attempt, status, providerId, resultCode) => rpc(worker, "complete_outbound_message", {
            p_id: id, p_attempt: attempt, p_status: status, p_provider_id: providerId, p_result_code: resultCode,
          }),
        },
      }, { limit: settings.get("automation_batch_dispatch")!, deadlineMs: AUTOMATION_RUNTIME_LIMITS.deadlineMs, mock, signal: deadline.signal });
    }
    return summary;
  } finally { deadline.dispose(); }
}
