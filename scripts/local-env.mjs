import { appendFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { localStatus } from "./local-supabase.mjs";

const status = localStatus();
const key = status.PUBLISHABLE_KEY || status.ANON_KEY;
if (!key) throw new Error("Local publishable key is unavailable.");
if (!status.SERVICE_ROLE_KEY) throw new Error("Local service-role key is unavailable.");
if (existsSync(".env.local")) {
  if (!process.argv.includes("--worker")) throw new Error(".env.local already exists; preserve it or use --worker to add only the local worker key.");
  const env = readFileSync(".env.local", "utf8");
  if (/^SUPABASE_SERVICE_ROLE_KEY=/m.test(env)) throw new Error("Worker key already exists; existing values are preserved.");
  const configured = env.match(/^NEXT_PUBLIC_SUPABASE_URL=(.*)$/m)?.[1].trim();
  if (!configured || new URL(configured).origin !== new URL(status.API_URL).origin) throw new Error("The existing environment must target this local stack.");
  appendFileSync(".env.local", "\nSUPABASE_SERVICE_ROLE_KEY=" + status.SERVICE_ROLE_KEY + "\n");
  console.log("Added the ignored local worker key. Existing configuration preserved; no keys printed.");
  process.exit(0);
}
writeFileSync(".env.local", [
  "NEXT_PUBLIC_SUPABASE_URL=" + status.API_URL,
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=" + key,
  "SUPABASE_SERVICE_ROLE_KEY=" + status.SERVICE_ROLE_KEY,
  "APP_ORIGIN=http://localhost:3000", "",
].join("\n"), { flag: "wx" });
console.log("Created ignored .env.local for the local stack. No keys printed.");
