import { ApiError } from "@/lib/api/errors";

export function supabaseEnvironment() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new ApiError(503, "SERVICE_UNAVAILABLE", "서비스 연결을 준비하고 있습니다.");
  return { url, key };
}
