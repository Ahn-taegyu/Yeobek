import "server-only";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { supabaseEnvironment } from "./env";
import type { Database } from "./database.types";

export async function createServerSupabase() {
  const { url, key } = supabaseEnvironment();
  const store = await cookies();
  return createServerClient<Database>(url, key, {
    cookieOptions: {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.APP_ORIGIN ? new URL(process.env.APP_ORIGIN).protocol === "https:" : process.env.NODE_ENV === "production",
    },
    cookies: {
      getAll: () => store.getAll(),
      setAll: (values) => {
        // Route handlers that mutate cookies return private/no-store API responses.
        for (const { name, value, options } of values) store.set(name, value, options);
      },
    },
  });
}
export function createPublicSupabase() {
  const { url, key } = supabaseEnvironment();
  return createClient<Database>(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
