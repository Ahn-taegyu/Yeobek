import "server-only";
import { createServerSupabase } from "@/lib/supabase/server";
import { ApiError, databaseError, authenticationError } from "./errors";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

export type DbClient = SupabaseClient<Database>;
export async function authenticatedDb() {
  const db = await createServerSupabase();
  const { data, error } = await db.auth.getUser();
  if (error) throw authenticationError(error);
  if (!data.user) throw new ApiError(401, "UNAUTHENTICATED", "로그인이 필요합니다.");
  return db;
}
type Functions = Database["public"]["Functions"];
export async function rpc<Name extends keyof Functions>(
  db: DbClient, name: Name, args: Record<string, unknown>,
) {
  // HTTP schemas validate inputs; SQL validates relations and nullable arguments.
  const { data, error } = await db.rpc(name, args as Functions[Name]["Args"]);
  if (error) throw databaseError(error);
  return data;
}

export async function documentSubject(db: DbClient, id: string) {
  const { data, error } = await db.from("knowledge_documents").select("subject_type,subject_id").eq("id", id).maybeSingle();
  if (error) throw databaseError(error);
  if (!data?.subject_type || !data.subject_id) throw new ApiError(404, "NOT_FOUND", "자료를 찾을 수 없습니다.");
  return { p_subject_type: data.subject_type, p_subject_id: data.subject_id };
}
