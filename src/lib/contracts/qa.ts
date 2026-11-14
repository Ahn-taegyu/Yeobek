import { z } from "zod";
import { boundedText } from "./chat";
import { evidencePin } from "./publication";
import { revision, revisions, uuid } from "./requests";
import { AI_LIMITS } from "../policy";

export const expectedQaMaxItems = { artwork: AI_LIMITS.expectedQaArtwork, exhibition: AI_LIMITS.expectedQaExhibition } as const;
export const qaScope = z.enum(["artwork", "exhibition"]);
export const qaQuestion = boundedText(AI_LIMITS.question);
export const qaAnswer = boundedText(AI_LIMITS.answer);
export const qaCitations = z.array(uuid).min(1).max(AI_LIMITS.evidenceCount);
export const expectedQaEntry = z.strictObject({ question: qaQuestion, answer: qaAnswer, citations: qaCitations });
export const expectedQaGenerateSchema = z.strictObject({ requestId: uuid, artworkId: uuid.nullable(), ...revisions });

const timestamp = z.iso.datetime({ offset: true });
const jobState = z.enum(["running", "succeeded", "abstained", "failed", "cancelled"]);
const qaWorkJob = z.strictObject({
  id: uuid, scope: qaScope, exhibitionId: uuid, artworkId: uuid.nullable(),
  documentId: uuid, requestId: uuid, mock: z.boolean(), expectedRevision: revision, expectedDocumentRevision: revision,
  attempt: revision, status: jobState, routing: z.enum(["author", "operator", "none"]), resultCode: z.string().nullable(),
  createdAt: timestamp, updatedAt: timestamp, expiresAt: timestamp,
});
const itemResult = (max: number) => z.strictObject({ itemIds: z.array(uuid).min(1).max(max), mock: z.boolean() }).nullable();
type QaJobShape = z.infer<typeof qaWorkJob> & { result: { mock: boolean } | null };
const correctJobShape = (job: QaJobShape) => (job.scope === "artwork") === (job.artworkId !== null) &&
  (job.status === "succeeded") === (job.result !== null) &&
  (!job.result || job.result.mock === job.mock);
export const expectedQaJobResponse = qaWorkJob.extend({ kind: z.literal("expected_qa"), result: itemResult(expectedQaMaxItems.exhibition) })
  .refine(job => correctJobShape(job) && (!job.result || job.result.itemIds.length <= expectedQaMaxItems[job.scope] &&
    new Set(job.result.itemIds).size === job.result.itemIds.length));

export const previewChatSchema = z.strictObject({ requestId: uuid, artworkId: uuid.nullable(), question: qaQuestion });
export const previewEvaluationSchema = z.strictObject({ requestId: uuid, rating: z.enum(["accurate", "needs_revision"]) });
export const previewEvaluationResponse = z.strictObject({
  id: uuid, answerId: uuid, requestId: uuid, rating: previewEvaluationSchema.shape.rating, createdAt: timestamp,
});
export const previewAnswerResponse = qaWorkJob.extend({ kind: z.literal("preview_answer"), question: qaQuestion,
  result: z.strictObject({ answer: qaAnswer, citations: qaCitations, mock: z.boolean() }).nullable(),
  evaluations: z.array(previewEvaluationResponse).max(50).optional(),
}).refine(correctJobShape);
export const qaRewriteTargetKind = z.enum(["preview", "qa"]);
const qaOrigin = z.strictObject({ requestId: uuid, targetKind: qaRewriteTargetKind, targetId: uuid, targetVersion: revision.nullable() });
const validTargetVersion = (value: Pick<z.infer<typeof qaOrigin>, "targetKind" | "targetVersion">) =>
  (value.targetKind === "qa") === (value.targetVersion !== null);
export const qaCorrectionEvidenceSchema = qaOrigin.extend({ sourceLabel: boundedText(100), sourceBody: boundedText(2000) })
  .refine(validTargetVersion, { path: ["targetVersion"] });
