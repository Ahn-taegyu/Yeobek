import { readFileSync, writeFileSync, realpathSync } from "node:fs";
import { resolve, relative, isAbsolute } from "node:path";
import { projectRoot } from "./ai-env.mjs";
import { humanLabelsSchema, reviewKeySchema, summarizeHumanLabels } from "../src/lib/ai/narration-report.ts";
try {
  if (process.argv.length !== 3) throw new Error();
  const root = realpathSync(resolve(projectRoot, ".ai-eval"));
  const folder = realpathSync(resolve(projectRoot, process.argv[2]));
  const child = relative(root, folder);
  if (!child || child.startsWith("..") || isAbsolute(child)) throw new Error();
  const labels = humanLabelsSchema.parse(JSON.parse(readFileSync(resolve(folder, "human-labels.json"), "utf8")));
  const key = reviewKeySchema.parse(JSON.parse(readFileSync(resolve(folder, "key.json"), "utf8")));
  const report = JSON.parse(readFileSync(resolve(folder, "report.json"), "utf8"));
  if (!["mock", "live"].includes(report.mode) || typeof report.pluginVersion !== "string" || !/^[a-f0-9]{64}$/.test(report.fixtureHash)) throw new Error();
  const summary = { mode: report.mode, pluginVersion: report.pluginVersion, fixtureHash: report.fixtureHash,
    disclaimer: report.mode === "mock" ? "Scored simulation, not live model quality." : "Human labels on a small synthetic benchmark; no population quality claim.",
    ...summarizeHumanLabels(labels, key) };
  writeFileSync(resolve(folder, "human-summary.json"), JSON.stringify(summary, null, 2) + "\n");
  console.log(JSON.stringify(summary, null, 2));
} catch {
  console.error("Use npm run ai:review -- .ai-eval/run-ID after editing human-labels.json. Folder/labels/key must be valid; no duplicate or unknown sample IDs.");
  process.exitCode = 1;
}
