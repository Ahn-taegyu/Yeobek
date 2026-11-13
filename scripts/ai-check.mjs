import { spawnSync } from "node:child_process";
import { loadAiEnv, projectRoot } from "./ai-env.mjs";
loadAiEnv();
const result = spawnSync(process.execPath, ["node_modules/vitest/vitest.mjs", "run", "--config", "vitest.ai-live.config.ts"], {
  cwd: projectRoot, stdio: "inherit", shell: false,
  env: { ...process.env, AI_SMOKE_TASK: "check", AI_SMOKE_AUDIO: "" },
});
process.exitCode = result.status ?? 1;
