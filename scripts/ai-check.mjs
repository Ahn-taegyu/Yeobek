import { spawnSync } from "node:child_process";
import { loadAiEnv, projectRoot } from "./ai-env.mjs";
const args = process.argv.slice(2);
if (args.length > 1 || (args.length === 1 && args[0] !== "--text")) {
  console.error("Usage: npm run ai:check [-- --text]");
  process.exit(1);
}
loadAiEnv();
const result = spawnSync(process.execPath, ["node_modules/vitest/vitest.mjs", "run", "--config", "vitest.ai-live.config.ts"], {
  cwd: projectRoot, stdio: "inherit", shell: false,
  env: { ...process.env, AI_SMOKE_TASK: "check", AI_SMOKE_AUDIO: "", AI_CHECK_SCOPE: args[0] === "--text" ? "text" : "all" },
});
process.exitCode = result.status ?? 1;
