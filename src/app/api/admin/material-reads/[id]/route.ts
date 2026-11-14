import { authenticatedDb, rpc } from "@/lib/api/db";
import { handleApi } from "@/lib/api/http";
import { decodeDatabase } from "@/lib/api/publication";
import { uuid } from "@/lib/contracts/requests";
import { materialReadResponse } from "@/lib/contracts/material-extraction";

export function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  return handleApi(async () => decodeDatabase(materialReadResponse, await rpc(await authenticatedDb(), "get_material_read",
    { p_request_id: uuid.parse((await context.params).id) })));
}
