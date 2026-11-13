import "server-only";
import { rpc, type DbClient } from "../../api/db";
import { validateArtistKnowledgeContext, type ArtistKnowledgeStore } from "../artist-knowledge";

/** Bind both the verified actor and artwork. Every read rechecks SQL ownership. */
export function createAuthorStore(db: DbClient, actorId: string, artworkId: string): Pick<ArtistKnowledgeStore, "loadOwnedContext"> {
  return {
    async loadOwnedContext(actor, documentId, signal) {
      signal?.throwIfAborted();
      if (actor !== actorId) return null;
      const raw = await rpc(db, "get_narration_context", { p_artwork_id: artworkId });
      signal?.throwIfAborted();
      return validateArtistKnowledgeContext(raw, actorId, documentId);
    },
  };
}
