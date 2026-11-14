import { createArtworkBody } from "@/lib/contracts/authoring";
import { AUTHORING_JSON_BYTES } from "@/lib/contracts/knowledge-sections";
import { authenticatedDb, rpc } from "@/lib/api/db";
import { handleApi, assertSameOrigin, readJson } from "@/lib/api/http";
import { uuid, rpcArgs } from "@/lib/api/schemas";

type Context = { params: Promise<{ id: string }> };
export function GET(_request: Request, context: Context) {
  return handleApi(async () => {
    const db = await authenticatedDb();
    return { items: await rpc(db, "list_artworks", { p_exhibition_id: uuid.parse((await context.params).id) }) };
  });
}
export function POST(request: Request, context: Context) {
  return handleApi(async () => {
    assertSameOrigin(request);
    const db = await authenticatedDb();
    const exhibitionId = uuid.parse((await context.params).id);
    const input = await readJson(request, createArtworkBody, AUTHORING_JSON_BYTES);
    if ("draft" in input) {
      const { draft, ...values } = input;
      void draft;
      return rpc(db, "create_artwork_draft", rpcArgs({ ...values, exhibitionId }));
    }
    return rpc(db, "create_artwork", rpcArgs({ ...input, exhibitionId }));
  });
}
