import { z } from "zod";
import { visitorChatRequest, visitorReplyResponse, gapListResponse, gapResponse, checkVersionsRequest, checkVersionsResponse, purgeResponse } from "./visitor";
import { generateNarrationSchema, jobResponse, retryJobSchema, saveNarrationSchema } from "./jobs";
import { approvalSchema, approvalResponse, evidenceImpactSchema, evidenceResponse, labelsResponse,
  publicationSchema, publicationResponse, reviewResponse, revokeEvidenceSchema, revokeImpactResponse,
  upsertEvidenceSchema } from "./publication";
import {
  createArtworkSchema, createExhibitionSchema, emptySchema, loginSchema, profileSchema,
  updateArtworkSchema, updateExhibitionSchema, updateKnowledgeSchema, uuid,
} from "./requests";
import {
  accountProfileResponse, artworkListResponse, artworkResponse, documentResponse,
  exhibitionListResponse, exhibitionResponse, profileResponse, publicArtworkResponse,
  publicExhibitionResponse, successEnvelope,
} from "./responses";

export type RouteContract = {
  method: "GET" | "POST" | "PATCH" | "DELETE" | "PUT";
  path: `/api/${string}`;
  params?: z.ZodType<Record<string, string>>;
  body?: z.ZodType;
  response: z.ZodType;
  statuses: readonly number[];
};

const byId = z.strictObject({ id: uuid });
const publicArtworkParams = byId.extend({ artworkId: uuid });

export const routes = {
  purgeExpired: { method: "POST", path: "/api/cron/purge", response: successEnvelope(purgeResponse), statuses: [200] },
  chat: { method: "POST", path: "/api/chat", body: visitorChatRequest, response: successEnvelope(visitorReplyResponse), statuses: [200] },
  checkVersions: { method: "POST", path: "/api/public/exhibitions/{id}/versions/check", params: byId, body: checkVersionsRequest, response: successEnvelope(checkVersionsResponse), statuses: [200] },
  listGaps: { method: "GET", path: "/api/admin/exhibitions/{id}/gaps", params: byId, response: successEnvelope(gapListResponse), statuses: [200] },
  dismissGap: { method: "POST", path: "/api/admin/gaps/{id}/dismiss", params: byId, body: emptySchema, response: successEnvelope(gapResponse), statuses: [200] },
  reviewArtwork: { method: "GET", path: "/api/admin/artworks/{id}/review", params: byId, response: successEnvelope(reviewResponse), statuses: [200] },
  upsertEvidence: { method: "POST", path: "/api/admin/artworks/{id}/evidence", params: byId, body: upsertEvidenceSchema, response: successEnvelope(evidenceResponse), statuses: [201] },
  approveArtwork: { method: "POST", path: "/api/admin/artworks/{id}/approvals", params: byId, body: approvalSchema, response: successEnvelope(approvalResponse), statuses: [200] },
  changePublication: { method: "POST", path: "/api/admin/exhibitions/{id}/publication", params: byId, body: publicationSchema, response: successEnvelope(publicationResponse), statuses: [200, 201] },
  listLabels: { method: "GET", path: "/api/admin/exhibitions/{id}/labels", params: byId, response: successEnvelope(labelsResponse), statuses: [200] },
  evidenceImpact: { method: "POST", path: "/api/admin/evidence/{id}/impact", params: byId, body: evidenceImpactSchema, response: successEnvelope(revokeImpactResponse), statuses: [200] },
  revokeEvidence: { method: "POST", path: "/api/admin/evidence/{id}/revoke", params: byId, body: revokeEvidenceSchema, response: successEnvelope(revokeImpactResponse), statuses: [200] },
  generateNarration: { method: "POST", path: "/api/admin/artworks/{id}/generations", params: byId, body: generateNarrationSchema, response: successEnvelope(jobResponse), statuses: [200, 201] },
  getJob: { method: "GET", path: "/api/admin/jobs/{id}", params: byId, response: successEnvelope(jobResponse), statuses: [200] },
  retryJob: { method: "POST", path: "/api/admin/jobs/{id}/retry", params: byId, body: retryJobSchema, response: successEnvelope(jobResponse), statuses: [200] },
  saveNarration: { method: "PATCH", path: "/api/admin/artworks/{id}/narration", params: byId, body: saveNarrationSchema, response: successEnvelope(artworkResponse), statuses: [200] },
  health: { method: "GET", path: "/api/health", response: successEnvelope(z.object({ status: z.literal("ok") })), statuses: [200] },
  login: { method: "POST", path: "/api/auth/login", body: loginSchema, response: successEnvelope(z.object({ authenticated: z.literal(true) })), statuses: [200] },
  logout: { method: "POST", path: "/api/auth/logout", body: emptySchema, response: successEnvelope(z.object({ authenticated: z.literal(false) })), statuses: [200] },
  getProfile: { method: "GET", path: "/api/admin/profile", response: successEnvelope(accountProfileResponse), statuses: [200] },
  updateProfile: { method: "PATCH", path: "/api/admin/profile", body: profileSchema, response: successEnvelope(profileResponse), statuses: [200] },
  listExhibitions: { method: "GET", path: "/api/admin/exhibitions", response: successEnvelope(exhibitionListResponse), statuses: [200] },
  createExhibition: { method: "POST", path: "/api/admin/exhibitions", body: createExhibitionSchema, response: successEnvelope(exhibitionResponse), statuses: [200, 201] },
  getExhibition: { method: "GET", path: "/api/admin/exhibitions/{id}", params: byId, response: successEnvelope(exhibitionResponse), statuses: [200] },
  updateExhibition: { method: "PATCH", path: "/api/admin/exhibitions/{id}", params: byId, body: updateExhibitionSchema, response: successEnvelope(exhibitionResponse), statuses: [200] },
  listArtworks: { method: "GET", path: "/api/admin/exhibitions/{id}/artworks", params: byId, response: successEnvelope(artworkListResponse), statuses: [200] },
  createArtwork: { method: "POST", path: "/api/admin/exhibitions/{id}/artworks", params: byId, body: createArtworkSchema, response: successEnvelope(artworkResponse), statuses: [200, 201] },
  getArtwork: { method: "GET", path: "/api/admin/artworks/{id}", params: byId, response: successEnvelope(artworkResponse), statuses: [200] },
  updateArtwork: { method: "PATCH", path: "/api/admin/artworks/{id}", params: byId, body: updateArtworkSchema, response: successEnvelope(artworkResponse), statuses: [200] },
  getKnowledge: { method: "GET", path: "/api/admin/knowledge/{id}", params: byId, response: successEnvelope(documentResponse), statuses: [200] },
  updateKnowledge: { method: "PATCH", path: "/api/admin/knowledge/{id}", params: byId, body: updateKnowledgeSchema, response: successEnvelope(documentResponse), statuses: [200] },
  getPublicExhibition: { method: "GET", path: "/api/public/exhibitions/{id}", params: byId, response: successEnvelope(publicExhibitionResponse), statuses: [200] },
  getPublicArtwork: { method: "GET", path: "/api/public/exhibitions/{id}/artworks/{artworkId}", params: publicArtworkParams, response: successEnvelope(publicArtworkResponse), statuses: [200] },
} as const satisfies Record<string, RouteContract>;
