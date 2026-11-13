import { authenticatedDb, rpc } from "@/lib/api/db";
import { assertSameOrigin, handleApi, readJson } from "@/lib/api/http";
import { deleteArtworkSchema } from "@/lib/contracts/materials";
import { uuid } from "@/lib/contracts/requests";
import { rpcArgs } from "@/lib/api/schemas";

export function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  return handleApi(async () => {
    assertSameOrigin(request);
    const db = await authenticatedDb();
    const id = uuid.parse((await context.params).id);
    return rpc(db, "delete_artwork", rpcArgs({ id, ...await readJson(request, deleteArtworkSchema) }));
  });
}
