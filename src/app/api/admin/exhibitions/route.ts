import { authenticatedDb, rpc } from "@/lib/api/db";
import { handleApi, assertSameOrigin, readJson } from "@/lib/api/http";
import { createExhibitionSchema, rpcArgs } from "@/lib/api/schemas";

export function GET() {
  return handleApi(async () => ({ items: await rpc(await authenticatedDb(), "list_exhibitions", {}) }));
}
export function POST(request: Request) {
  return handleApi(async () => {
    assertSameOrigin(request);
    const db = await authenticatedDb();
    return rpc(db, "create_exhibition", rpcArgs(await readJson(request, createExhibitionSchema)));
  });
}
