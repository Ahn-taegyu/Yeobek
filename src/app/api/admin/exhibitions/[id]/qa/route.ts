import { authenticatedDb, rpc } from "@/lib/api/db";
import { handleApi } from "@/lib/api/http";
import { decodeDatabase } from "@/lib/api/publication";
import { qaListQuery, qaItemsResponse } from "@/lib/contracts/qa";
import { uuid } from "@/lib/contracts/requests";
import { requireFeature } from "@/lib/features";

export function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  return handleApi(async () => {
    requireFeature("expectedQa");
    const db = await authenticatedDb();
    const input = qaListQuery.parse(Object.fromEntries(new URL(request.url).searchParams));
    return decodeDatabase(qaItemsResponse, await rpc(db, "list_qa_items", {
      p_exhibition_id: uuid.parse((await context.params).id), p_artwork_id: input.artworkId ?? null,
    }));
  });
}
