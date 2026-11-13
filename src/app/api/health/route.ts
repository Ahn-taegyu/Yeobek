import { handleApi } from "@/lib/api/http";
import { createPublicSupabase } from "@/lib/supabase/server";
import { ApiError } from "@/lib/api/errors";

export const dynamic = "force-dynamic";
export function GET() {
  return handleApi(async () => {
    const db = createPublicSupabase();
    const { error } = await db.rpc("get_public_exhibition", { p_id: "00000000-0000-0000-0000-000000000000" })
      .abortSignal(AbortSignal.timeout(3000));
    if (error) throw new ApiError(503, "SERVICE_UNAVAILABLE", "서비스 연결을 확인하고 있습니다.");
    return { status: "ok" };
  });
}
