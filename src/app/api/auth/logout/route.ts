import { handleApi, assertSameOrigin, readJson } from "@/lib/api/http";
import { emptySchema } from "@/lib/api/schemas";
import { createServerSupabase } from "@/lib/supabase/server";
import { ApiError } from "@/lib/api/errors";

export function POST(request: Request) {
  return handleApi(async () => {
    assertSameOrigin(request);
    await readJson(request, emptySchema);
    const db = await createServerSupabase();
    const { error } = await db.auth.signOut({ scope: "local" });
    if (error) throw new ApiError(503, "SERVICE_UNAVAILABLE", "로그아웃하지 못했습니다. 다시 시도해 주세요.");
    return { authenticated: false };
  });
}
