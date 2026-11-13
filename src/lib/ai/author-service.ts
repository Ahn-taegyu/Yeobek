import "server-only";
import { rpc, type DbClient } from "../api/db";
import { ApiError } from "../api/errors";
import type { AiJob, GenerateNarration, RetryJob } from "../contracts/jobs";
import { createWorkerSupabase } from "../supabase/worker";
import { createAuthorStore } from "./stores/author";
import { createJobStore, JobReplay, loadJob, publicJob } from "./stores/jobs";
import { normalizeAiOutcome } from "./outcome";
import { createNarrationRuntime, isLocalNarrationMock } from "./runtime";

/** Synchronous bounded execution with a persistent lease. A process interruption
 * is recovered through GET/retry; no unawaited background promise is used. */
async function execute(db: DbClient, actorId: string, artworkId: string, documentId: string,
  expectedDocumentRevision: number, strategy: GenerateNarration["strategy"],
  claim: (store: ReturnType<typeof createJobStore>) => Promise<{ job: AiJob; claimed: boolean }>, signal?: AbortSignal) {
  const store = createJobStore(createWorkerSupabase(), actorId);
  let job: AiJob | undefined;
  let completed = false;
  try {
    const runtime = createNarrationRuntime(actorId, createAuthorStore(db, actorId, artworkId), {
      async reserve() {
        const reserved = await claim(store);
        job = reserved.job;
        if (!reserved.claimed) throw new JobReplay(job);
      },
      async complete(result) {
        if (!job) throw new ApiError(500, "INTERNAL_ERROR", "예약된 작업을 찾을 수 없습니다.");
        // Intentionally independent of the cancelled request signal.
        job = await store.complete(job, result, isLocalNarrationMock());
        completed = true;
      },
    });
    await runtime.draft({ documentId, expectedRevision: expectedDocumentRevision, strategy }, signal);
    if (!job || !completed) throw new ApiError(500, "INTERNAL_ERROR", "작업 결과를 저장하지 못했습니다.");
    // SQL can reject stale generated content; persisted status is authoritative.
    return { job: publicJob(job), created: true };
  } catch (error) {
    if (error instanceof JobReplay) return { job: publicJob(error.job), created: false };
    if (error instanceof ApiError) throw error;
    const failure = normalizeAiOutcome(error);
    throw new ApiError(failure.status, failure.code, "해설 작업을 처리하지 못했습니다. 작업 상태를 확인해 주세요.");
  }
}

export async function generateNarration(db: DbClient, actorId: string, artworkId: string, input: GenerateNarration, signal?: AbortSignal) {
  // Read only identity here; the harness validates the fresh context after reservation.
  const raw = await rpc(db, "get_narration_context", { p_artwork_id: artworkId });
  if (!raw || typeof raw !== "object" || Array.isArray(raw) || typeof raw.documentId !== "string") {
    throw new ApiError(500, "INTERNAL_ERROR", "작품 자료를 확인하지 못했습니다.");
  }
  return execute(db, actorId, artworkId, raw.documentId, input.expectedDocumentRevision, input.strategy,
    store => store.reserve(artworkId, input, isLocalNarrationMock()), signal);
}
export async function retryNarration(db: DbClient, actorId: string, id: string, input: RetryJob, signal?: AbortSignal) {
  const job = await loadJob(db, id);
  if (job.kind !== "narration") throw new ApiError(404, "NOT_FOUND", "작업을 찾을 수 없습니다.");
  return execute(db, actorId, job.artworkId, job.documentId, job.expectedDocumentRevision, job.strategy,
    store => store.retry(id, input, isLocalNarrationMock()), signal);
}
