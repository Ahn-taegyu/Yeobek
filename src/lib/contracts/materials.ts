import { z } from "zod";
import { boundedText } from "./chat";

const id = z.uuid().toLowerCase();
const version = z.number().int().positive().max(2147483647);
export const materialType = z.enum(["image/jpeg", "image/png", "image/webp", "application/pdf"]);
export const materialSubject = z.enum(["artist", "exhibition", "artwork"]);
export const requestUploadSchema = z.strictObject({
  id, subjectType: materialSubject, subjectId: id, kind: z.enum(["image", "pdf"]),
  filename: boundedText(255).refine(value => !/[/\\\p{Cc}]/u.test(value)),
  contentType: materialType, byteSize: z.number().int().min(1).max(50 * 1024 * 1024),
});
export const completeUploadSchema = z.strictObject({ expectedVersion: version });
export const deleteMaterialSchema = z.strictObject({ expectedVersion: version });
export const deleteArtworkSchema = z.strictObject({ expectedRevision: version });
export const deletedArtworkResponse = z.strictObject({ id, revision: version, deletedAt: z.iso.datetime({ offset: true }) });
export const setArtworkImageSchema = z.strictObject({ expectedRevision: version, materialId: id.nullable() });
export const materialResponse = z.strictObject({
  id, subjectType: materialSubject, subjectId: id, kind: z.enum(["image", "pdf", "text"]),
  state: z.enum(["pending", "ready", "revoked"]), filename: z.string().nullable(), contentType: z.string().nullable(),
  byteSize: z.number().int().nonnegative().nullable(), version,
  pages: z.number().int().positive().nullable(), width: z.number().int().positive().nullable(), height: z.number().int().positive().nullable(),
  createdAt: z.iso.datetime({ offset: true }), updatedAt: z.iso.datetime({ offset: true }),
  deletedAt: z.iso.datetime({ offset: true }).nullable(), cleanupPending: z.boolean(),
});
export const uploadResponse = z.strictObject({
  material: materialResponse,
  upload: z.strictObject({ signedUrl: z.url(), token: z.string(), path: z.string(), bucket: z.literal("artist-material-staging"),
    expiresAt: z.iso.datetime({ offset: true }) }).nullable(),
});
export const materialListResponse = z.array(materialResponse);
export const listMaterialsQuery = z.strictObject({ subjectType: materialSubject, subjectId: id });
export const materialDownloadResponse = z.strictObject({ material: materialResponse,
  download: z.strictObject({ url: z.url(), expiresAt: z.iso.datetime({ offset: true }) }) });
