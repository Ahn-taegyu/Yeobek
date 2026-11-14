import { AUTHORING_JSON_BYTES } from "@/lib/contracts/knowledge-sections";
import { authenticatedContext, authenticatedDb, rpc } from "@/lib/api/db";
import { handleApi, assertSameOrigin, readJson } from "@/lib/api/http";
import { profileSchema, rpcArgs } from "@/lib/api/schemas";

export function GET() { return handleApi(async () => {
  const { db, user } = await authenticatedContext();
  const profile = await rpc(db, "get_artist_profile", {});
  return { ...(profile as Record<string, unknown>), accountEmail: user.email ?? null };
}); }
export function PATCH(request: Request) {
  return handleApi(async () => {
    assertSameOrigin(request);
    const db = await authenticatedDb();
    return rpc(db, "update_artist_profile", rpcArgs(await readJson(request, profileSchema, AUTHORING_JSON_BYTES)));
  });
}
