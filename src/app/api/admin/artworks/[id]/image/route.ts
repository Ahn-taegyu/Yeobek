import { authenticatedDb, rpc } from "@/lib/api/db";
import { assertSameOrigin, handleApi, readJson } from "@/lib/api/http";
import { setArtworkImageSchema } from "@/lib/contracts/materials";
import { uuid } from "@/lib/contracts/requests";
import { rpcArgs } from "@/lib/api/schemas";

export function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  return handleApi(async () => {
    assertSameOrigin(request);
    const db = await authenticatedDb();
    const artworkId = uuid.parse((await context.params).id);
    return rpc(db, "set_artwork_image", rpcArgs({ artworkId, ...await readJson(request, setArtworkImageSchema) }));
  });
}
