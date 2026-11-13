import { authenticatedDb, rpc } from "@/lib/api/db";
import { assertSameOrigin, handleApi, readJson } from "@/lib/api/http";
import { decodeDatabase } from "@/lib/api/publication";
import { uuid } from "@/lib/contracts/requests";
import { evidenceImpactSchema, revokeImpactResponse } from "@/lib/contracts/publication";

export function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  return handleApi(async () => {
    assertSameOrigin(request);
    const db = await authenticatedDb();
    const input = await readJson(request, evidenceImpactSchema);
    return decodeDatabase(revokeImpactResponse, await rpc(db, "get_revoke_impact", {
      p_evidence_id: uuid.parse((await context.params).id), p_expected_version: input.expectedVersion,
    }));
  });
}
