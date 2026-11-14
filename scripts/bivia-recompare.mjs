import { spawnSync } from "node:child_process";
import { loadAiEnv, projectRoot } from "./ai-env.mjs";

const args = process.argv.slice(2);
if (args.length !== 1 || !["--mode=replay", "--mode=benchmark-free", "--mode=answers-credit", "--mode=judge-credit"].includes(args[0])) {
  console.error("Use --mode=replay (offline), --mode=benchmark-free (288 Bivia calls), --mode=answers-credit (120 answers + 60 judgments), or --mode=judge-credit (60 judgments of frozen answers). Credit modes require explicit paid authorization. See docs/research/bivia-answer-comparison.md.");
  process.exitCode = 1;
} else {
  if (args[0] !== "--mode=replay") loadAiEnv();
  const child = spawnSync(process.execPath, ["node_modules/vitest/vitest.mjs", "run", "--config", "vitest.bivia-recompare.config.ts", "--silent=false"], {
    cwd: projectRoot, stdio: "inherit", shell: false, env: { ...process.env, BIVIA_RECOMPARE_MODE: args[0].slice(7) },
  });
  process.exitCode = child.status ?? 1;
}
