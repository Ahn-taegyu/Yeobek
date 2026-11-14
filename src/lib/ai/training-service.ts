import "server-only";
import { z } from "zod";
import { rpc, type DbClient } from "../api/db";
import { ApiError } from "../api/errors";
import { decodeDatabase } from "../api/publication";
import { narrationJobResponse } from "../contracts/jobs";
import { trainingBatchResponse, type CreateTrainingBatch, type RunTrainingTarget } from "../contracts/qa";
import { createWorkerSupabase } from "../supabase/worker";
import { runReservedNarration } from "./author-service";
import { expectedQaReservation } from "./expected-qa";
import { runExpectedQa } from "./expected-qa-service";
import { isLocalNarrationMock } from "./runtime";
import { expectedQaStore } from "./stores/expected-qa";

const narrationReservation = z.strictObject({ claimed: z.boolean(), job: narrationJobResponse, context: z.null() });

export async function createTrainingBatch(ownerId: string, exhibitionId: string, input: CreateTrainingBatch, includeExhibitionQa: boolean) {
  const worker = createWorkerSupabase({ timeoutMs: 5000 });
  return decodeDatabase(trainingBatchResponse, await rpc(worker, "create_training_batch", {
    p_owner: ownerId, p_exhibition_id: exhibitionId, p_request_id: input.requestId,
    p_expected_revision: input.expectedRevision, p_include_exhibition_qa: includeExhibitionQa,
  }));
}

export async function loadTrainingBatch(db: DbClient, batchId: string) {
  return decodeDatabase(trainingBatchResponse, await rpc(db, "get_training_batch", { p_batch_id: batchId }));
}

export async function runTrainingTarget(db: DbClient, ownerId: string, batchId: string, targetId: string, input: RunTrainingTarget,
  allowExhibitionQa: boolean, signal?: AbortSignal) {
  const batch = await loadTrainingBatch(db, batchId);
  const target = batch.targets.find(item => item.id === targetId);
  if (!target || (target.scope === "exhibition" && !allowExhibitionQa)) throw new ApiError(404, "NOT_FOUND", "작업을 찾을 수 없습니다.");
  if (signal?.aborted) throw new ApiError(499, "REQUEST_CANCELLED", "요청이 취소되었습니다.");
  const worker = createWorkerSupabase({ timeoutMs: 5000 });
  const claim = () => rpc(worker, "claim_training_target", {
    p_owner: ownerId, p_batch_id: batchId, p_target_id: targetId, p_request_id: input.requestId,
    p_expected_attempt: input.expectedAttempt, p_mock: isLocalNarrationMock(),
  });
  if (target.kind === "expected_qa") {
    const store = expectedQaStore(worker, ownerId);
    await runExpectedQa(ownerId, { reserve: async () => {
      const value = decodeDatabase(expectedQaReservation, await claim());
      if (value.job.exhibitionId !== batch.exhibitionId || value.job.artworkId !== target.artworkId) {
        throw new ApiError(500, "AI_INVALID_CONTEXT", "작업의 대상 정보를 확인하지 못했습니다.");
      }
      return value;
    }, complete: store.complete }, signal);
  } else {
    const value = decodeDatabase(narrationReservation, await claim());
    if (value.job.artworkId !== target.artworkId) throw new ApiError(500, "AI_INVALID_CONTEXT", "작업의 대상 정보를 확인하지 못했습니다.");
    if (value.claimed) await runReservedNarration(db, ownerId, value, signal);
  }
  return loadTrainingBatch(db, batchId);
}
