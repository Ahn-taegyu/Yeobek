import { authenticatedDb, rpc } from "@/lib/api/db";
import { assertSameOrigin, handleApi, readJson } from "@/lib/api/http";
import { decodeDatabase } from "@/lib/api/publication";
import { rpcArgs } from "@/lib/api/schemas";
import { uuid } from "@/lib/contracts/requests";
import { evidenceResponse, upsertExhibitionEvidenceSchema } from "@/lib/contracts/publication";

export function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  return handleApi(async () => {
    assertSameOrigin(request);
    const db = await authenticatedDb();
    const id = uuid.parse((await context.params).id);
    await rpc(db, "get_exhibition", { p_id: id });
    const input = await readJson(request, upsertExhibitionEvidenceSchema);
    return decodeDatabase(evidenceResponse, await rpc(db, "upsert_evidence", {
      ...rpcArgs(input), p_exhibition_id: id, p_artwork_id: null,
    }));
  }, 201);
}
