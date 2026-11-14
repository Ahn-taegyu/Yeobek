import { it, onTestFinished, vi } from "vitest";
import { createHash, randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
vi.mock("server-only", () => ({}));
import { selectEvidence, validateContext } from "../../src/lib/ai/context";
import { retrievalCases, type RetrievalCase } from "./retrieval-cases";
import { chooseCases, createFreeScorer, parseOptions, preflight, RERANK_PROMPT, rerank, retrievalMetrics, type Score } from "../../scripts/experiments/bivia-retrieval";
import { reserveAllowance } from "../../scripts/experiments/bivia-free-budget";

type Row = {
  questionId: string; category: RetrievalCase["category"]; repeat: number; arm: "A" | "C";
  status: "completed" | "failed"; elapsedMs: number; allowedIds: string[]; selectedIds: string[];
  metrics: ReturnType<typeof retrievalMetrics> | null; scores?: (Score & { evidenceId: string })[]; error?: string;
};
const hash = (value: string) => createHash("sha256").update(value).digest("hex");
const mean = (values: number[]) => values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
function summary(rows: Row[]) {
  const completed = rows.filter(r => r.status === "completed"), scored = completed.filter(r => r.metrics?.allGroups !== null);
  const latencies = rows.map(r => r.elapsedMs).sort((a, b) => a - b);
  return { completed: completed.length, failed: rows.length - completed.length, answerable: scored.length,
    allGroupsFound: scored.filter(r => r.metrics?.allGroups).length,
    allGroupsRate: mean(scored.map(r => Number(r.metrics?.allGroups))),
    groupRecall: mean(scored.map(r => r.metrics!.groupRecall!)), precision: mean(scored.map(r => r.metrics!.precision!)),
    unanswerableNotScored: completed.length - scored.length,
    elapsedMs: { p50: latencies[Math.ceil(latencies.length * .5) - 1] ?? null, p95: latencies[Math.ceil(latencies.length * .95) - 1] ?? null } };
}

it("runs the requested A/C retrieval experiment without a generation provider", async () => {
  if (!process.env.BIVIA_COMPARE_ARGS) throw new Error("Use npm run ai:compare:bivia.");
  const options = parseOptions(JSON.parse(process.env.BIVIA_COMPARE_ARGS));
  const cases = chooseCases(retrievalCases, options.split), plan = preflight(cases, options.repeats);
  console.log(JSON.stringify({ mode: options.mode, split: options.split, plannedBiviaIfLive: plan, generationCalls: 0 }));
  if (options.mode !== "live-free") vi.stubGlobal("fetch", () => { throw new Error("offline_network_forbidden"); });
  let client: ReturnType<typeof createFreeScorer> | null = null;
  if (options.mode === "live-free") {
    const key = process.env.BIVIA_API_KEY?.trim();
    if (!key) throw new Error("BIVIA_API_KEY_missing_or_invalid");
    const reservation = reserveAllowance(resolve(".ai-eval/bivia-free-allowance.json"), plan, options.maxCalls);
    onTestFinished(reservation.release);
    client = createFreeScorer(key, reservation.allowance, plan, options.maxCalls);
  }
  const output = resolve(`.ai-eval/bivia-${new Date().toISOString().replace(/[:.]/g, "-")}-${randomUUID().slice(0, 8)}`);
  mkdirSync(output, { recursive: true });
  const rows: Row[] = []; let stopped: string | null = null;
  const codeSha = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
  const dirty = Boolean(execFileSync("git", ["status", "--porcelain"], { encoding: "utf8" }).trim());
  const fingerprints = Object.fromEntries(["src/lib/ai/context.ts", "src/lib/policy.ts", "scripts/experiments/bivia-retrieval.ts", "scripts/experiments/bivia-free-budget.ts",
    "tests/evaluation/retrieval-cases.ts", "tests/evaluation/bivia-compare.test.ts"].map(p => [p, hash(readFileSync(p, "utf8"))]));
  function save() {
    const a = rows.filter(r => r.arm === "A"), c = rows.filter(r => r.arm === "C");
    const pairs = a.flatMap(ar => {
      const cr = c.find(r => r.questionId === ar.questionId && r.repeat === ar.repeat);
      return ar.status === "completed" && cr?.status === "completed" && ar.metrics?.allGroups !== null ? [{ a: Number(ar.metrics?.allGroups), c: Number(cr.metrics?.allGroups) }] : [];
    });
    const result = { schemaVersion: 1, createdAt: new Date().toISOString(), options, codeSha, dirty, fingerprints,
      corpusHash: hash(JSON.stringify(retrievalCases)), promptHash: hash(RERANK_PROMPT), node: process.version,
      scope: "retrieval only; synthetic gold authored by agent, not independently human-reviewed; no final answer quality measurement",
      plannedBiviaIfLive: plan, stopped, generationCalls: 0, externalCalls: client?.ledger.calls ?? 0,
      usage: client?.ledger ?? null, cashCost: client ? null : 0,
      cashCostNote: client ? "Free allowance checked before run; verify provider usage/billing after run. Missing usage is not zero." : "No external API calls.",
      baseline: a.length ? summary(a) : null, bivia: c.length ? summary(c) : null,
      pairedAnswerable: pairs.length, pairedAllGroupsDelta: mean(pairs.map(p => p.c - p.a)),
      byCategory: Object.fromEntries([...new Set(cases.map(c => c.category))].map(category => [category, {
        A: summary(a.filter(r => r.category === category)), C: summary(c.filter(r => r.category === category)),
      }])), rows };
    writeFileSync(resolve(output, "report.json"), JSON.stringify(result, null, 2) + "\n");
    return result;
  }
  save(); // Manifest exists even if interrupted before the first result.
  if (options.mode !== "preflight") {
    outer: for (let repeat = 0; repeat < options.repeats; repeat++) for (const [index, c] of cases.entries()) {
      const arms: Row["arm"][] = client ? ((index + repeat) % 2 ? ["C", "A"] : ["A", "C"]) : ["A"];
      for (const arm of arms) {
        const start = performance.now();
        const row: Row = { questionId: c.id, category: c.category, repeat, arm, status: "completed", elapsedMs: 0,
          allowedIds: c.context.evidence.map(e => e.id), selectedIds: [], metrics: null };
        try {
          validateContext(c.context, { exhibitionId: c.context.exhibitionId, artworkId: c.context.artworkId });
          const result = arm === "A" ? { selected: selectEvidence(c.context.evidence, c.question), scores: undefined } : await rerank(c, client!.score);
          row.selectedIds = result.selected.map(e => e.id); row.scores = result.scores;
          row.metrics = retrievalMetrics(c, result.selected);
        } catch (error) {
          row.status = "failed";
          // Only controlled experiment error codes are persisted, never raw provider messages.
          row.error = error instanceof Error && /^(bivia_[a-z_0-9]+|free_[a-z_]+|invalid_context)$/.test(error.message) ? error.message : "experiment_failed";
          stopped = row.error;
        }
        row.elapsedMs = performance.now() - start; rows.push(row); save();
      }
      if (client) console.log(JSON.stringify({ completedPairs: rows.length / 2, calls: client.ledger.calls, stopped }));
      if (stopped) break outer;
    }
  }
  const result = save();
  console.log(JSON.stringify({ output, baseline: result.baseline, bivia: result.bivia,
    externalCalls: result.externalCalls, pairedAllGroupsDelta: result.pairedAllGroupsDelta, stopped }));
  if (stopped) throw new Error(`Experiment stopped: ${stopped}; report saved.`);
});
