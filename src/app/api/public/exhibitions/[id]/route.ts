import { handleApi } from "@/lib/api/http";
import { rpc } from "@/lib/api/db";
import { uuid } from "@/lib/api/schemas";
import { createPublicSupabase } from "@/lib/supabase/server";
import { ApiError } from "@/lib/api/errors";

export function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  return handleApi(async () => {
    const data = await rpc(createPublicSupabase(), "get_public_exhibition", { p_id: uuid.parse((await context.params).id) });
    if (!data) throw new ApiError(404, "NOT_FOUND", "전시를 찾을 수 없습니다.");
    return data;
  });
}
