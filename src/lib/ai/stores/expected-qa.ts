import "server-only";
import { rpc, type DbClient } from "../../api/db";
import { decodeDatabase } from "../../api/publication";
import type { RetryJob } from "../../contracts/jobs";
import { expectedQaJobResponse, type ExpectedQaGenerate } from "../../contracts/qa";
import { expectedQaReservation, type ExpectedQaStore } from "../expected-qa";

export async function loadExpectedQaJob(db: DbClient, jobId: string) {
  return decodeDatabase(expectedQaJobResponse, await rpc(db, "get_expected_qa_job", { p_job_id: jobId }));
}

export function expectedQaStore(worker: DbClient, ownerId: string) {
  return {
    async reserve(exhibitionId: string, input: ExpectedQaGenerate, mock: boolean, signal?: AbortSignal) {
      return decodeDatabase(expectedQaReservation, await rpc(worker, "reserve_expected_qa_job", {
        p_owner: ownerId, p_request_id: input.requestId, p_exhibition_id: exhibitionId, p_artwork_id: input.artworkId,
        p_expected_revision: input.expectedRevision, p_expected_document_revision: input.expectedDocumentRevision, p_mock: mock,
      }, signal));
    },
    async retry(jobId: string, input: RetryJob, mock: boolean, signal?: AbortSignal) {
      return decodeDatabase(expectedQaReservation, await rpc(worker, "retry_expected_qa_job", {
        p_owner: ownerId, p_job_id: jobId, p_request_id: input.requestId, p_expected_attempt: input.expectedAttempt, p_mock: mock,
      }, signal));
    },
    complete: (async (job, result) => decodeDatabase(expectedQaJobResponse, await rpc(worker, "complete_expected_qa_job", {
      p_owner: ownerId, p_job_id: job.id, p_attempt: job.attempt, p_result: result,
    }))) satisfies ExpectedQaStore["complete"],
  };
}
