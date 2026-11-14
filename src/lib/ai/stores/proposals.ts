import "server-only";
import { z } from "zod";
import { rpc, type DbClient } from "../../api/db";
import { ApiError } from "../../api/errors";
import { decodeDatabase } from "../../api/publication";
import { documentContent, appliedProposalResponse, proposalResponse } from "../../contracts/proposals";
import { revision } from "../../contracts/requests";
import { validateArtistKnowledgeContext, type ArtistKnowledgeStore, type KnowledgeProposal } from "../artist-knowledge";

const loadedSchema = z.object({ proposal: z.unknown(), before: documentContent.extend({ revision }), mock: z.boolean() });

/** The write buffer belongs to ONE reserved job. job.complete persists the
 * candidate and audit result atomically; stage success alone is not durability. */
export function createProposalStore(db: DbClient, actorId: string) {
  let staged: KnowledgeProposal | null = null;
  const store: ArtistKnowledgeStore = {
    async loadOwnedContext(actor, documentId, signal) {
      signal?.throwIfAborted();
      if (actor !== actorId) return null;
      const raw = await rpc(db, "get_organize_context", { p_document_id: documentId });
      signal?.throwIfAborted();
      return validateArtistKnowledgeContext(raw, actorId, documentId);
    },
    async storeProposal(proposal, signal) {
      signal?.throwIfAborted();
      if (proposal.ownerId !== actorId || staged !== null) throw new ApiError(409, "JOB_ATTEMPT_CONFLICT", "정리 작업을 다시 확인해 주세요.");
      staged = structuredClone(proposal);
    },
    async loadOwnedProposal(actor, proposalId, signal) {
      signal?.throwIfAborted();
      if (actor !== actorId) return null;
      const raw = decodeDatabase(loadedSchema, await rpc(db, "load_proposal", { p_id: proposalId }));
      signal?.throwIfAborted();
      return raw.proposal;
    },
    async commitOwnedProposal(actor, proposalId, signal) {
      signal?.throwIfAborted();
      if (actor !== actorId) throw new ApiError(404, "NOT_FOUND", "자료를 찾을 수 없습니다.");
      // Do not race/cancel the atomic mutation; a lost reply is recovered by replay.
      return decodeDatabase(appliedProposalResponse, await rpc(db, "commit_proposal", { p_id: proposalId, p_reviewed: true }));
    },
  };
  return { store, staged: () => staged };
}

/** Project an internal immutable proposal into a review document, removing
 * owner identifiers, plugin metadata, selection IDs and content fingerprints. */
export async function loadProposalReview(db: DbClient, id: string) {
  const raw = decodeDatabase(loadedSchema.extend({ proposal: documentContent.extend({
    id: z.uuid(), documentId: z.uuid(), targetRevision: revision, expiresAt: z.number().int().positive(), appliedRevision: revision.nullable(),
  }) }), await rpc(db, "load_proposal", { p_id: id }));
  const { proposal, before, mock } = raw;
  const keys = new Set([...before.sections, ...proposal.sections].map(section => section.id));
  const changes = [...keys].flatMap(sectionId => {
    const oldBody = before.sections.find(section => section.id === sectionId)?.body ?? null;
    const newBody = proposal.sections.find(section => section.id === sectionId)?.body ?? null;
    return oldBody === newBody ? [] : [{ sectionId, before: oldBody, after: newBody }];
  });
  return decodeDatabase(proposalResponse, { id: proposal.id, documentId: proposal.documentId,
    targetRevision: proposal.targetRevision, expiresAt: new Date(proposal.expiresAt).toISOString(),
    appliedRevision: proposal.appliedRevision, mock, before,
    proposed: { sections: proposal.sections, sourceRefs: proposal.sourceRefs }, changes });
}
