import "server-only";
import { rpc, type DbClient } from "../api/db";
import { ApiError } from "../api/errors";
import { decodeDatabase } from "../api/publication";
import { previewAnswerResponse, previewEvaluationResponse, type PreviewChat, type PreviewEvaluation } from "../contracts/qa";
import { createWorkerSupabase } from "../supabase/worker";
import { normalizeAiOutcome } from "./outcome";
import { executePreview, previewReservation } from "./preview";
import { createConfiguredTextProvider, isLocalNarrationMock } from "./runtime";

export async function loadPreviewAnswer(db: DbClient, id: string) {
  return decodeDatabase(previewAnswerResponse, await rpc(db, "get_preview_answer", { p_answer_id: id }));
}

export async function recordPreviewEvaluation(db: DbClient, id: string, input: PreviewEvaluation) {
  return decodeDatabase(previewEvaluationResponse, await rpc(db, "record_preview_evaluation", {
    p_answer_id: id, p_request_id: input.requestId, p_rating: input.rating,
  }));
}

export async function answerPreview(ownerId: string, exhibitionId: string, input: PreviewChat, signal?: AbortSignal) {
  const worker = createWorkerSupabase({ timeoutMs: 5000 });
  try {
    return await executePreview(ownerId, {
      async reserve(activeSignal) {
        return decodeDatabase(previewReservation, await rpc(worker, "reserve_preview_answer", {
          p_owner: ownerId, p_request_id: input.requestId, p_exhibition_id: exhibitionId,
          p_artwork_id: input.artworkId, p_question: input.question, p_mock: isLocalNarrationMock(),
        }, activeSignal));
      },
      async complete(job, result) {
        return decodeDatabase(previewAnswerResponse, await rpc(worker, "complete_preview_answer", {
          p_owner: ownerId, p_answer_id: job.id, p_attempt: job.attempt, p_result: result,
        }));
      },
    }, { generate: input => createConfiguredTextProvider("qa").generate(input) }, signal);
  } catch (error) {
    if (error instanceof ApiError && !signal?.aborted) throw error;
    const failure = normalizeAiOutcome(signal?.aborted ? { status: "abstained", reason: "cancelled" } : error);
    throw new ApiError(failure.status, failure.code, "미리보기 답변 상태를 확인해 주세요.");
  }
}
