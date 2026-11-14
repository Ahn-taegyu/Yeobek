import { z } from "zod";
import { uuid, revision } from "./requests";
import { organizeJobResponse } from "./jobs";

export const materialReadRequest = z.strictObject({ requestId: uuid, documentId: uuid,
  expectedVersion: revision, expectedDocumentRevision: revision, consentToRead: z.literal(true) });
export const materialReadResponse = z.strictObject({ id: uuid,
  status: z.enum(["running", "succeeded", "failed", "purged"]), mock: z.boolean(),
  pageCount: z.number().int().min(1).max(20), chunkCount: z.number().int().min(0).max(60),
  method: z.enum(["text_pdf", "vision"]).nullable(),
  resultCode: z.enum(["OK", "EMPTY", "READ_FAILED", "SOURCE_CHANGED", "EXPIRED"]).nullable() });
export const materialExtractionResponse = z.strictObject({ read: materialReadResponse, proposalJob: organizeJobResponse.nullable() });
export type MaterialReadRequest = z.infer<typeof materialReadRequest>;
