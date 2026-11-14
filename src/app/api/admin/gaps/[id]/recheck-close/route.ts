import { authenticatedContext, rpc } from "@/lib/api/db";
import { assertSameOrigin, handleApi, readJson } from "@/lib/api/http";
import { decodeDatabase } from "@/lib/api/publication";
import { uuid } from "@/lib/contracts/requests";
import { closeGapRecheckSchema, gapResponse } from "@/lib/contracts/visitor";
import { requireFeature } from "@/lib/features";
import { createWorkerSupabase } from "@/lib/supabase/worker";

export function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  return handleApi(async () => {
    assertSameOrigin(request);
    requireFeature("gaps");
    const { user } = await authenticatedContext();
    const input = await readJson(request, closeGapRecheckSchema);
    return decodeDatabase(gapResponse, await rpc(createWorkerSupabase(), "close_gap_recheck", {
      p_owner: user.id, p_id: uuid.parse((await context.params).id), p_enabled: true,
      p_expected_publication_id: input.expectedPublicationId,
    }));
  });
}
