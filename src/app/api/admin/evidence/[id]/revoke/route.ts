import { authenticatedDb, rpc } from "@/lib/api/db";
import { assertSameOrigin, handleApi, readJson } from "@/lib/api/http";
import { decodeDatabase } from "@/lib/api/publication";
import { uuid } from "@/lib/contracts/requests";
import { revokeEvidenceSchema, revokeImpactResponse } from "@/lib/contracts/publication";

export function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  return handleApi(async () => {
    assertSameOrigin(request);
    const db = await authenticatedDb();
    const input = await readJson(request, revokeEvidenceSchema);
    return decodeDatabase(revokeImpactResponse, await rpc(db, "revoke_evidence", {
      p_evidence_id: uuid.parse((await context.params).id), p_expected_version: input.expectedVersion,
      p_impact_token: input.impactToken,
    }));
  });
}
