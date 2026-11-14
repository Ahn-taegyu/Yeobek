import "server-only";
import { ApiError } from "../api/errors";
import type { RetryJob } from "../contracts/jobs";
import type { ExpectedQaGenerate } from "../contracts/qa";
import { createWorkerSupabase } from "../supabase/worker";
import { executeExpectedQa, type ExpectedQaStore } from "./expected-qa";
import { normalizeAiOutcome } from "./outcome";
import { createConfiguredTextProvider, isLocalNarrationMock } from "./runtime";
import { expectedQaStore } from "./stores/expected-qa";

export async function runExpectedQa(ownerId: string, store: ExpectedQaStore, signal?: AbortSignal) {
  try {
    return await executeExpectedQa(ownerId, store, { generate: input => createConfiguredTextProvider("qa").generate(input) }, signal);
  } catch (error) {
    if (error instanceof ApiError && !signal?.aborted) throw error;
    const failure = normalizeAiOutcome(signal?.aborted ? { status: "abstained", reason: "cancelled" } : error);
    throw new ApiError(failure.status, failure.code, "예상 질문 작업을 처리하지 못했습니다. 작업 상태를 확인해 주세요.");
  }
}

export function generateExpectedQa(ownerId: string, exhibitionId: string, input: ExpectedQaGenerate, signal?: AbortSignal) {
  const store = expectedQaStore(createWorkerSupabase({ timeoutMs: 5000 }), ownerId);
  return runExpectedQa(ownerId, {
    reserve: activeSignal => store.reserve(exhibitionId, input, isLocalNarrationMock(), activeSignal), complete: store.complete,
  }, signal);
}

export function retryExpectedQa(ownerId: string, jobId: string, input: RetryJob, signal?: AbortSignal) {
  const store = expectedQaStore(createWorkerSupabase({ timeoutMs: 5000 }), ownerId);
  return runExpectedQa(ownerId, {
    reserve: activeSignal => store.retry(jobId, input, isLocalNarrationMock(), activeSignal), complete: store.complete,
  }, signal);
}
