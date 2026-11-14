import { spawnSync } from "node:child_process";
import { loadAiEnv, projectRoot } from "./ai-env.mjs";

const args = process.argv.slice(2);
if (args.length === 1 && args[0] === "--help") {
  console.log("npm run ai:compare:bivia -- --mode=baseline|preflight|live-free --split=smoke|dev|eval --repeats=1 --max-calls=24\nDefault: baseline/eval/1, no network. Live-free requires BIVIA_API_KEY and .ai-eval/bivia-free-allowance.json. See docs/research/bivia-retrieval-experiment.md.");
} else {
  // Only this exact, explicitly selected mode reads credentials. Parser rejects duplicates.
  if (args.includes("--mode=live-free")) loadAiEnv();
  const child = spawnSync(process.execPath, ["node_modules/vitest/vitest.mjs", "run", "--config", "vitest.bivia-compare.config.ts", "--silent=false"], {
    cwd: projectRoot, stdio: "inherit", shell: false, env: { ...process.env, BIVIA_COMPARE_ARGS: JSON.stringify(args) },
  });
  process.exitCode = child.status ?? 1;
}
