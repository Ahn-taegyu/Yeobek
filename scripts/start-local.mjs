import { execFileSync, spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { readFileSync } from "node:fs";

const config = readFileSync("supabase/config.toml", "utf8");
if (!/project_id\s*=\s*"yeobek-mvp"/.test(config)) throw new Error("Expected the disposable yeobek-mvp stack.");
const network = "yeobek-local";
let exists = true;
try { execFileSync("docker", ["network", "inspect", network], { stdio: "ignore" }); }
catch { exists = false; }
if (!exists) execFileSync("docker", ["network", "create", "-o", "com.docker.network.bridge.host_binding_ipv4=127.0.0.1", network], { stdio: "ignore" });
const info = JSON.parse(execFileSync("docker", ["network", "inspect", network], { encoding: "utf8" }));
if (info[0]?.Options?.["com.docker.network.bridge.host_binding_ipv4"] !== "127.0.0.1") {
  throw new Error("The local network must bind published ports to 127.0.0.1. Check existing network ownership before changing it.");
}
console.log("Starting local Supabase. The first run downloads container images.");
const result = spawnSync(process.execPath, [resolve("node_modules/supabase/dist/supabase.js"), "start", "--network-id", network], {
  stdio: ["inherit", "ignore", "inherit"],
});
if (result.status !== 0) throw new Error("Local Supabase did not start. Check Docker and the CLI errors above.");
console.log("Local Supabase is ready. Run npm run db:env to create a local environment file.");
