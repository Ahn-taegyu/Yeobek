import "server-only";
import { z } from "zod";
import { rpc, type DbClient } from "../api/db";
import { ApiError } from "../api/errors";
import { decodeDatabase } from "../api/publication";
import { organizeJobResponse, type OrganizeJob, type RetryJob } from "../contracts/jobs";
import type { GenerateProposal } from "../contracts/proposals";
import { createWorkerSupabase } from "../supabase/worker";
import { createProposalStore } from "./stores/proposals";
import { loadJob } from "./stores/jobs";
import { createArtistKnowledgeRuntime } from "./runtime";
import { isMockMode } from "./routing";
import { normalizeAiOutcome } from "./outcome";

const reservation = z.object({ job: organizeJobResponse, claimed: z.boolean(), proposalExpiresAt: z.number().int().positive() });
type Reservation = z.infer<typeof reservation>;
class ProposalReplay extends Error {
  constructor(readonly job: OrganizeJob) { super("Proposal job replay"); }
}

async function execute(db: DbClient, actorId: string, documentId: string, expectedRevision: number,
  claim: (worker: DbClient, mock: boolean) => Promise<unknown>, signal?: AbortSignal) {
  const mock = isMockMode();
  const worker = createWorkerSupabase({ timeoutMs: 5000 });
  const proposals = createProposalStore(db, actorId);
  let active: Reservation | undefined;
  let saved: OrganizeJob | undefined;
  const runtime = createArtistKnowledgeRuntime(actorId, proposals.store, {
    async reserve() {
      active = decodeDatabase(reservation, await claim(worker, mock));
      if (!active.claimed) throw new ProposalReplay(active.job);
      if (active.job.mock !== mock || active.job.documentId !== documentId) throw new ApiError(500, "INTERNAL_ERROR", "정리 작업을 확인하지 못했습니다.");
    },
    async complete(result) {
      if (!active?.claimed) throw new ApiError(500, "INTERNAL_ERROR", "예약된 작업을 찾을 수 없습니다.");
      if (result.proposal && JSON.stringify(result.proposal) !== JSON.stringify(proposals.staged())) {
        throw new ApiError(500, "INTERNAL_ERROR", "정리 후보를 확인하지 못했습니다.");
      }
      const outcome = result.failure ?? { code: result.proposal ? "OK" : "EVIDENCE_REQUIRED", routing: result.proposal ? "none" : "author" };
      // This awaited commit is independent of the request's abort signal.
      saved = decodeDatabase(organizeJobResponse, await rpc(worker, "complete_organize_job", {
        p_owner: actorId, p_job_id: active.job.id, p_attempt: active.job.attempt,
        p_result: { proposal: result.proposal, resultCode: outcome.code, routing: outcome.routing,
          usage: result.usage, steps: result.steps, elapsedMs: result.elapsedMs, mock },
      }));
    },
  }, () => {
    if (!active?.claimed) throw new ApiError(500, "INTERNAL_ERROR", "예약된 작업을 찾을 수 없습니다.");
    return { id: active.job.id, expiresAt: active.proposalExpiresAt };
  });
  try {
    await runtime.propose({ documentId, expectedRevision }, signal);
  } catch (error) {
    if (error instanceof ProposalReplay) return { job: error.job, created: false };
    // Failed generations are still durable job results for the author to inspect.
    if (!saved) {
      if (error instanceof ApiError) throw error;
      const failure = normalizeAiOutcome(error);
      throw new ApiError(failure.status, failure.code, "정리 작업을 처리하지 못했습니다. 작업 상태를 확인해 주세요.");
    }
  }
  if (!saved) throw new ApiError(500, "INTERNAL_ERROR", "정리 결과를 저장하지 못했습니다.");
  return { job: saved, created: true };
}

export function generateProposal(db: DbClient, actorId: string, documentId: string, input: GenerateProposal, signal?: AbortSignal) {
  return execute(db, actorId, documentId, input.expectedDocumentRevision, (worker, mock) => rpc(worker, "reserve_organize_job", {
    p_owner: actorId, p_request_id: input.requestId, p_document_id: documentId,
    p_expected_document_revision: input.expectedDocumentRevision, p_mock: mock,
  }), signal);
}
export async function retryOrganization(db: DbClient, actorId: string, id: string, input: RetryJob, signal?: AbortSignal) {
  const job = await loadJob(db, id);
  if (job.kind !== "organize") throw new ApiError(404, "NOT_FOUND", "작업을 찾을 수 없습니다.");
  return execute(db, actorId, job.documentId, job.expectedDocumentRevision, (worker, mock) => rpc(worker, "retry_organize_job", {
    p_owner: actorId, p_job_id: id, p_request_id: input.requestId, p_expected_attempt: input.expectedAttempt, p_mock: mock,
  }), signal);
}
export async function applyProposal(db: DbClient, actorId: string, id: string, signal?: AbortSignal) {
  try {
    const runtime = createArtistKnowledgeRuntime(actorId, createProposalStore(db, actorId).store);
    const { documentRevision } = await runtime.apply({ proposalId: id, reviewed: true }, signal);
    return { documentRevision };
  } catch (error) {
    if (error instanceof ApiError) throw error;
    const failure = normalizeAiOutcome(error);
    throw new ApiError(failure.status, failure.code, "정리 후보를 적용하지 못했습니다. 자료 상태를 확인해 주세요.");
  }
}
