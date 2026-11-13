import { spawnSync } from "node:child_process";
import { loadAiEnv, projectRoot, narrationKeys } from "./ai-env.mjs";
import { parseCompareOptions } from "./ai-compare-options.mjs";

try {
  const options = parseCompareOptions(process.argv.slice(2));
  if (options.mode === "live") {
    loadAiEnv();
    const missing = narrationKeys.filter(key => !process.env[key]?.trim());
    if (missing.length) throw new Error(`Missing server variables: ${missing.join(", ")}`);
  }
  console.log(`${options.mode === "live" ? "LIVE, provider charges possible" : "OFFLINE SIMULATION, no quality/cost/latency evidence"}: ${options.cases.length} cases x ${options.repeats} repeats; at most ${options.reservedCalls} provider calls.`);
  const child = spawnSync(process.execPath, ["node_modules/vitest/vitest.mjs", "run", "--config", "vitest.ai-compare.config.ts", "--reporter=default", "--silent=false"], {
    cwd: projectRoot, stdio: "inherit", shell: false, env: { ...process.env, AI_COMPARE_OPTIONS: JSON.stringify(options) },
  });
  process.exitCode = child.status ?? 1;
} catch (error) {
  console.error(error instanceof Error ? error.message : "Invalid comparison options.");
  process.exitCode = 1;
}
