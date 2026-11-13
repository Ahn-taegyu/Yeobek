import { authenticatedDb, rpc } from "@/lib/api/db";
import { handleApi } from "@/lib/api/http";
import { decodeDatabase } from "@/lib/api/publication";
import { rpcArgs } from "@/lib/api/schemas";
import { listMaterialsQuery, materialListResponse } from "@/lib/contracts/materials";

export function GET(request: Request) {
  return handleApi(async () => {
    const db = await authenticatedDb();
    const query = listMaterialsQuery.parse(Object.fromEntries(new URL(request.url).searchParams));
    return decodeDatabase(materialListResponse, await rpc(db, "list_materials", rpcArgs(query)));
  });
}
