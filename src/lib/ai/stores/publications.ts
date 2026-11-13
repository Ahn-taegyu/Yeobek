import "server-only";
import { rpc, type DbClient } from "../../api/db";
import { assertNotCancelled } from "../context";
import type { PublicationStore } from "../contracts";

/** Service RPCs enforce current public state and cross-exhibition revocation. */
export function createPublicationStore(worker: DbClient): PublicationStore {
  return {
    async load(selector, signal) {
      assertNotCancelled(signal);
      const result = await rpc(worker, "load_publication_context", {
        p_exhibition_id: selector.exhibitionId,
        p_artwork_id: "artworkId" in selector ? selector.artworkId : null,
        p_number: "number" in selector ? selector.number : null,
      });
      assertNotCancelled(signal);
      return result;
    },
    async isCurrent(ref, signal) {
      assertNotCancelled(signal);
      const result = await rpc(worker, "is_publication_current", {
        p_exhibition_id: ref.exhibitionId, p_artwork_id: ref.artworkId,
        p_publication_id: ref.publicationId, p_version: ref.version,
      });
      assertNotCancelled(signal);
      return result === true;
    },
  };
}
