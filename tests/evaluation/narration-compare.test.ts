import { it, vi } from "vitest";
import { createHash, randomInt, randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
vi.mock("server-only", () => ({}));
import { createNarrationHarness, type NarrationStrategy } from "../../src/lib/ai/narration";
import { pricingSchema, summarizeComparison, type ComparisonRun, type ReviewKey } from "../../src/lib/ai/narration-report";
import { createConfiguredTextProvider } from "../../src/lib/ai/runtime";
import { isMockMode, resolveAiRoute } from "../../src/lib/ai/routing";
import { PLUGIN_VERSION } from "../../src/lib/ai/plugin";
import type { AiTextProvider } from "../../src/lib/ai/providers/types";
import { actorId, narrationCases, type NarrationCase } from "./narration-cases";

function mockProviders(fixture: NarrationCase) {
  let generated = 0;
  const generator: AiTextProvider = { generate: async request => {
    const input = JSON.parse(request.input); generated++;
    const decline = fixture.id === "conflict";
    const weak = fixture.id === "missing-intent" && generated <= 2;
    return { output: { answer: decline ? "제작 연도가 서로 달라 확인이 필요합니다." : weak ? "파란색은 슬픔을 상징합니다." : fixture.context.sources[0].text,
      citations: decline ? [] : [input.sources[0].id], outcome: decline ? "insufficient_evidence" : "answered" },
      trace: { provider: "liner", model: "simulation-generator", usage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 } } };
  } };
  const judge: AiTextProvider = { generate: async request => {
    const input = JSON.parse(request.input) as { candidates: { candidateId: string; answer: string }[] };
    return { output: { evaluations: input.candidates.map(c => ({ candidateId: c.candidateId,
      grounding: c.answer.includes("슬픔") ? 1 : 4, relevance: 4, tone: 4, concision: 4,
      unsupportedIntent: c.answer.includes("슬픔"), confidentialityLeak: false })) },
      trace: { provider: "openai", model: "simulation-judge", usage: { inputTokens: 200, outputTokens: 80, totalTokens: 280 } } };
  } };
  return { generator, judge };
}

it("runs the explicitly requested paired comparison", async () => {
  const options = JSON.parse(process.env.AI_COMPARE_OPTIONS ?? "null") as {
    mode: "mock" | "live"; cases: string[]; repeats: number; maxCalls: number; reservedCalls: number; pricing: string | null;
  } | null;
  if (!options) throw new Error("Use npm run ai:compare, not this evaluation file directly.");
  // Parse before any provider call. Never print raw file contents/errors.
  let pricing = null;
  try { pricing = options.pricing ? pricingSchema.parse(JSON.parse(readFileSync(resolve(options.pricing), "utf8"))) : null; }
  catch { throw new Error("Invalid pricing JSON; expected currency/asOf/rates with unique provider+model rates."); }
  const fixtures = options.cases.map(id => narrationCases.find(c => c.id === id)!);
  const runs: ComparisonRun[] = []; const key: ReviewKey[] = [];
  const review: { sampleId: string; sources: { id: string; text: string }[]; rubric: string; expected: string; expectedReasons: string[];
    answer: string | null; citations: string[]; status: string; terminationReason: string }[] = [];
  if (options.mode === "live" && isMockMode()) throw new Error("Live comparison requires AI_PROVIDER_MODE=live.");
  const liveGenerator = options.mode === "live" ? createConfiguredTextProvider("draft") : null;
  const liveJudge = options.mode === "live" ? createConfiguredTextProvider("judge") : null;
  let callsStarted = 0;
  const limit = (provider: AiTextProvider): AiTextProvider => ({ generate: request => {
    if (callsStarted >= options.maxCalls) throw new Error("comparison_call_budget");
    callsStarted++; return provider.generate(request);
  } });
  for (let repeat = 0; repeat < options.repeats; repeat++) for (const [caseIndex, fixture] of fixtures.entries()) {
    const pairId = randomUUID();
    const order: NarrationStrategy[] = (repeat + caseIndex) % 2 ? ["best_of_two", "single"] : ["single", "best_of_two"];
    for (const strategy of order) {
      const providers = liveGenerator && liveJudge ? { generator: liveGenerator, judge: liveJudge } : mockProviders(fixture);
      const harness = createNarrationHarness(actorId, { store: { loadOwnedContext: async () => structuredClone(fixture.context) },
        generator: limit(providers.generator), judge: limit(providers.judge) });
      const result = await harness.draft({ documentId: fixture.context.documentId, expectedRevision: fixture.context.revision, strategy });
      const id = randomUUID(); const sampleId = randomUUID();
      runs.push({ id, pairId, caseId: fixture.id, repeat, strategy, expected: fixture.expected, expectedReasons: fixture.expectedReasons, result });
      key.push({ sampleId, runId: id, pairId, strategy });
      review.push({ sampleId, sources: fixture.context.sources.map(s => ({ id: s.id, text: s.text })), rubric: fixture.rubric,
        expected: fixture.expected, expectedReasons: fixture.expectedReasons, answer: result.selected?.answer ?? null,
        citations: result.selected?.citations ?? [], status: result.status, terminationReason: result.reason });
    }
  }
  for (let i = review.length - 1; i > 0; i--) { const j = randomInt(i + 1); [review[i], review[j]] = [review[j], review[i]]; }
  const folder = resolve(".ai-eval", `run-${randomUUID()}`); mkdirSync(folder, { recursive: true });
  const write = (filename: string, value: unknown) => writeFileSync(resolve(folder, filename), JSON.stringify(value, null, 2) + "\n", { flag: "wx" });
  const report = { formatVersion: 1, createdAt: new Date().toISOString(), mode: options.mode,
    disclaimer: options.mode === "mock" ? "Scripted simulation. Not measured model quality, billing or provider latency." : "Small synthetic benchmark. Judge acceptance is not human-confirmed factual quality; token-rate costs are estimates.",
    pluginVersion: PLUGIN_VERSION, fixtureHash: createHash("sha256").update(JSON.stringify(fixtures)).digest("hex"),
    configuredModels: options.mode === "live" ? { generator: resolveAiRoute("draft").model, judge: resolveAiRoute("judge").model } : { generator: "simulation-generator", judge: "simulation-judge" },
    design: { baseline: "1 generation + same judge, no regeneration", treatment: "2 candidates + same judge, at most 1 regeneration round", ordering: "counterbalanced across pairs; judge candidate order randomized", percentile: "nearest rank, all attempts" },
    limits: { reservedCalls: options.reservedCalls, maxCalls: options.maxCalls, callsStarted }, pricing,
    summary: summarizeComparison(runs, pricing), runs: runs.map(run => {
      const { selected, ...result } = run.result;
      return { ...run, result: { ...result, selected: selected ? { citations: selected.citations, outcome: selected.outcome } : null } };
    }) };
  write("report.json", report); write("human-review.json", review); write("key.json", key);
  write("human-labels.json", review.map(r => ({ sampleId: r.sampleId, acceptable: null, grounding: null, relevance: null, tone: null, concision: null })));
  console.log(`Comparison artifacts: ${folder}`);
  console.log(JSON.stringify({ mode: options.mode, summary: report.summary }, null, 2));
});
