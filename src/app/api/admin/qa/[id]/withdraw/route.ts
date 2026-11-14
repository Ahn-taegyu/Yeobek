import { authenticatedDb, rpc } from "@/lib/api/db";
import { assertSameOrigin, handleApi, readJson } from "@/lib/api/http";
import { decodeDatabase } from "@/lib/api/publication";
import { withdrawQaItemSchema, qaItemResponse } from "@/lib/contracts/qa";
import { uuid } from "@/lib/contracts/requests";
import { requireFeature } from "@/lib/features";

export function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  return handleApi(async () => {
    assertSameOrigin(request);
    requireFeature("expectedQa");
    const db = await authenticatedDb();
    const input = await readJson(request, withdrawQaItemSchema);
    return decodeDatabase(qaItemResponse, await rpc(db, "withdraw_qa_item", {
      p_item_id: uuid.parse((await context.params).id), p_expected_version: input.expectedVersion,
    }));
  });
}
