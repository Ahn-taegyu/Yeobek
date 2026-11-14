import { authenticatedDb, rpc } from "@/lib/api/db";
import { assertSameOrigin, handleApi, readJson } from "@/lib/api/http";
import { decodeDatabase } from "@/lib/api/publication";
import { approveQaItemSchema, qaItemResponse } from "@/lib/contracts/qa";
import { uuid } from "@/lib/contracts/requests";
import { requireFeature } from "@/lib/features";

export function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  return handleApi(async () => {
    assertSameOrigin(request);
    requireFeature("expectedQa");
    const db = await authenticatedDb();
    const input = await readJson(request, approveQaItemSchema);
    return decodeDatabase(qaItemResponse, await rpc(db, "approve_qa_item", {
      p_item_id: uuid.parse((await context.params).id), p_expected_version: input.expectedVersion, p_evidence_pins: input.evidencePins,
    }));
  });
}
