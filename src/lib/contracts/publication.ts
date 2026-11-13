import { z } from "zod";
import { revision, section, uuid } from "./requests";
import { artworkResponse } from "./responses";
import { DEFAULT_POLICIES } from "../policy";

const boundedText = (max: number) => z.string().refine(value =>
  value.trim().length > 0 && !value.includes("\u0000") && Array.from(value).length <= max,
  `공백 외 문자를 포함해 ${max}자 이내로 입력해 주세요.`);

export const evidencePin = z.strictObject({ id: uuid, version: revision });
export const evidenceSource = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("direct") }),
  z.strictObject({ kind: z.literal("document"), sourceDocumentId: uuid,
    sourceSectionId: section.shape.id, sourceRevision: revision }),
  z.strictObject({ kind: z.literal("material"), materialId: uuid,
    pageStart: revision, pageEnd: revision }).refine(value => value.pageEnd >= value.pageStart,
    { path: ["pageEnd"], message: "마지막 쪽은 시작 쪽보다 앞설 수 없습니다." }),
]);
export const upsertEvidenceSchema = z.strictObject({
  evidenceId: uuid.optional(), expectedVersion: revision.optional(),
  scope: z.enum(["artist", "exhibition", "artwork"]), sourceLabel: boundedText(DEFAULT_POLICIES.evidence_label_chars),
  body: boundedText(DEFAULT_POLICIES.evidence_body_chars), source: evidenceSource,
}).refine(value => (value.evidenceId === undefined) === (value.expectedVersion === undefined),
  { path: ["expectedVersion"], message: "수정할 근거 ID와 기준 버전을 함께 입력해 주세요." });
export const approvalSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("evidence"), evidenceId: uuid, version: revision }),
  z.strictObject({ kind: z.literal("narration"), expectedRevision: revision,
    citations: z.array(evidencePin).min(1).max(12) }),
]);
export const publicationSchema = z.discriminatedUnion("action", [
  z.strictObject({ action: z.literal("publish"), requestId: uuid, expectedRevision: revision,
    artworks: z.array(z.strictObject({ artworkId: uuid, expectedRevision: revision })).max(100),
    intro: z.strictObject({ bio: evidencePin.nullable(), introduction: evidencePin.nullable(), theme: evidencePin.nullable() }),
  }).refine(value => new Set(value.artworks.map(work => work.artworkId)).size === value.artworks.length,
    { path: ["artworks"], message: "같은 작품을 중복 선택할 수 없습니다." }),
  z.strictObject({ action: z.enum(["pause", "resume"]), expectedRevision: revision, artworkId: uuid.nullable().optional() }),
]);
export const revokeEvidenceSchema = z.strictObject({ expectedVersion: revision, impactToken: z.string().regex(/^[a-f0-9]{64}$/) });
export const evidenceImpactSchema = z.strictObject({ expectedVersion: revision });

const timestamp = z.iso.datetime({ offset: true });
const hash = z.string().regex(/^[a-f0-9]{64}$/);
const storedSource = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("direct") }),
  z.object({ kind: z.literal("document"), sourceDocumentId: uuid,
    sourceSectionId: section.shape.id, sourceRevision: revision }),
  z.object({ kind: z.literal("material"), materialId: uuid, materialVersion: revision, pageStart: revision, pageEnd: revision }),
]);
export const evidenceResponse = z.object({
  id: uuid, version: revision, exhibitionId: uuid, artworkId: uuid.nullable(),
  scope: z.enum(["artist", "exhibition", "artwork"]), sourceLabel: z.string(), body: z.string(), contentHash: hash,
  state: z.enum(["draft", "approved", "withdrawn"]), source: storedSource,
  createdAt: timestamp, approvedAt: timestamp.nullable(), withdrawnAt: timestamp.nullable(),
});
export const narrationApprovalResponse = z.object({
  id: uuid, artworkId: uuid, artworkRevision: revision, text: z.string(), textHash: hash,
  citations: z.array(evidencePin), approvedBy: uuid, approvedAt: timestamp,
});
export const approvalResponse = z.union([evidenceResponse, narrationApprovalResponse]);
export const reviewResponse = z.object({
  artwork: artworkResponse, evidence: z.array(evidenceResponse), approval: narrationApprovalResponse.nullable(),
  audio: z.object({ id: uuid, state: z.enum(["pending", "ready", "failed", "revoked"]), approvalId: uuid,
    voiceConfigVersion: revision, textHash: hash, createdAt: timestamp }).nullable(),
  publication: z.object({ id: uuid, version: revision, number: z.number().int(),
    approvedAt: timestamp, revokedAt: timestamp.nullable() }).nullable(),
  blockingCodes: z.array(z.string()),
  exhibitionPublicIntro: z.object({ bio: evidencePin.nullable(), introduction: evidencePin.nullable(), theme: evidencePin.nullable() }),
});
export const publishedResponse = z.object({
  exhibitionId: uuid, revision, state: z.enum(["draft", "published", "paused"]),
  publications: z.array(z.object({ artworkId: uuid, publicationId: uuid, version: revision })),
});
export const publicationStateResponse = z.object({
  exhibitionId: uuid, artworkId: uuid.nullable(), exhibitionState: z.enum(["draft", "published", "paused"]),
  state: z.enum(["draft", "published", "paused"]), revision,
});
export const publicationResponse = z.union([publishedResponse, publicationStateResponse]);
export const labelsResponse = z.object({
  exhibitionId: uuid, path: z.string(),
  artworks: z.array(z.object({ artworkId: uuid, path: z.string(), number: z.number().int(), title: z.string() })),
});
export const revokeImpactResponse = z.object({
  evidenceId: uuid, version: revision, token: hash,
  exhibitions: z.array(z.object({ exhibitionId: uuid, artworkIds: z.array(uuid), introAffected: z.boolean() })),
});