export const qaRewriteSchema = qaOrigin.extend({
  instruction: boundedText(2000), evidencePins: z.array(evidencePin).min(1).max(AI_LIMITS.evidenceCount),
}).refine(validTargetVersion, { path: ["targetVersion"] })
  .refine(value => new Set(value.evidencePins.map(pin => pin.id)).size === value.evidencePins.length, { path: ["evidencePins"] });
export const qaRewriteJobResponse = qaWorkJob.extend({ kind: z.literal("qa_rewrite"), result: itemResult(1),
  ...qaOrigin.pick({ targetKind: true, targetId: true, targetVersion: true }).shape,
}).refine(correctJobShape).refine(validTargetVersion, { path: ["targetVersion"] });

export const qaListQuery = z.strictObject({ artworkId: uuid.optional() });
export const approveQaItemSchema = z.strictObject({ expectedVersion: revision, evidencePins: z.array(evidencePin).min(1).max(AI_LIMITS.evidenceCount) })
  .refine(value => new Set(value.evidencePins.map(pin => pin.id)).size === value.evidencePins.length, { path: ["evidencePins"] });
export const withdrawQaItemSchema = z.strictObject({ expectedVersion: revision });
const hash = z.string().regex(/^[a-f0-9]{64}$/);
const citation = z.strictObject({
  id: uuid, version: revision, scope: z.enum(["artist", "exhibition", "artwork"]), sourceLabel: boundedText(200),
  sourceDocumentId: uuid.optional(), sectionId: z.string().optional(), evidenceId: uuid.optional(), body: boundedText(2000), bodyHash: hash,
});
export const qaItemResponse = z.strictObject({
  id: uuid, version: revision, exhibitionId: uuid, artworkId: uuid.nullable(), scope: qaScope,
  origin: z.enum(["expected", "rewrite", "gap"]), sourceJobId: uuid, sourceAttempt: revision,
  question: qaQuestion, answer: qaAnswer, contentHash: hash,
  citations: z.array(citation).min(1).max(AI_LIMITS.evidenceCount), state: z.enum(["draft", "approved", "withdrawn"]),
  evidencePins: z.array(evidencePin).max(AI_LIMITS.evidenceCount), mock: z.boolean(),
  createdAt: timestamp, approvedAt: timestamp.nullable(), withdrawnAt: timestamp.nullable(),
}).refine(item => (item.scope === "artwork") === (item.artworkId !== null));
export const qaItemsResponse = z.array(qaItemResponse);

export const createTrainingBatchSchema = z.strictObject({ requestId: uuid, expectedRevision: revision });
export const runTrainingTargetSchema = z.strictObject({ requestId: uuid, expectedAttempt: z.number().int().min(0).max(2147483647) });
const trainingTargetResponse = z.strictObject({
  id: uuid, kind: z.enum(["narration", "expected_qa"]), scope: qaScope, artworkId: uuid.nullable(),
  targetName: z.string(), jobId: uuid.nullable(), status: z.enum(["queued", ...jobState.options]),
  attempt: revision.nullable(), resultCode: z.string().nullable(),
}).refine(target => (target.scope === "artwork") === (target.artworkId !== null) &&
  (target.scope === "artwork" || target.kind === "expected_qa") && (target.jobId === null) === (target.attempt === null));
export const trainingBatchResponse = z.strictObject({
  id: uuid, exhibitionId: uuid, exhibitionName: z.string(), artistName: z.string(),
  status: z.enum(["queued", "running", "completed"]), targets: z.array(trainingTargetResponse),
});

export type ExpectedQaGenerate = z.infer<typeof expectedQaGenerateSchema>;
export type ExpectedQaJob = z.infer<typeof expectedQaJobResponse>;
export type PreviewChat = z.infer<typeof previewChatSchema>;
export type PreviewAnswer = z.infer<typeof previewAnswerResponse>;
export type PreviewEvaluation = z.infer<typeof previewEvaluationSchema>;
export type QaRewrite = z.infer<typeof qaRewriteSchema>;
export type QaRewriteJob = z.infer<typeof qaRewriteJobResponse>;
export type CreateTrainingBatch = z.infer<typeof createTrainingBatchSchema>;
export type RunTrainingTarget = z.infer<typeof runTrainingTargetSchema>;
