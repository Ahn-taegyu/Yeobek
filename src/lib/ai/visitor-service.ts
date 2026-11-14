import "server-only";
import type { z } from "zod";
import { ApiError } from "../api/errors";
import { visitorChatRequest, savedVisitorReply, type SavedVisitorReply } from "../contracts/visitor";
import { getFeatures } from "../features";
import { createWorkerSupabase } from "../supabase/worker";
import { textHash } from "./context";
import { abortable, createDeadline } from "./deadline";
import { normalizeAiOutcome } from "./outcome";
import { AiError } from "./errors";
import { DOCENT_COPY } from "./plugin";
import { getPlaybookFailureSteps } from "./playbook";
import { createDocentRuntime } from "./runtime";
import { isMockMode } from "./routing";
import { createPublicationStore } from "./stores/publications";
import { createSpeechSourceStore, createVisitorStore, VisitorReplay, type VisitorReservation } from "./stores/visitor";
import type { AiProviderTrace } from "./providers/types";

function persistedFailure(reservation: VisitorReservation): never {
  const code = reservation.failureCode;
  if (code === "CONTENT_CHANGED" || code === "NOT_FOUND") throw new ApiError(404, "NOT_FOUND", "공개 상태가 바뀌었습니다. 작품을 다시 선택해 주세요.");
  const statuses: Record<string, number> = { REQUEST_TIMEOUT: 504, SERVER_CONFIGURATION_ERROR: 503,
    REQUEST_CANCELLED: 499, RATE_LIMITED: 429, PROVIDER_UNAVAILABLE: 503, AI_INVALID_OUTPUT: 502,
    AI_GENERATION_FAILED: 502, AI_INVALID_CONTEXT: 500, INTERNAL_ERROR: 500, INVALID_INPUT: 400, REVISION_CONFLICT: 409 };
  if (code && Object.hasOwn(statuses, code)) throw new ApiError(statuses[code], code, DOCENT_COPY.systemError);
  throw new ApiError(502, "AI_GENERATION_FAILED", DOCENT_COPY.systemError);
}
export function publicVisitorReply(reply: SavedVisitorReply, gapsEnabled: boolean) {
  const { gapRecorded, ...base } = reply;
  return { ...base, ...(gapsEnabled ? { gapRecorded: gapRecorded === true,
    ...(gapRecorded ? { notice: DOCENT_COPY.gapRecorded } : {}) } : {}) };
}

/** Model input is ephemeral. Only insufficient-evidence questions enter qa_gaps.
 * Within answer retention, retries replay saved results and never spend twice. */
export async function answerVisitor(input: z.infer<typeof visitorChatRequest>, sessionHash: string, signal?: AbortSignal) {
  const mock = isMockMode();
  const features = getFeatures();
  const worker = createWorkerSupabase({ timeoutMs: 5000 });
  const store = createVisitorStore(worker, sessionHash);
  const publications = createPublicationStore(worker);
  const deadline = createDeadline(75_000, signal);
  const startedAt = performance.now();
  const usage: AiProviderTrace[] = [];
  const elapsedMs = () => Math.min(300_000, Math.round(performance.now() - startedAt));
  let reservation: VisitorReservation | undefined;
  let stored = false;
  const interrupted = () => deadline.timedOut() ? new AiError("timeout") : new AiError("cancelled");
  let settlement: Promise<unknown> | undefined;
  const settleFailure = (code: string) => {
    if (!reservation || stored || reservation.status !== "running") return Promise.resolve();
    return settlement ??= store.complete(reservation.id, null, code).catch(() => {
      // A process/DB outage is recovered by the persisted lease, never another model call.
      console.error("visitor_settlement_failure", { requestId: input.requestId });
    });
  };
  const recordGap = async () => {
    if (!features.gaps || !reservation) return;
    // Feature state is a trusted service argument, checked atomically with the write.
    await store.recordGap(input.requestId, input.question, features.gaps);
  };
  const loadPublic = async () => {
    if (!reservation) throw new ApiError(500, "INTERNAL_ERROR", DOCENT_COPY.systemError);
    return publicVisitorReply(await store.load(reservation.id), features.gaps);
  };
  try {
    const runtime = createDocentRuntime(publications, createSpeechSourceStore(worker, sessionHash), {
      async reserve(request) {
        reservation = await store.reserve(request.exhibitionId, request.requestId, textHash(JSON.stringify(input)), mock);
        if (!reservation.claimed) throw new VisitorReplay(reservation);
        if (deadline.signal.aborted) {
          await settleFailure(normalizeAiOutcome(interrupted()).code);
          throw interrupted();
        }
      },
      async store(reply) {
        if (!reservation) throw new ApiError(500, "INTERNAL_ERROR", DOCENT_COPY.systemError);
        const { answer, citations, outcome, publication, source, requestId, contextSequence, inputMode, outputMode } = reply;
        const result = savedVisitorReply.parse({ answerId: reservation.id, answer, citations, outcome, publication,
          source, requestId, contextSequence, inputMode, outputMode, mock });
        reservation = await store.complete(reservation.id, result);
        if (reservation.status !== "succeeded") persistedFailure(reservation);
        stored = true;
      },
      ...(features.gaps ? { async recordGap() { await recordGap(); return true; } } : {}),
    }, trace => { usage.push(trace); });
    const result = await abortable(deadline.signal, current => runtime.answer(input, current));
    if (!reservation || !stored) throw new ApiError(500, "INTERNAL_ERROR", DOCENT_COPY.systemError);
    try { await store.recordExecution(reservation.id, result.steps, usage, elapsedMs()); }
    catch { console.error("visitor_metadata_failure", { requestId: input.requestId }); }
    return await loadPublic();
  } catch (error) {
    if (error instanceof VisitorReplay) {
      if (error.reservation.status === "running") throw new ApiError(409, "REQUEST_IN_PROGRESS", "답변을 준비하고 있습니다. 같은 요청으로 잠시 후 확인해 주세요.", undefined, 2);
      if (error.reservation.status === "failed") persistedFailure(error.reservation);
      // A process may have stopped after answer.store but before gap.record.
      const saved = await store.load(error.reservation.id);
      if (saved.outcome === "insufficient_evidence" && saved.publication?.artworkId && !saved.gapRecorded) {
        try { await recordGap(); }
        catch { console.error("visitor_gap_failure", { requestId: input.requestId }); }
      }
      return await loadPublic();
    }
    const failure = normalizeAiOutcome(deadline.signal.aborted ? interrupted() : error);
    if (reservation?.claimed && !stored && reservation.status === "running") {
      // Complete independently of cancellation so a failed request releases its lease.
      await settleFailure(failure.code);
    }
    if (reservation) {
      const steps = getPlaybookFailureSteps(error);
      if (steps) {
        try { await store.recordExecution(reservation.id, steps, usage, elapsedMs()); }
        catch { console.error("visitor_metadata_failure", { requestId: input.requestId }); }
      }
    }
    if (stored && !deadline.signal.aborted) {
      // A gap-write outage must not hide an answer already saved successfully.
      console.error("visitor_gap_failure", { requestId: input.requestId });
      return await loadPublic();
    }
    if (error instanceof ApiError && !deadline.signal.aborted) throw error;
    throw new ApiError(failure.status, failure.code, DOCENT_COPY.systemError);
  } finally { deadline.dispose(); }
}
