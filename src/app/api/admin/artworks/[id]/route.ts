import { authenticatedDb, rpc } from "@/lib/api/db";
import { handleApi, assertSameOrigin, readJson } from "@/lib/api/http";
import { updateArtworkSchema, uuid, rpcArgs } from "@/lib/api/schemas";

type Context = { params: Promise<{ id: string }> };
export function GET(_request: Request, context: Context) {
  return handleApi(async () => {
    const db = await authenticatedDb();
    return rpc(db, "get_artwork", { p_id: uuid.parse((await context.params).id) });
  });
}
export function PATCH(request: Request, context: Context) {
  return handleApi(async () => {
    assertSameOrigin(request);
    const db = await authenticatedDb();
    const id = uuid.parse((await context.params).id);
    return rpc(db, "update_artwork", rpcArgs({ id, ...await readJson(request, updateArtworkSchema) }));
  });
}
