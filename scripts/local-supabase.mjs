import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { readFileSync } from "node:fs";

// Invoke the pinned local CLI without a shell or credentials on the command line.
export function localStatus() {
  const config = readFileSync(resolve("supabase/config.toml"), "utf8");
  if (!/project_id\s*=\s*"yeobek-mvp"/.test(config)) throw new Error("Expected the disposable yeobek-mvp stack.");
  let output;
  try {
    output = execFileSync(process.execPath, [resolve("node_modules/supabase/dist/supabase.js"), "status", "-o", "json"], {
      encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 30_000,
    });
  } catch { throw new Error("Start the local Supabase stack first. CLI output is withheld to protect keys."); }
  const status = JSON.parse(output);
  const apiUrl = status.API_URL;
  if (!apiUrl || !["127.0.0.1", "localhost"].includes(new URL(apiUrl).hostname)) throw new Error("Localhost Supabase is required.");
  return status;
}
