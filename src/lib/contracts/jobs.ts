import { z } from "zod";
import { revision, revisions, uuid } from "./requests";
import { AI_LIMITS } from "../policy";

export const narrationText = z.string().refine(value =>
  !value.includes("\u0000") && Array.from(value).length <= AI_LIMITS.narration,
  "해설은 2,000자 이내로 입력해 주세요.");
export const generateNarrationSchema = z.strictObject({
  requestId: uuid, ...revisions, strategy: z.enum(["single", "best_of_two"]).default("best_of_two"),
});
export const retryJobSchema = z.strictObject({ requestId: uuid, expectedAttempt: revision });
export const saveNarrationSchema = z.strictObject({
  expectedRevision: revision, text: narrationText.nullable(), sourceJobId: uuid.nullable().optional(),
});
export const narrationJobResponse = z.object({
  id: uuid, kind: z.literal("narration"), artworkId: uuid, documentId: uuid, requestId: uuid, mock: z.boolean(),
  expectedRevision: revision, expectedDocumentRevision: revision, attempt: revision,
  strategy: z.enum(["single", "best_of_two"]),
  status: z.enum(["running", "succeeded", "abstained", "failed", "cancelled"]),
  routing: z.enum(["author", "operator", "none"]), resultCode: z.string().nullable(),
  result: z.object({
    selected: z.object({ answer: narrationText, citations: z.array(uuid).min(1).max(AI_LIMITS.evidenceCount),
      followUpQuestions: z.array(z.string().refine(value => value.trim().length > 0 &&
        !value.includes("\u0000") && Array.from(value).length <= 200)).max(3).optional() }),
    overTarget: z.boolean(), mock: z.boolean(),
  }).nullable(),
  createdAt: z.iso.datetime({ offset: true }), updatedAt: z.iso.datetime({ offset: true }),
  expiresAt: z.iso.datetime({ offset: true }),
});
export const audioJobResult = z.strictObject({ assetId: uuid, approvalId: uuid,
  textHash: z.string().regex(/^[a-f0-9]{64}$/), voiceConfigVersion: revision, mock: z.boolean() });
export const audioJobResponse = narrationJobResponse.extend({ kind: z.literal("audio"), strategy: z.null(), result: audioJobResult.nullable() });
export const jobResponse = z.discriminatedUnion("kind", [narrationJobResponse, audioJobResponse]);
export const generateAudioSchema = z.strictObject({ requestId: uuid, approvalId: uuid, expectedRevision: revision });
export type AiJob = z.infer<typeof narrationJobResponse>;
export type AudioJob = z.infer<typeof audioJobResponse>;
export type AnyAiJob = z.infer<typeof jobResponse>;
export type GenerateNarration = z.infer<typeof generateNarrationSchema>;
export type RetryJob = z.infer<typeof retryJobSchema>;
