import { authenticatedDb, rpc } from "@/lib/api/db";
import { assertSameOrigin, handleApi, readJson } from "@/lib/api/http";
import { reorderArtworksSchema } from "@/lib/contracts/authoring";
import { AUTHORING_JSON_BYTES } from "@/lib/contracts/knowledge-sections";
import { rpcArgs, uuid } from "@/lib/api/schemas";

export function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  return handleApi(async () => {
    assertSameOrigin(request);
    const db = await authenticatedDb();
    const id = uuid.parse((await context.params).id);
    return rpc(db, "reorder_artworks", { p_exhibition_id: id, ...rpcArgs(await readJson(request, reorderArtworksSchema, AUTHORING_JSON_BYTES)) });
  });
}
