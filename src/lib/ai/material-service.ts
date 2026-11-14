import "server-only";
import { z } from "zod";
import { rpc, type DbClient } from "../api/db";
import { decodeDatabase } from "../api/publication";
import { materialReadResponse, type MaterialReadRequest } from "../contracts/material-extraction";
import { materialType, materialByteLimits } from "../contracts/materials";
import { createWorkerSupabase } from "../supabase/worker";
import { downloadMaterialForRead } from "../storage/materials";
import { requireFeature } from "../features";
import { isMockMode } from "./routing";
import { createConfiguredTextProvider } from "./runtime";
import { readMaterial } from "./material-reader";
import { generateProposal } from "./organization-service";
import { createDeadline } from "./deadline";

const reservationSchema = z.object({ read: materialReadResponse, claimed: z.boolean(),
  storageKey: z.string().min(1).nullable(), contentHash: z.string().regex(/^[a-f0-9]{64}$/).nullable(),
  contentType: materialType, byteSize: z.number().int().min(1).max(materialByteLimits.pdf),
  maxPages: z.number().int().min(1).max(20) });

/** A user POST is the only entry point. Polls and uploads never invoke this. */
export async function extractMaterial(db: DbClient, ownerId: string, materialId: string, input: MaterialReadRequest, signal?: AbortSignal) {
  requireFeature("materialExtraction");
  const deadline = createDeadline(130_000, signal);
  try { return await executeMaterialRead(db, ownerId, materialId, input, deadline.signal); }
  finally { deadline.dispose(); }
}

async function executeMaterialRead(db: DbClient, ownerId: string, materialId: string, input: MaterialReadRequest, signal: AbortSignal) {
  const worker = createWorkerSupabase({ timeoutMs: 5000 });
  const mock = isMockMode();
  const reservation = decodeDatabase(reservationSchema, await rpc(worker, "reserve_material_read", {
    p_owner: ownerId, p_request_id: input.requestId, p_material_id: materialId, p_expected_version: input.expectedVersion,
    p_document_id: input.documentId, p_expected_document_revision: input.expectedDocumentRevision, p_mock: mock,
  }));
  let read = reservation.read;
  if (reservation.claimed) {
    let result: Awaited<ReturnType<typeof readMaterial>> | undefined;
    try {
      signal?.throwIfAborted();
      if (!reservation.storageKey || !reservation.contentHash || read.mock !== mock) throw new Error("Invalid read reservation");
      const bytes = await downloadMaterialForRead(worker, reservation.storageKey, reservation.byteSize, reservation.contentHash);
      result = await readMaterial({ media: { contentType: reservation.contentType, data: bytes },
        pageCount: read.pageCount, maxPages: reservation.maxPages }, () => createConfiguredTextProvider("material"), signal);
    } catch {
      // Never serialize file bytes, extracted text or provider exceptions into logs.
      // Failed/uncertain reads remain terminal: replay cannot cause a second charge.
    }
    read = decodeDatabase(materialReadResponse, await rpc(worker, "complete_material_read", {
      p_owner: ownerId, p_request_id: input.requestId, p_read_id: read.id,
      p_method: result?.method ?? null, p_chunks: result?.chunks ?? [],
      p_result_code: result ? result.chunks.length ? "OK" : "EMPTY" : "READ_FAILED",
    }));
  }
  // A cached read can recover the second step after a lost response. Existing W2
  // idempotency handles the same request ID; no candidate is auto-applied.
  if (read.status !== "succeeded" || read.chunkCount === 0) return { read, proposalJob: null };
  const proposal = await generateProposal(db, ownerId, input.documentId,
    { requestId: input.requestId, expectedDocumentRevision: input.expectedDocumentRevision }, signal);
  return { read, proposalJob: proposal.job };
}
