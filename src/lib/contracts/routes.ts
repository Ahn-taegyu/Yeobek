import { previewChatSchema, previewAnswerResponse, previewEvaluationSchema, previewEvaluationResponse, qaRewriteSchema, qaRewriteJobResponse, qaCorrectionEvidenceSchema } from "./qa";
import { createTrainingBatchSchema, runTrainingTargetSchema, trainingBatchResponse } from "./qa";
import { expectedQaGenerateSchema, expectedQaJobResponse, qaListQuery, qaItemsResponse, qaItemResponse, approveQaItemSchema, withdrawQaItemSchema } from "./qa";
import { createExhibitionBody, updateExhibitionBody, createArtworkBody, updateArtworkBody,
  advanceExhibitionSchema, advanceExhibitionResponse, reorderArtworksSchema, reorderArtworksResponse } from "./authoring";
import { z } from "zod";
import { setOnboardingMediaSchema, updateOnboardingSchema } from "./onboarding";
import { authSessionResponse, resendSignupSchema, signupPendingResponse, signupSchema, signupVerifiedResponse, verifySignupSchema } from "./signup";
import { channelWebhookSchema, channelWebhookResponse, supportBindingSchema, supportBindingResponse } from "./support";
import { consentListResponse, consentResponse, updateConsentSchema, decideOutboxSchema, outboxResponse, outboxPageResponse, outboxQuery, notificationRunResponse } from "./automation";
import { mediaBinary, mediaQuery } from "./media";
import { speechRequest, transcribeRequest, transcribeResponse } from "./voice";
import { requestUploadSchema, completeUploadSchema, deleteMaterialSchema, deleteArtworkSchema,
  setArtworkImageSchema, materialResponse, materialListResponse, uploadResponse, listMaterialsQuery,
  materialDownloadResponse, deletedArtworkResponse } from "./materials";
import { closeGapRecheckSchema, visitorChatRequest, visitorReplyResponse, gapListResponse, gapResponse, checkVersionsRequest, checkVersionsResponse, purgeResponse } from "./visitor";
import { generateNarrationSchema, narrationJobResponse, jobResponse, audioJobResponse, generateAudioSchema, retryJobSchema, saveNarrationSchema } from "./jobs";
import { approvalSchema, approvalResponse, evidenceImpactSchema, evidenceResponse, labelsResponse,
  publicationSchema, publicationResponse, reviewResponse, revokeEvidenceSchema, revokeImpactResponse,
  upsertEvidenceSchema, upsertExhibitionEvidenceSchema, approveEvidenceSchema } from "./publication";
import {
  emptySchema, loginSchema, profileSchema,
  updateKnowledgeSchema, uuid,
} from "./requests";
import {
  accountProfileResponse, artworkListResponse, artworkResponse, documentResponse,
  exhibitionListResponse, exhibitionResponse, profileResponse, publicArtworkResponse,
  publicExhibitionResponse, successEnvelope,
} from "./responses";

type RouteBase = {
  method: "GET" | "POST" | "PATCH" | "DELETE" | "PUT";
  path: `/api/${string}`;
  params?: z.ZodType<Record<string, string>>;
  query?: z.ZodType<Record<string, string>>;
  body?: z.ZodType;
  bodyEncoding?: "multipart";
  statuses: readonly number[];
};
export type BinaryRouteContract = RouteBase & {
  binary: { mimeTypes: readonly string[]; maxBytes: number };
  response?: never;
};
export type RouteContract = BinaryRouteContract | (RouteBase & { response: z.ZodType; binary?: never });

const byId = z.strictObject({ id: uuid });
const publicArtworkParams = byId.extend({ artworkId: uuid });

