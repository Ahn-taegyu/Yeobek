import { authenticatedContext, rpc } from "@/lib/api/db";
import { assertSameOrigin, handleApi, readJson } from "@/lib/api/http";
import { decodeDatabase } from "@/lib/api/publication";
import { emptySchema, uuid } from "@/lib/contracts/requests";
import { gapResponse } from "@/lib/contracts/visitor";
import { requireFeature } from "@/lib/features";
import { createWorkerSupabase } from "@/lib/supabase/worker";

export function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  return handleApi(async () => {
    requireFeature("gaps");
    assertSameOrigin(request);
    const { user } = await authenticatedContext();
    await readJson(request, emptySchema);
    return decodeDatabase(gapResponse, await rpc(createWorkerSupabase(), "dismiss_gap", {
      p_owner: user.id, p_id: uuid.parse((await context.params).id), p_enabled: true,
    }));
  });
}
