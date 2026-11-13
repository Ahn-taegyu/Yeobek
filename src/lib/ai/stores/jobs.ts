import "server-only";
import { z } from "zod";
import { rpc, type DbClient } from "../../api/db";
import { ApiError } from "../../api/errors";
import { jobResponse, type AiJob, type GenerateNarration, type RetryJob } from "../../contracts/jobs";
import { getFeatures } from "../../features";
import type { NarrationResult } from "../narration";
import { normalizeAiOutcome } from "../outcome";

function parseStored<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) throw new ApiError(500, "INTERNAL_ERROR", "저장된 작업을 확인하지 못했습니다.");
  return result.data;
}
/** A setting change also hides follow-up questions on previously saved jobs. */
export function publicJob(job: AiJob): AiJob {
  if (!job.result?.selected.followUpQuestions) return job;
  // A malformed flag hides the optional field without blocking a persisted replay.
  try { if (getFeatures().followUpQuestions) return job; } catch { /* Hide optional content on invalid settings. */ }
  const { answer, citations } = job.result.selected;
  const selected = { answer, citations };
  return { ...job, result: { ...job.result, selected } };
}
export async function loadJob(db: DbClient, id: string) {
  return parseStored(jobResponse, await rpc(db, "get_ai_job", { p_job_id: id }));
}
export class JobReplay extends Error {
  constructor(readonly job: AiJob) { super("Job request replay"); }
}
export function createJobStore(worker: DbClient, actorId: string) {
  const reservation = z.object({ job: jobResponse, claimed: z.boolean() });
  return {
    async reserve(artworkId: string, input: GenerateNarration, mock: boolean) {
      return parseStored(reservation, await rpc(worker, "reserve_ai_job", {
        p_owner: actorId, p_artwork_id: artworkId, p_request_id: input.requestId,
        p_expected_revision: input.expectedRevision, p_expected_document_revision: input.expectedDocumentRevision,
        p_strategy: input.strategy, p_mock: mock,
      }));
    },
    async retry(id: string, input: RetryJob, mock: boolean) {
      return parseStored(reservation, await rpc(worker, "retry_ai_job", {
        p_owner: actorId, p_job_id: id, p_request_id: input.requestId, p_expected_attempt: input.expectedAttempt, p_mock: mock,
      }));
    },
    async complete(job: AiJob, result: NarrationResult, mock: boolean) {
      const outcome = result.status === "selected" ? { code: "OK", routing: "none" } : result.failure ?? normalizeAiOutcome(result);
      return parseStored(jobResponse, await rpc(worker, "complete_ai_job", {
        p_owner: actorId, p_job_id: job.id, p_attempt: job.attempt,
        p_result: {
          status: result.status, reason: result.reason, selected: result.selected,
          promptVersion: result.promptVersion, mock, resultCode: outcome.code, routing: outcome.routing,
          elapsedMs: Math.round(result.metrics.elapsedMs),
          // Metrics contain provider/model/token counts, never input or candidate bodies.
          usage: result.metrics.calls, steps: result.steps,
        },
      }));
    },
  };
}
