import "server-only";
import { z } from "zod";
import { rpc, type DbClient } from "./db";
import { ApiError, databaseError } from "./errors";
import { camelize } from "./http";
import { rpcArgs } from "./schemas";
import { artworkResponse } from "../contracts/responses";
import { approvalSchema, evidenceResponse, narrationApprovalResponse, publicationSchema,
  publishedResponse, publicationStateResponse, publicationChecklistResponse, reviewResponse, upsertEvidenceSchema } from "../contracts/publication";
import { getFeatures } from "../features";
import { createWorkerSupabase } from "../supabase/worker";
import { speechIdentity } from "../ai/voice";
import { isMockMode } from "../ai/routing";
import { normalizeAiOutcome } from "../ai/outcome";

export function decodeDatabase<T>(schema: z.ZodType<T>, raw: unknown): T {
  const result = schema.safeParse(camelize(raw));
  if (!result.success) throw new ApiError(500, "INTERNAL_ERROR", "저장된 자료를 확인하지 못했습니다.");
  return result.data;
}

/** Only trusted server configuration can update the database publication rule.
 * Publish/resume RPCs also require service_role: browsers cannot bypass this step. */
async function publicationWorker() {
  const worker = createWorkerSupabase();
  const { data, error } = await worker.from("app_features").update({ enabled: getFeatures().voiceRequired })
    .eq("key", "voice_required").select("key").maybeSingle();
  if (error) throw databaseError(error);
  if (!data) throw new ApiError(503, "SERVER_CONFIGURATION_ERROR", "게시 정책 설정을 확인하고 있습니다.");
  return worker;
}

export async function loadPublicationChecklist(db: DbClient, exhibitionId: string) {
  await rpc(db, "get_exhibition", { p_id: exhibitionId });
  await publicationWorker();
  return decodeDatabase(publicationChecklistResponse, await rpc(db, "get_publication_checklist", { p_exhibition_id: exhibitionId }));
}

export async function loadReview(db: DbClient, artworkId: string) {
  // Check owner before touching shared deployment configuration.
  await rpc(db, "get_artwork", { p_id: artworkId });
  await publicationWorker();
  const review = decodeDatabase(reviewResponse, await rpc(db, "get_review_bundle", { p_artwork_id: artworkId }));
  if (!getFeatures().expectedQa) delete review.expectedQa;
  return review;
}

export async function upsertEvidence(db: DbClient, artworkId: string, input: z.infer<typeof upsertEvidenceSchema>) {
  const artwork = decodeDatabase(artworkResponse, await rpc(db, "get_artwork", { p_id: artworkId }));
  return decodeDatabase(evidenceResponse, await rpc(db, "upsert_evidence", {
    ...rpcArgs(input), p_exhibition_id: artwork.exhibitionId,
    p_artwork_id: input.scope === "artwork" ? artworkId : null,
  }));
}

export async function approveArtwork(db: DbClient, artworkId: string, input: z.infer<typeof approvalSchema>) {
  if (input.kind === "evidence") {
    const review = await loadReview(db, artworkId);
    if (!review.evidence.some(item => item.id === input.evidenceId)) {
      throw new ApiError(404, "NOT_FOUND", "자료를 찾을 수 없습니다.");
    }
    return decodeDatabase(evidenceResponse, await rpc(db, "approve_evidence", {
      p_evidence_id: input.evidenceId, p_version: input.version,
    }));
  }
  return decodeDatabase(narrationApprovalResponse, await rpc(db, "approve_narration", {
    p_artwork_id: artworkId, p_expected_revision: input.expectedRevision, p_citations: input.citations,
  }));
}

export async function changePublication(db: DbClient, actorId: string, exhibitionId: string, input: z.infer<typeof publicationSchema>) {
  await rpc(db, "get_exhibition", { p_id: exhibitionId });
  if (input.action === "publish") {
    const worker = createWorkerSupabase();
    const voiceRequired = getFeatures().voiceRequired;
    let voice: ReturnType<typeof speechIdentity> | null = null;
    try {
      isMockMode(); // Reject a production mock configuration even for text-only publication.
    } catch (error) {
      const failure = normalizeAiOutcome(error);
      throw new ApiError(failure.status, failure.code, "음성 제공 설정을 확인해 주세요.");
    }
    try { voice = speechIdentity(); }
    catch (error) {
      if (voiceRequired) {
        const failure = normalizeAiOutcome(error);
        throw new ApiError(failure.status, failure.code, "음성 제공 설정을 확인해 주세요.");
      }
    }
    const fields = { requestId: input.requestId, expectedRevision: input.expectedRevision, artworks: input.artworks, intro: input.intro };
    const raw = await rpc(worker, "publish_with_audio_config", { p_owner: actorId, p_exhibition_id: exhibitionId,
      p_voice_required: voiceRequired, p_voice_fingerprint: voice?.fingerprint ?? null, p_mock: voice?.mock ?? false, ...rpcArgs(fields) });
    const envelope = decodeDatabase(z.object({ blocked: z.array(z.object({ artworkId: z.uuid(), reasons: z.array(z.string()) })),
      created: z.boolean(), exhibitionBlocked: z.array(z.string()).default([]) }), raw);
    if (envelope.exhibitionBlocked.length) throw new ApiError(409, "PUBLICATION_BLOCKED", "전시의 게시 준비를 확인해 주세요.",
      { exhibition: envelope.exhibitionBlocked });
    if (envelope.blocked.length) throw new ApiError(409, "PUBLICATION_BLOCKED", "선택한 작품의 게시 준비를 확인해 주세요.",
      Object.fromEntries(envelope.blocked.map(item => [item.artworkId, item.reasons])));
    return { ...decodeDatabase(publishedResponse, raw), _created: envelope.created };
  }
  const args = { p_exhibition_id: exhibitionId, p_expected_revision: input.expectedRevision, p_artwork_id: input.artworkId ?? null };
  const raw = input.action === "pause" ? await rpc(db, "pause", args)
    : await rpc(createWorkerSupabase(), "resume_with_audio_mode", { ...args, p_owner: actorId,
      p_voice_required: getFeatures().voiceRequired, p_mock: isMockMode() });
  return decodeDatabase(publicationStateResponse, raw);
}
