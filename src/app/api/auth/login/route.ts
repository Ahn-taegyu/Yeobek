import { handleApi, assertSameOrigin, readJson } from "@/lib/api/http";
import { loginSchema } from "@/lib/api/schemas";
import { createServerSupabase } from "@/lib/supabase/server";
import { authenticationError } from "@/lib/api/errors";

export function POST(request: Request) {
  return handleApi(async () => {
    assertSameOrigin(request);
    const input = await readJson(request, loginSchema);
    const db = await createServerSupabase();
    const { error } = await db.auth.signInWithPassword(input);
    if (error) throw authenticationError(error, "이메일과 비밀번호를 확인해 주세요.", "INVALID_CREDENTIALS");
    return { authenticated: true };
  });
}
