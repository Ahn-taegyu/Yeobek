import { authenticatedContext, rpc } from "@/lib/api/db";
import { handleApi } from "@/lib/api/http";
import { decodeDatabase } from "@/lib/api/publication";
import { uuid } from "@/lib/contracts/requests";
import { gapListResponse } from "@/lib/contracts/visitor";
import { requireFeature } from "@/lib/features";
import { createWorkerSupabase } from "@/lib/supabase/worker";

export function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  return handleApi(async () => {
    requireFeature("gaps");
    const { user } = await authenticatedContext();
    return decodeDatabase(gapListResponse, await rpc(createWorkerSupabase(), "list_gaps", {
      p_owner: user.id, p_exhibition_id: uuid.parse((await context.params).id), p_enabled: true,
    }));
  });
}
