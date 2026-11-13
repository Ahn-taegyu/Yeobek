import { assertSameOrigin, handleApi, readJson } from "@/lib/api/http";
import { checkVersionsRequest, checkVersionsResponse } from "@/lib/contracts/visitor";
import { uuid } from "@/lib/contracts/requests";
import { rpc } from "@/lib/api/db";
import { decodeDatabase } from "@/lib/api/publication";
import { createWorkerSupabase } from "@/lib/supabase/worker";

export function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  return handleApi(async () => {
    assertSameOrigin(request);
    const exhibitionId = uuid.parse((await context.params).id);
    const input = await readJson(request, checkVersionsRequest);
    // False covers unknown, unpublished and revoked references without disclosing private metadata.
    return decodeDatabase(checkVersionsResponse, await rpc(createWorkerSupabase({ timeoutMs: 15_000 }), "check_publication_versions", {
      p_exhibition_id: exhibitionId, p_publications: input.publications,
    }));
  });
}
