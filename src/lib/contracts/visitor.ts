import { z } from "zod";
import { publicMediaReferences } from "./media";
import { AI_LIMITS, boundedText, chatRequestSchema, codepoints } from "./chat";

const id = z.uuid().toLowerCase();
// Preserve raw intent presence: defaulting here would disable legacy text intent resolution.
export const visitorChatRequest = chatRequestSchema.extend({ requestId: id, exhibitionId: id, artworkId: id.nullable(),
  intent: z.enum(["question", "narration"]).optional() });
export const publicationRefSchema = z.strictObject({
  exhibitionId: id, artworkId: id, publicationId: id, version: z.number().int().positive().max(2147483647),
});
export const savedVisitorReply = z.strictObject({
  answerId: id, requestId: id,
  contextSequence: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  inputMode: z.enum(["text", "voice"]), outputMode: z.enum(["text", "voice"]),
  answer: boundedText(AI_LIMITS.narration), citations: z.array(id).max(AI_LIMITS.evidenceCount),
  outcome: z.enum(["answered", "clarify", "insufficient_evidence"]),
  publication: publicationRefSchema.nullable(), source: z.enum(["approved_narration", "generated", "fixed"]),
  mock: z.boolean(), gapRecorded: z.boolean().optional(),
}).refine(value => value.source === "approved_narration" || codepoints(value.answer) <= AI_LIMITS.answer);
export const visitorReplyResponse = savedVisitorReply.safeExtend({ notice: boundedText(200).optional(),
  image: publicMediaReferences.shape.image.optional() });
export type SavedVisitorReply = z.infer<typeof savedVisitorReply>;
export const visitorReservation = z.strictObject({
  id, claimed: z.boolean(), status: z.enum(["running", "succeeded", "failed"]),
  result: savedVisitorReply.nullable(), mock: z.boolean(), expiresAt: z.iso.datetime({ offset: true }),
  failureCode: z.string().nullable(),
});
export const gapResponse = z.strictObject({
  id, exhibitionId: id, artworkId: id, publicationId: id, publicationVersion: z.number().int().positive(),
  question: boundedText(AI_LIMITS.question), count: z.number().int().positive(),
  status: z.enum(["open", "answered", "dismissed"]),
  needsRecheck: z.literal(true).optional(),
  recheckPublicationId: id.optional(), recheckAt: z.iso.datetime({ offset: true }).optional(),
  createdAt: z.iso.datetime({ offset: true }), expiresAt: z.iso.datetime({ offset: true }),
});
export const closeGapRecheckSchema = z.strictObject({ expectedPublicationId: id });
export const gapListResponse = z.array(gapResponse);
export const checkVersionsRequest = z.strictObject({ publications: z.array(publicationRefSchema.omit({ exhibitionId: true })).max(100) });
export const checkVersionsResponse = z.strictObject({ publications: z.array(publicationRefSchema.extend({ current: z.boolean() })).max(100) });
export const purgeResponse = z.strictObject({ answers: z.number().int().nonnegative(), gaps: z.number().int().nonnegative(), jobs: z.number().int().nonnegative(),
  visitorAudio: z.strictObject({ attempted: z.number().int().nonnegative(), completed: z.number().int().nonnegative() }).optional(),
  materials: z.strictObject({ attempted: z.number().int().nonnegative(), completed: z.number().int().nonnegative() }).optional(),
  audio: z.strictObject({ attempted: z.number().int().nonnegative(), completed: z.number().int().nonnegative() }).optional() });
