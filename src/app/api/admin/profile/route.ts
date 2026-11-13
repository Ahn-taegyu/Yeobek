import { authenticatedDb, rpc } from "@/lib/api/db";
import { handleApi, assertSameOrigin, readJson } from "@/lib/api/http";
import { profileSchema, rpcArgs } from "@/lib/api/schemas";

export function GET() { return handleApi(async () => rpc(await authenticatedDb(), "get_artist_profile", {})); }
export function PATCH(request: Request) {
  return handleApi(async () => {
    assertSameOrigin(request);
    const db = await authenticatedDb();
    return rpc(db, "update_artist_profile", rpcArgs(await readJson(request, profileSchema)));
  });
}
