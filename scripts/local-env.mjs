import { existsSync, writeFileSync } from "node:fs";
import { localStatus } from "./local-supabase.mjs";

if (existsSync(".env.local")) throw new Error(".env.local already exists; preserve it and configure manually.");
const status = localStatus();
const key = status.PUBLISHABLE_KEY || status.ANON_KEY;
if (!key) throw new Error("Local publishable key is unavailable.");
writeFileSync(".env.local", [
  "NEXT_PUBLIC_SUPABASE_URL=" + status.API_URL,
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=" + key,
  "APP_ORIGIN=http://localhost:3000", "",
].join("\n"), { flag: "wx" });
console.log("Created ignored .env.local for the local stack. No keys printed.");
