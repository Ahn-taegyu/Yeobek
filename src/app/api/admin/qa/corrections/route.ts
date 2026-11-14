import { authenticatedDb, rpc } from "@/lib/api/db";
import { assertSameOrigin, handleApi, readJson } from "@/lib/api/http";
import { decodeDatabase } from "@/lib/api/publication";
import { qaCorrectionEvidenceSchema } from "@/lib/contracts/qa";
import { evidenceResponse } from "@/lib/contracts/publication";
import { requireFeature } from "@/lib/features";

export function POST(request: Request) {
  return handleApi(async () => {
    assertSameOrigin(request);
    requireFeature("expectedQa");
    requireFeature("qaRewrite");
    const db = await authenticatedDb();
    const input = await readJson(request, qaCorrectionEvidenceSchema);
    return decodeDatabase(evidenceResponse, await rpc(db, "create_qa_correction_evidence", {
      p_target_kind: input.targetKind, p_target_id: input.targetId, p_target_version: input.targetVersion,
      p_request_id: input.requestId, p_source_label: input.sourceLabel, p_source_body: input.sourceBody,
    }));
  });
}
