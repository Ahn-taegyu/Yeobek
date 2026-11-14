import "server-only";
import { createServerSupabase } from "@/lib/supabase/server";
import { ApiError, databaseError, authenticationError } from "./errors";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

export type DbClient = SupabaseClient<Database>;
export async function authenticatedContext() {
  const db = await createServerSupabase();
  const { data, error } = await db.auth.getUser();
  if (error) throw authenticationError(error);
  if (!data.user) throw new ApiError(401, "UNAUTHENTICATED", "로그인이 필요합니다.");
  if (Object.hasOwn(data.user.app_metadata, "yeobek_signup_request_id")) {
    const message = "이메일 인증을 완료한 뒤 비밀번호로 직접 로그인해 주세요.";
    if (!data.user.email_confirmed_at) throw new ApiError(401, "UNAUTHENTICATED", message);
    const result = await db.auth.getClaims();
    if (result.error) throw authenticationError(result.error, message);
    const claims = result.data?.claims;
    if (claims?.sub !== data.user.id || !Array.isArray(claims.amr) ||
      !claims.amr.some(entry => entry && typeof entry === "object" && entry.method === "password")) {
      throw new ApiError(401, "UNAUTHENTICATED", message);
    }
  }
  return { db, user: data.user };
}

export async function authenticatedDb() { return (await authenticatedContext()).db; }
type Functions = Database["public"]["Functions"];
export async function rpc<Name extends keyof Functions>(
  db: DbClient, name: Name, args: Record<string, unknown>, signal?: AbortSignal,
) {
  // HTTP schemas validate inputs; SQL validates relations and nullable arguments.
  const request = db.rpc(name, args as Functions[Name]["Args"]);
  const { data, error } = await (signal ? request.abortSignal(signal) : request);
  if (error) throw databaseError(error);
  return data;
}

export async function documentSubject(db: DbClient, id: string) {
  const { data, error } = await db.from("knowledge_documents").select("subject_type,subject_id").eq("id", id).maybeSingle();
  if (error) throw databaseError(error);
  if (!data?.subject_type || !data.subject_id) throw new ApiError(404, "NOT_FOUND", "자료를 찾을 수 없습니다.");
  return { p_subject_type: data.subject_type, p_subject_id: data.subject_id };
}
