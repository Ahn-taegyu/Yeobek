import "server-only";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { rpc } from "../api/db";
import { decodeDatabase } from "../api/publication";
import { createWorkerSupabase } from "../supabase/worker";
import { createDeadline } from "../ai/deadline";
import { createConfiguredTextProvider } from "../ai/runtime";
import { isMockMode } from "../ai/routing";
import { normalizeAiOutcome } from "../ai/outcome";
import { AUTOMATION_RUNTIME_LIMITS } from "../policy";
import { createMockAutomationAdapters } from "./adapters/mock";
import { createStibeeAdapter } from "./adapters/stibee";
import { dispatchOutbox } from "./dispatch";
import { runNotification } from "./notification";
import { AutomationError } from "./errors";
import type { MailPort } from "./ports";

const count = z.number().int().nonnegative();
const settingsSchema = z.object({ signals: count.min(1).max(100), events: count.min(1).max(100), dispatch: count.min(1).max(100) });
const claimSchema = z.object({ id: z.uuid(), kind: z.literal("notify"), attempt: count.min(1), mock: z.boolean() });
const reservationSchema = z.object({ jobId: z.uuid().nullable(), attempt: count.min(1), claimed: z.boolean() });

/** Trusted cron entry only. Model output never chooses a recipient or database scope. */
export async function runNotificationBatch(signal?: AbortSignal) {
  const mock = isMockMode(); // Reject production mock before touching queues.
  const worker = createWorkerSupabase({ timeoutMs: AUTOMATION_RUNTIME_LIMITS.rpcMs });
  const token = randomUUID();
  const raw = await rpc(worker, "acquire_notification_run", { p_token: token, p_mock: mock });
  const summary = { mock, busy: raw === null, dispatchReady: false, scheduled: 0, discarded: 0, processed: 0, suppressed: 0,
    escalated: 0, failed: 0, persistenceFailures: 0,
    dispatch: { claimed: 0, accepted: 0, rejected: 0, unknown: 0, failed: 0, skipped: 0, persistenceFailures: 0 } };
  if (raw === null) return summary;
  const deadline = createDeadline(AUTOMATION_RUNTIME_LIMITS.deadlineMs, signal);
  let mayRelease = true;
  try {
    const settings = decodeDatabase(settingsSchema, raw);
    const scheduled = decodeDatabase(z.object({ scheduled: count, discarded: count }), await rpc(worker,
      "schedule_automation_notifications", { p_limit: settings.signals, p_mock: mock }));
    Object.assign(summary, scheduled);
    const generation = createDeadline(AUTOMATION_RUNTIME_LIMITS.generationMs, deadline.signal);
    try {
      for (let index = 0; index < settings.events && !generation.signal.aborted; index++) {
        const claims = decodeDatabase(z.array(claimSchema).max(1), await rpc(worker,
          "claim_automation_notifications", { p_limit: 1, p_mock: mock }));
        const event = claims[0];
        if (!event) break;
        if (event.mock !== mock) throw new AutomationError("invalid_response");
        let jobId: string | null = null;
        try {
          const reserved = decodeDatabase(reservationSchema, await rpc(worker, "reserve_automation_job", {
            p_event_id: event.id, p_event_attempt: event.attempt, p_mock: mock,
          }));
          if (!reserved.claimed || !reserved.jobId) continue;
          jobId = reserved.jobId;
          const result = await runNotification(event.id, {
            // Lazy configuration preserves a failed job record if keys are missing.
            text: { generate: input => createConfiguredTextProvider("automation").generate(input) },
            readContext: () => rpc(worker, "get_notification_context", {
              p_event_id: event.id, p_attempt: event.attempt, p_mock: mock,
            }),
          }, generation.signal);
          const completed = decodeDatabase(z.object({ event: z.object({ state: z.enum(["processed", "suppressed", "failed", "escalated"]) }) }),
            await rpc(worker, "complete_automation_job", { p_event_id: event.id, p_job_id: jobId,
            p_attempt: event.attempt, p_state: result.state, p_result_code: result.resultCode,
            p_outbound: result.outbound, p_usage: result.usage, p_steps: result.steps, p_elapsed_ms: Math.round(result.elapsedMs) }));
          summary[completed.event.state]++;
        } catch (error) {
          // A completion transport failure might have committed. Do not submit
          // a contradictory result or regenerate within this cron execution.
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
      // Construct exclusively from server mode. A mock response check after a
      // real send would be too late to enforce this boundary.
      let mail: MailPort;
      try {
        mail = mock ? createMockAutomationAdapters().mail : createStibeeAdapter({
          apiKey: process.env.STIBEE_API_KEY ?? "", paragraphField: process.env.STIBEE_PARAGRAPH_FIELD ?? "yeobek_paragraph",
          templates: { transactional: process.env.STIBEE_TRANSACTIONAL_URL ?? "", marketing: process.env.STIBEE_MARKETING_URL ?? "" },
        });
      } catch (error) {
        if (error instanceof AutomationError && error.code === "not_configured") return summary;
        throw error;
      }
      summary.dispatchReady = true;
      mayRelease = false;
      summary.dispatch = await dispatchOutbox({ mail,
        support: { async reply() { throw new AutomationError("invalid_input"); } },
        store: {
          claim: (limit, mode) => rpc(worker, "claim_notification_outbound", { p_limit: limit, p_mock: mode }),
          check: (id, attempt, mode) => rpc(worker, "check_notification_dispatch", {
            p_id: id, p_attempt: attempt, p_mock: mode, p_token: token,
          }),
          complete: (id, attempt, status, providerId, code) => rpc(worker, "complete_notification_dispatch", {
            p_id: id, p_attempt: attempt, p_status: status, p_provider_id: providerId, p_result_code: code,
            p_mock: mock, p_token: token,
          }),
        },
      }, { limit: settings.dispatch, mock, deadlineMs: AUTOMATION_RUNTIME_LIMITS.deadlineMs, signal: deadline.signal });
      mayRelease = summary.dispatch.persistenceFailures === 0;
    }
    return summary;
  } finally {
    deadline.dispose();
    // Independent timeout allows one finite cleanup even when HTTP was aborted.
    try { if (mayRelease)
      await rpc(worker, "release_notification_run", { p_token: token, p_mock: mock }); }
    catch { summary.persistenceFailures++; }
  }
}
