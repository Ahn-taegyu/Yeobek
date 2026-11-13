import "server-only";
import { createClient } from "@supabase/supabase-js";
import { ApiError } from "../api/errors";
import type { Database } from "./database.types";

/** No cookies or user token. Only server-owned job transitions use this client.
 * The authenticated owner must be passed from getUser(), never from JSON input. */
export function createWorkerSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key?.trim()) throw new ApiError(503, "SERVER_CONFIGURATION_ERROR", "작업 저장 연결 설정을 확인하고 있습니다.");
  return createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}
