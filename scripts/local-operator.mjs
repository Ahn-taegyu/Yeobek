import { createClient } from "@supabase/supabase-js";
import { localStatus } from "./local-supabase.mjs";

// Explicit local UUID avoids account enumeration and never accepts a remote URL.
const args = process.argv.slice(2);
const id = args[0];
const disable = args[1] === "--disable";
if (!id || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id) ||
    args.length > 2 || (args.length === 2 && !disable)) {
  throw new Error("Usage: npm run db:operator -- <existing-local-user-uuid> [--disable]");
}
const status = localStatus();
const admin = createClient(status.API_URL, status.SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const { data, error } = await admin.auth.admin.getUserById(id);
if (error || !data.user || data.user.is_anonymous) throw new Error("A nonanonymous local account is required.");
const saved = await admin.from("operators").upsert({ user_id: data.user.id, enabled: !disable });
if (saved.error) throw new Error("Could not update local operator access. Apply local migrations first.");
console.log(disable ? "Disabled the specified local operator." : "Enabled the specified local operator.");
