import { spawnSync } from "node:child_process";
import { loadAiEnv, projectRoot, requiredKeys } from "./ai-env.mjs";
const task = process.argv[2];
if (!Object.hasOwn(requiredKeys, task ?? "")) {
  console.error("Usage: npm run ai:smoke -- qa|draft|stt|typecast-tts|openai-tts [--audio=path]");
  process.exit(1);
}
loadAiEnv();
const missing = requiredKeys[task].filter(key => !process.env[key]?.trim());
if (missing.length) { console.error(`Missing server variables: ${missing.join(", ")}`); process.exit(1); }
if (task === "stt" && !process.argv[3]?.startsWith("--audio=")) {
  console.error("STT needs a consenting synthetic test recording: --audio=path (<=30s, <=3MiB)"); process.exit(1);
}
console.log(`Explicit live smoke: ${task}, one provider request; provider usage may be charged.`);
const result = spawnSync(process.execPath, ["node_modules/vitest/vitest.mjs", "run", "--config", "vitest.ai-live.config.ts"], {
  cwd: projectRoot, stdio: "inherit", shell: false,
  env: { ...process.env, AI_SMOKE_TASK: task, AI_SMOKE_AUDIO: process.argv[3]?.slice(8) ?? "" },
});
process.exitCode = result.status ?? 1;
