import { handleApi } from "@/lib/api/http";
import { rpc } from "@/lib/api/db";
import { uuid } from "@/lib/api/schemas";
import { createPublicSupabase } from "@/lib/supabase/server";
import { ApiError } from "@/lib/api/errors";

export function GET(_request: Request, context: { params: Promise<{ id: string; artworkId: string }> }) {
  return handleApi(async () => {
    const params = await context.params;
    const data = await rpc(createPublicSupabase(), "get_public_artwork", {
      p_exhibition_id: uuid.parse(params.id), p_id: uuid.parse(params.artworkId),
    });
    if (!data) throw new ApiError(404, "NOT_FOUND", "작품을 찾을 수 없습니다.");
    return data;
  });
}
