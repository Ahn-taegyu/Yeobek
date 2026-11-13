import { authenticatedDb, rpc } from "@/lib/api/db";
import { handleApi } from "@/lib/api/http";
import { decodeDatabase } from "@/lib/api/publication";
import { uuid } from "@/lib/contracts/requests";
import { labelsResponse } from "@/lib/contracts/publication";

export function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  return handleApi(async () => decodeDatabase(labelsResponse, await rpc(await authenticatedDb(), "list_labels", {
    p_exhibition_id: uuid.parse((await context.params).id),
  })));
}