export const routes = {
  previewChat: { method: "POST", path: "/api/admin/exhibitions/{id}/preview/chat", params: byId, body: previewChatSchema, response: successEnvelope(previewAnswerResponse), statuses: [200, 201] },
  getPreviewAnswer: { method: "GET", path: "/api/admin/preview/{id}", params: byId, response: successEnvelope(previewAnswerResponse), statuses: [200] },
  evaluatePreviewAnswer: { method: "POST", path: "/api/admin/preview/{id}/evaluations", params: byId, body: previewEvaluationSchema, response: successEnvelope(previewEvaluationResponse), statuses: [200] },
  rewriteQa: { method: "POST", path: "/api/admin/qa/rewrite", body: qaRewriteSchema, response: successEnvelope(qaRewriteJobResponse), statuses: [200, 201] },
  getQaRewrite: { method: "GET", path: "/api/admin/qa/rewrites/{id}", params: byId, response: successEnvelope(qaRewriteJobResponse), statuses: [200] },
  retryQaRewrite: { method: "POST", path: "/api/admin/qa/rewrites/{id}/retry", params: byId, body: retryJobSchema, response: successEnvelope(qaRewriteJobResponse), statuses: [200, 201] },
  createQaCorrectionEvidence: { method: "POST", path: "/api/admin/qa/corrections", body: qaCorrectionEvidenceSchema, response: successEnvelope(evidenceResponse), statuses: [200] },
  closeGapRecheck: { method: "POST", path: "/api/admin/gaps/{id}/recheck-close", params: byId, body: closeGapRecheckSchema, response: successEnvelope(gapResponse), statuses: [200] },
  createTrainingBatch: { method: "POST", path: "/api/admin/exhibitions/{id}/training", params: byId, body: createTrainingBatchSchema, response: successEnvelope(trainingBatchResponse), statuses: [200] },
  getTrainingBatch: { method: "GET", path: "/api/admin/training/{id}", params: byId, response: successEnvelope(trainingBatchResponse), statuses: [200] },
  runTrainingTarget: { method: "POST", path: "/api/admin/training/{id}/targets/{targetId}/run", params: byId.extend({ targetId: uuid }), body: runTrainingTargetSchema, response: successEnvelope(trainingBatchResponse), statuses: [200] },
  generateExpectedQa: { method: "POST", path: "/api/admin/exhibitions/{id}/qa/generations", params: byId, body: expectedQaGenerateSchema, response: successEnvelope(expectedQaJobResponse), statuses: [200, 201] },
  getExpectedQaJob: { method: "GET", path: "/api/admin/qa/jobs/{id}", params: byId, response: successEnvelope(expectedQaJobResponse), statuses: [200] },
  retryExpectedQaJob: { method: "POST", path: "/api/admin/qa/jobs/{id}/retry", params: byId, body: retryJobSchema, response: successEnvelope(expectedQaJobResponse), statuses: [200, 201] },
  listQaItems: { method: "GET", path: "/api/admin/exhibitions/{id}/qa", params: byId, query: qaListQuery, response: successEnvelope(qaItemsResponse), statuses: [200] },
  approveQaItem: { method: "POST", path: "/api/admin/qa/{id}/approve", params: byId, body: approveQaItemSchema, response: successEnvelope(qaItemResponse), statuses: [200] },
  withdrawQaItem: { method: "POST", path: "/api/admin/qa/{id}/withdraw", params: byId, body: withdrawQaItemSchema, response: successEnvelope(qaItemResponse), statuses: [200] },
  advanceExhibition: { method: "POST", path: "/api/admin/exhibitions/{id}/advance", params: byId, body: advanceExhibitionSchema, response: successEnvelope(advanceExhibitionResponse), statuses: [200] },
  reorderArtworks: { method: "POST", path: "/api/admin/exhibitions/{id}/artworks/reorder", params: byId, body: reorderArtworksSchema, response: successEnvelope(reorderArtworksResponse), statuses: [200] },
  runAutomation: { method: "POST", path: "/api/cron/automation", response: successEnvelope(notificationRunResponse), statuses: [200] },
  receiveChannelWebhook: { method: "POST", path: "/api/webhooks/channeltalk", query: z.object({ token: z.string() }), body: channelWebhookSchema, response: successEnvelope(channelWebhookResponse), statuses: [200] },
  setSupportBinding: { method: "POST", path: "/api/ops/support/bindings", body: supportBindingSchema, response: successEnvelope(supportBindingResponse), statuses: [200] },
  getConsents: { method: "GET", path: "/api/admin/profile/consents", response: successEnvelope(consentListResponse), statuses: [200] },
  updateConsent: { method: "PATCH", path: "/api/admin/profile/consents", body: updateConsentSchema, response: successEnvelope(consentResponse), statuses: [200] },
  listOutbox: { method: "GET", path: "/api/ops/outbox", query: outboxQuery, response: successEnvelope(outboxPageResponse), statuses: [200] },
  approveOutbox: { method: "POST", path: "/api/ops/outbox/{id}/approve", params: byId, body: decideOutboxSchema, response: successEnvelope(outboxResponse), statuses: [200] },
  rejectOutbox: { method: "POST", path: "/api/ops/outbox/{id}/reject", params: byId, body: decideOutboxSchema, response: successEnvelope(outboxResponse), statuses: [200] },
  transcribe: { method: "POST", path: "/api/transcribe", body: transcribeRequest, bodyEncoding: "multipart", response: successEnvelope(transcribeResponse), statuses: [200] },
  speech: { method: "POST", path: "/api/speech", body: speechRequest, binary: { mimeTypes: ["audio/mpeg"], maxBytes: 8 * 1024 * 1024 }, statuses: [200] },
  getMedia: { method: "GET", path: "/api/media/{id}", params: byId, query: mediaQuery, binary: mediaBinary, statuses: [200] },
  requestUpload: { method: "POST", path: "/api/admin/uploads", body: requestUploadSchema, response: successEnvelope(uploadResponse), statuses: [200, 201] },
  completeUpload: { method: "POST", path: "/api/admin/uploads/{id}/complete", params: byId, body: completeUploadSchema, response: successEnvelope(materialResponse), statuses: [200] },
  listMaterials: { method: "GET", path: "/api/admin/materials", query: listMaterialsQuery, response: successEnvelope(materialListResponse), statuses: [200] },
  getMaterial: { method: "GET", path: "/api/admin/materials/{id}", params: byId, response: successEnvelope(materialDownloadResponse), statuses: [200] },
  deleteMaterial: { method: "DELETE", path: "/api/admin/materials/{id}", params: byId, body: deleteMaterialSchema, response: successEnvelope(materialResponse), statuses: [200] },
  setArtworkImage: { method: "POST", path: "/api/admin/artworks/{id}/image", params: byId, body: setArtworkImageSchema, response: successEnvelope(artworkResponse), statuses: [200] },
  deleteArtwork: { method: "POST", path: "/api/admin/artworks/{id}/delete", params: byId, body: deleteArtworkSchema, response: successEnvelope(deletedArtworkResponse), statuses: [200] },
  purgeExpired: { method: "POST", path: "/api/cron/purge", response: successEnvelope(purgeResponse), statuses: [200] },
  chat: { method: "POST", path: "/api/chat", body: visitorChatRequest, response: successEnvelope(visitorReplyResponse), statuses: [200] },
  checkVersions: { method: "POST", path: "/api/public/exhibitions/{id}/versions/check", params: byId, body: checkVersionsRequest, response: successEnvelope(checkVersionsResponse), statuses: [200] },
  listGaps: { method: "GET", path: "/api/admin/exhibitions/{id}/gaps", params: byId, response: successEnvelope(gapListResponse), statuses: [200] },
  dismissGap: { method: "POST", path: "/api/admin/gaps/{id}/dismiss", params: byId, body: emptySchema, response: successEnvelope(gapResponse), statuses: [200] },
  reviewArtwork: { method: "GET", path: "/api/admin/artworks/{id}/review", params: byId, response: successEnvelope(reviewResponse), statuses: [200] },
  upsertEvidence: { method: "POST", path: "/api/admin/artworks/{id}/evidence", params: byId, body: upsertEvidenceSchema, response: successEnvelope(evidenceResponse), statuses: [201] },
  upsertExhibitionEvidence: { method: "POST", path: "/api/admin/exhibitions/{id}/evidence", params: byId, body: upsertExhibitionEvidenceSchema, response: successEnvelope(evidenceResponse), statuses: [201] },
  approveEvidence: { method: "POST", path: "/api/admin/evidence/{id}/approve", params: byId, body: approveEvidenceSchema, response: successEnvelope(evidenceResponse), statuses: [200] },
  approveArtwork: { method: "POST", path: "/api/admin/artworks/{id}/approvals", params: byId, body: approvalSchema, response: successEnvelope(approvalResponse), statuses: [200] },
  changePublication: { method: "POST", path: "/api/admin/exhibitions/{id}/publication", params: byId, body: publicationSchema, response: successEnvelope(publicationResponse), statuses: [200, 201] },
  listLabels: { method: "GET", path: "/api/admin/exhibitions/{id}/labels", params: byId, response: successEnvelope(labelsResponse), statuses: [200] },
  evidenceImpact: { method: "POST", path: "/api/admin/evidence/{id}/impact", params: byId, body: evidenceImpactSchema, response: successEnvelope(revokeImpactResponse), statuses: [200] },
  revokeEvidence: { method: "POST", path: "/api/admin/evidence/{id}/revoke", params: byId, body: revokeEvidenceSchema, response: successEnvelope(revokeImpactResponse), statuses: [200] },
  generateAudio: { method: "POST", path: "/api/admin/artworks/{id}/audio", params: byId, body: generateAudioSchema, response: successEnvelope(audioJobResponse), statuses: [200, 201] },
  generateNarration: { method: "POST", path: "/api/admin/artworks/{id}/generations", params: byId, body: generateNarrationSchema, response: successEnvelope(narrationJobResponse), statuses: [200, 201] },
  getJob: { method: "GET", path: "/api/admin/jobs/{id}", params: byId, response: successEnvelope(jobResponse), statuses: [200] },
  retryJob: { method: "POST", path: "/api/admin/jobs/{id}/retry", params: byId, body: retryJobSchema, response: successEnvelope(jobResponse), statuses: [200] },
  saveNarration: { method: "PATCH", path: "/api/admin/artworks/{id}/narration", params: byId, body: saveNarrationSchema, response: successEnvelope(artworkResponse), statuses: [200] },
  health: { method: "GET", path: "/api/health", response: successEnvelope(z.object({ status: z.literal("ok") })), statuses: [200] },
  login: { method: "POST", path: "/api/auth/login", body: loginSchema, response: successEnvelope(z.object({ authenticated: z.literal(true) })), statuses: [200] },
  logout: { method: "POST", path: "/api/auth/logout", body: emptySchema, response: successEnvelope(z.object({ authenticated: z.literal(false) })), statuses: [200] },
  signup: { method: "POST", path: "/api/auth/signup", body: signupSchema, response: successEnvelope(signupPendingResponse), statuses: [202] },
  resendSignup: { method: "POST", path: "/api/auth/resend", body: resendSignupSchema, response: successEnvelope(signupPendingResponse), statuses: [202] },
  verifySignup: { method: "POST", path: "/api/auth/verify", body: verifySignupSchema, response: successEnvelope(signupVerifiedResponse), statuses: [200] },
  getSession: { method: "GET", path: "/api/auth/session", response: successEnvelope(authSessionResponse), statuses: [200] },
  getProfile: { method: "GET", path: "/api/admin/profile", response: successEnvelope(accountProfileResponse), statuses: [200] },
  updateProfile: { method: "PATCH", path: "/api/admin/profile", body: profileSchema, response: successEnvelope(profileResponse), statuses: [200] },
  updateOnboarding: { method: "PATCH", path: "/api/admin/profile/onboarding", body: updateOnboardingSchema, response: successEnvelope(profileResponse), statuses: [200] },
  setArtistAvatar: { method: "PATCH", path: "/api/admin/profile/avatar", body: setOnboardingMediaSchema, response: successEnvelope(profileResponse), statuses: [200] },
  listExhibitions: { method: "GET", path: "/api/admin/exhibitions", response: successEnvelope(exhibitionListResponse), statuses: [200] },
  createExhibition: { method: "POST", path: "/api/admin/exhibitions", body: createExhibitionBody, response: successEnvelope(exhibitionResponse), statuses: [200, 201] },
  getExhibition: { method: "GET", path: "/api/admin/exhibitions/{id}", params: byId, response: successEnvelope(exhibitionResponse), statuses: [200] },
  updateExhibition: { method: "PATCH", path: "/api/admin/exhibitions/{id}", params: byId, body: updateExhibitionBody, response: successEnvelope(exhibitionResponse), statuses: [200] },
  setExhibitionPoster: { method: "PATCH", path: "/api/admin/exhibitions/{id}/poster", params: byId, body: setOnboardingMediaSchema, response: successEnvelope(exhibitionResponse), statuses: [200] },
  listArtworks: { method: "GET", path: "/api/admin/exhibitions/{id}/artworks", params: byId, response: successEnvelope(artworkListResponse), statuses: [200] },
  createArtwork: { method: "POST", path: "/api/admin/exhibitions/{id}/artworks", params: byId, body: createArtworkBody, response: successEnvelope(artworkResponse), statuses: [200, 201] },
  getArtwork: { method: "GET", path: "/api/admin/artworks/{id}", params: byId, response: successEnvelope(artworkResponse), statuses: [200] },
  updateArtwork: { method: "PATCH", path: "/api/admin/artworks/{id}", params: byId, body: updateArtworkBody, response: successEnvelope(artworkResponse), statuses: [200] },
  getKnowledge: { method: "GET", path: "/api/admin/knowledge/{id}", params: byId, response: successEnvelope(documentResponse), statuses: [200] },
  updateKnowledge: { method: "PATCH", path: "/api/admin/knowledge/{id}", params: byId, body: updateKnowledgeSchema, response: successEnvelope(documentResponse), statuses: [200] },
  getPublicExhibition: { method: "GET", path: "/api/public/exhibitions/{id}", params: byId, response: successEnvelope(publicExhibitionResponse), statuses: [200] },
  getPublicArtwork: { method: "GET", path: "/api/public/exhibitions/{id}/artworks/{artworkId}", params: publicArtworkParams, response: successEnvelope(publicArtworkResponse), statuses: [200] },
} as const satisfies Record<string, RouteContract>;
