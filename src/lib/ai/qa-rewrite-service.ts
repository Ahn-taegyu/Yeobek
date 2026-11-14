import "server-only";
import { rpc, type DbClient } from "../api/db";
import { ApiError } from "../api/errors";
import { decodeDatabase } from "../api/publication";
import type { RetryJob } from "../contracts/jobs";
import { qaRewriteJobResponse, type QaRewrite } from "../contracts/qa";
import { createWorkerSupabase } from "../supabase/worker";
import { normalizeAiOutcome } from "./outcome";
import { executeQaRewrite, qaRewriteReservation, type QaRewriteStore } from "./qa-rewrite";
import { createConfiguredTextProvider, isLocalNarrationMock } from "./runtime";
import { assertIndependentJudge } from "./routing";

export async function loadQaRewriteJob(db: DbClient, id: string) {
  return decodeDatabase(qaRewriteJobResponse, await rpc(db, "get_qa_rewrite_job", { p_job_id: id }));
}

async function runQaRewrite(ownerId: string, worker: DbClient, reserve: QaRewriteStore["reserve"], signal?: AbortSignal) {
  try {
    return await executeQaRewrite(ownerId, {
      reserve,
      async complete(job, result) {
        return decodeDatabase(qaRewriteJobResponse, await rpc(worker, "complete_qa_rewrite_job", {
          p_owner: ownerId, p_job_id: job.id, p_attempt: job.attempt, p_result: result,
        }));
      },
    }, { generate: input => {
      // Avoid charging a draft call when the independent judge is unavailable.
      assertIndependentJudge();
      createConfiguredTextProvider("judge");
      return createConfiguredTextProvider("draft").generate(input);
    } },
    { generate: input => createConfiguredTextProvider("judge").generate(input) }, signal);
  } catch (error) {
    if (error instanceof ApiError && !signal?.aborted) throw error;
    const failure = normalizeAiOutcome(signal?.aborted ? { status: "abstained", reason: "cancelled" } : error);
    throw new ApiError(failure.status, failure.code, "답변 재작성 상태를 확인해 주세요.");
  }
}

export function rewriteQa(ownerId: string, input: QaRewrite, signal?: AbortSignal) {
  const worker = createWorkerSupabase({ timeoutMs: 5000 });
  return runQaRewrite(ownerId, worker, async activeSignal => decodeDatabase(qaRewriteReservation, await rpc(worker, "reserve_qa_rewrite_job", {
    p_owner: ownerId, p_request_id: input.requestId, p_target_kind: input.targetKind, p_target_id: input.targetId,
    p_target_version: input.targetVersion, p_instruction: input.instruction, p_evidence_pins: input.evidencePins, p_mock: isLocalNarrationMock(),
  }, activeSignal)), signal);
}

export function retryQaRewrite(ownerId: string, jobId: string, input: RetryJob, signal?: AbortSignal) {
  const worker = createWorkerSupabase({ timeoutMs: 5000 });
  return runQaRewrite(ownerId, worker, async activeSignal => decodeDatabase(qaRewriteReservation, await rpc(worker, "retry_qa_rewrite_job", {
    p_owner: ownerId, p_job_id: jobId, p_request_id: input.requestId, p_expected_attempt: input.expectedAttempt, p_mock: isLocalNarrationMock(),
  }, activeSignal)), signal);
}
