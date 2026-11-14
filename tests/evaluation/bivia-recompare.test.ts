import { it, onTestFinished, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
vi.mock("server-only", () => ({}));
import { selectEvidence } from "../../src/lib/ai/context";
import { createDocentHarness, validateAnswer } from "../../src/lib/ai/harness";
import type { Evidence, ModelAnswer } from "../../src/lib/ai/contracts";
import { DOCENT_SYSTEM_PROMPT } from "../../src/lib/ai/prompts";
import { createLinerTextProvider } from "../../src/lib/ai/providers/liner";
import type { AiTextResponse } from "../../src/lib/ai/providers/types";
import { retrievalCases } from "./retrieval-cases";
import { createFreeScorer, preflight, rerank, retrievalMetrics, selectScoredEvidence } from "../../scripts/experiments/bivia-retrieval";
import { reserveAllowance } from "../../scripts/experiments/bivia-free-budget";
import { readScoreCache, sha256 } from "../../scripts/experiments/bivia-cache";
import { createCreditBudget, judgeInput, LINER_MODELS, LINER_RATES, QUALITY_PROMPT, qualityJsonSchema, qualitySchema } from "../../scripts/experiments/bivia-answer-quality";

type Arm = "A" | "C2";
type AnswerRow = { arm: Arm; selectedIds: string[]; elapsedMs: number; answer?: ModelAnswer;
  model?: AiTextResponse; error?: string };
const safeError = (error: unknown) => error && typeof error === "object" && "code" in error && typeof error.code === "string"
  ? error.code : error instanceof Error && /^(bivia_|free_|credit_|invalid_)[a-z_0-9]+$/.test(error.message) ? error.message : "experiment_failed";

it("replays scores, benchmarks concurrency, or measures actual final answers", async () => {
  const mode = process.env.BIVIA_RECOMPARE_MODE;
  if (!["replay", "benchmark-free", "answers-credit", "judge-credit"].includes(mode ?? "")) throw new Error("Use npm run ai:recompare:bivia.");
  if (mode === "replay") vi.stubGlobal("fetch", () => { throw new Error("offline_network_forbidden"); });
  const output = resolve(`.ai-eval/bivia-v2-${mode}-${new Date().toISOString().replace(/[:.]/g, "-")}-${randomUUID().slice(0, 8)}`);
  mkdirSync(output, { recursive: true });
  const cases = retrievalCases.filter(c => c.split === "eval");
  const pinned = JSON.parse(readFileSync("tests/evaluation/results/bivia-retrieval-2026-11-14.json", "utf8"));
  const cache = readScoreCache(readFileSync(process.env.BIVIA_SCORE_CACHE ?? ".ai-eval/bivia-score-cache.json", "utf8"), pinned.privateReportSha256, retrievalCases);
  const selections = cases.map(c => {
    const scores = cache.get(c.id)!;
    const A = selectEvidence(c.context.evidence, c.question), C1 = selectScoredEvidence(c, scores, "tail"), C2 = selectScoredEvidence(c, scores, "protect-baseline");
    const arm = (selected: Evidence[]) => ({ selectedIds: selected.map(e => e.id), metrics: retrievalMetrics(c, selected) });
    return { questionId: c.id, category: c.category, A: arm(A), C1: arm(C1.selected), C2: { ...arm(C2.selected), protectedIds: C2.protectedIds } };
  });
  const benchmark: unknown[] = [], answers: { questionId: string; category: string; answerable: boolean;
    rows: AnswerRow[]; blindOrder: Arm[]; judgment?: ReturnType<typeof qualitySchema.parse>; judgeTrace?: AiTextResponse["trace"]; judgeError?: string }[] = [];
  const credit = createCreditBudget(3);
  let bivia: ReturnType<typeof createFreeScorer> | undefined;
  let stopped: string | null = null;
  const sourcePaths = ["scripts/experiments/bivia-retrieval.ts", "scripts/experiments/bivia-cache.ts", "scripts/experiments/bivia-answer-quality.ts",
    "tests/evaluation/bivia-recompare.test.ts", "tests/evaluation/retrieval-cases.ts", "src/lib/ai/harness.ts", "src/lib/ai/context.ts", "src/lib/ai/providers/liner.ts"];
  const provenance = { sourceSha: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
    dirty: Boolean(execFileSync("git", ["status", "--porcelain"], { encoding: "utf8" }).trim()),
    fingerprints: Object.fromEntries(sourcePaths.map(p => [p, sha256(readFileSync(p, "utf8"))])),
    corpusHash: sha256(JSON.stringify(retrievalCases)), scoreCacheHash: pinned.privateReportSha256,
    answerPromptHash: sha256(DOCENT_SYSTEM_PROMPT), judgePromptHash: sha256(QUALITY_PROMPT),
    judgeSchemaHash: sha256(JSON.stringify(qualityJsonSchema)), models: LINER_MODELS, prices: LINER_RATES };
  function save() {
    writeFileSync(resolve(output, "report.json"), JSON.stringify({ schemaVersion: 2, createdAt: new Date().toISOString(), mode, provenance,
      scope: "Synthetic regression set already observed in v1; cached scores; one answer sample per arm; automated judge, not human acceptance. No DB/HTTP/visitor lifecycle validation.",
      design: { policy: "protect baseline-selected abstentions; score-order fill", benchmarkConcurrency: [1, 4],
        answerOrder: "counterbalanced", judgeOrder: "counterbalanced X/Y, arm names hidden", maxCreditEstimateUsd: 3,
        answerEvidenceOrdering: "Production harness reorders the selected <=12 excerpts; cannot add omitted evidence.",
        retries: 0, autoProviderFallback: false },
      stopped, selections, benchmark, answers, biviaUsage: bivia?.ledger ?? null, linerUsage: credit.ledger }, null, 2) + "\n");
  }
  save();
  console.log(JSON.stringify({ mode, output, cachedBiviaScores: 1440,
    retrieval: Object.fromEntries(["A", "C1", "C2"].map(arm => [arm, selections.filter(r => r[arm as "A"].metrics.allGroups === true).length])) }));
  if (mode === "judge-credit") {
    if (process.env.BIVIA_LINER_CREDIT_AUTHORIZED !== "1" || !process.env.LINER_API_KEY) throw new Error("credit_authorization_missing");
    const raw = readFileSync(process.env.BIVIA_ANSWER_REPORT ?? ".ai-eval/bivia-frozen-answers.json", "utf8");
    const source = JSON.parse(raw) as { schemaVersion: number; mode: string; stopped: string | null; provenance: typeof provenance;
      answers: typeof answers; linerUsage: typeof credit.ledger; [key: string]: unknown };
    if (source.schemaVersion !== 2 || source.mode !== "answers-credit" || source.stopped || source.answers.length !== 60 ||
      source.linerUsage.calls.generator !== 120 || source.linerUsage.calls.judge !== 60 || source.linerUsage.usageUnknownCalls ||
      source.provenance.corpusHash !== provenance.corpusHash || source.provenance.answerPromptHash !== provenance.answerPromptHash ||
      source.provenance.models.generator !== LINER_MODELS.generator || source.linerUsage.reservedUsd >= 3) throw new Error("credit_frozen_answers_invalid");
    // Validate every pair before any request. Generation is never repeated here.
    for (const [i, pair] of source.answers.entries()) {
      if (pair.questionId !== cases[i].id || pair.rows.length !== 2 || new Set(pair.rows.map(r => r.arm)).size !== 2 ||
        !pair.judgment || pair.rows.some(r => !r.answer || r.error)) throw new Error("credit_frozen_answers_invalid");
      for (const row of pair.rows) validateAnswer(row.answer, selections[i][row.arm].selectedIds);
    }
    const revised: typeof answers = [];
    const resumeRaw = process.env.BIVIA_JUDGE_RESUME ? readFileSync(process.env.BIVIA_JUDGE_RESUME, "utf8") : null;
    const resume = resumeRaw ? JSON.parse(resumeRaw) as { originalAnswerReportHash: string; provenance: typeof provenance;
      correctedJudgeUsage: typeof credit.ledger; answers: typeof answers; judgeFailedAttempts?: { questionId: string; error: string }[] } : null;
    const prior = resume?.correctedJudgeUsage ?? { calls: { generator: 0, judge: 0 }, inputTokens: 0, outputTokens: 0,
      estimatedUsd: 0, reservedUsd: 0, usageUnknownCalls: 0, stopped: false };
    const failures = resume?.judgeFailedAttempts ?? resume?.answers.filter(p => p?.judgeError).map(p => ({ questionId: p.questionId, error: p.judgeError! })) ?? [];
    if (resume) {
      if (resume.originalAnswerReportHash !== sha256(raw) || resume.provenance.judgePromptHash !== provenance.judgePromptHash ||
        resume.provenance.judgeSchemaHash !== provenance.judgeSchemaHash || resume.provenance.models.judge !== LINER_MODELS.judge ||
        failures.length > 2 || prior.calls.generator !== 0 || !Number.isSafeInteger(prior.calls.judge) || prior.calls.judge > 62 ||
        !Number.isFinite(prior.reservedUsd) || prior.reservedUsd < 0) throw new Error("credit_resume_invalid");
      for (const pair of resume.answers) {
        if (!pair?.judgment || pair.judgeError) continue;
        const i = cases.findIndex(c => c.id === pair.questionId);
        if (i < 0 || revised[i] || JSON.stringify(pair.rows) !== JSON.stringify(source.answers[i].rows) ||
          JSON.stringify(pair.blindOrder) !== JSON.stringify(source.answers[i].blindOrder)) throw new Error("credit_resume_invalid");
        qualitySchema.parse(pair.judgment); revised[i] = structuredClone(pair);
      }
    }
    const completedBeforeResume = revised.filter(Boolean).length;
    const remainingUsd = 3 - source.linerUsage.reservedUsd - prior.reservedUsd;
    const revisedBudget = createCreditBudget(remainingUsd);
    const reservationName = resumeRaw ? `bivia-rejudge-reservation-${sha256(resumeRaw).slice(0, 16)}.json` : "bivia-rejudge-reservation.json";
    writeFileSync(resolve(`.ai-eval/${reservationName}`), JSON.stringify({ output, sourceHash: sha256(raw),
      judgeCalls: 60 - completedBeforeResume, remainingEstimatedUsd: remainingUsd }), { flag: "wx" });
    const judge = revisedBudget.wrap(createLinerTextProvider({ apiKey: process.env.LINER_API_KEY, model: LINER_MODELS.judge }), "judge");
    const concurrency = resume ? 2 : 3;
    function saveRejudged() {
      const a = source.linerUsage, next = revisedBudget.ledger;
      const b = { calls: { generator: 0, judge: prior.calls.judge + next.calls.judge },
        inputTokens: prior.inputTokens + next.inputTokens, outputTokens: prior.outputTokens + next.outputTokens,
        estimatedUsd: prior.estimatedUsd + next.estimatedUsd, reservedUsd: prior.reservedUsd + next.reservedUsd,
        usageUnknownCalls: prior.usageUnknownCalls + next.usageUnknownCalls, stopped: next.stopped };
      writeFileSync(resolve(output, "report.json"), JSON.stringify({ ...source, createdAt: new Date().toISOString(),
        originalAnswerProvenance: source.provenance, provenance, originalAnswerReportHash: sha256(raw),
        design: { ...(source.design as Record<string, unknown>), retries: undefined, automaticRetries: 0, manualJudgeRetryCount: failures.length },
        judgeCorrection: "Supplied trusted artwork title/number missing from first judge input. All 60 frozen pairs rejudged; no generation or Bivia calls.",
        judgeExecution: { concurrency, completedBeforeResume, resumeHash: resumeRaw ? sha256(resumeRaw) : null },
        judgeFailedAttempts: [...failures, ...revised.filter(p => p?.judgeError).map(p => ({ questionId: p.questionId, error: p.judgeError! }))],
        originalLinerUsage: a, correctedJudgeUsage: b, stopped, answers: revised,
        linerUsage: { calls: { generator: a.calls.generator, judge: a.calls.judge + b.calls.judge }, inputTokens: a.inputTokens + b.inputTokens,
          outputTokens: a.outputTokens + b.outputTokens, estimatedUsd: a.estimatedUsd + b.estimatedUsd, reservedUsd: a.reservedUsd + b.reservedUsd,
          usageUnknownCalls: a.usageUnknownCalls + b.usageUnknownCalls, stopped: b.stopped } }, null, 2) + "\n");
    }
    saveRejudged();
    let cursor = 0, completed = completedBeforeResume;
    async function worker() {
      while (!stopped && cursor < source.answers.length) {
        const i = cursor++;
        if (revised[i]?.judgment) continue;
        const pair = structuredClone(source.answers[i]); delete pair.judgment; delete pair.judgeTrace;
        revised[i] = pair;
        try {
          const X = pair.rows.find(r => r.arm === pair.blindOrder[0])!.answer!, Y = pair.rows.find(r => r.arm === pair.blindOrder[1])!.answer!;
          const result = await judge.generate({ system: QUALITY_PROMPT, input: judgeInput(cases[i], { X, Y }), schema: qualityJsonSchema, maxOutputTokens: 4096 });
          pair.judgment = qualitySchema.parse(result.output); pair.judgeTrace = result.trace;
        } catch (error) { stopped ??= safeError(error); pair.judgeError = safeError(error); }
        completed++; saveRejudged(); console.log(JSON.stringify({ rejudgedPairs: completed, newCalls: revisedBudget.ledger.calls.judge, stopped }));
      }
    }
    await Promise.all(Array.from({ length: concurrency }, worker));
    saveRejudged();
    if (stopped) throw new Error(`Rejudging stopped: ${stopped}; report saved.`);
    return;
  }
  if (mode === "benchmark-free") {
    const dev = retrievalCases.filter(c => c.split === "dev");
    const benchCases = [...new Set(dev.map(c => c.category))].map(category => dev.find(c => c.category === category)!);
    const plan = preflight(benchCases, 2);
    if (plan.calls !== 288) throw new Error("bivia_benchmark_plan_changed");
    const key = process.env.BIVIA_API_KEY;
    if (!key) throw new Error("bivia_key_missing");
    const reservation = reserveAllowance(resolve(".ai-eval/bivia-free-allowance.json"), plan, 288);
    onTestFinished(reservation.release);
    bivia = createFreeScorer(key, reservation.allowance, plan, 288);
    outer: for (const [index, c] of benchCases.entries()) for (const concurrency of index % 2 ? [4, 1] : [1, 4]) {
      const start = performance.now();
      try {
        const result = await rerank(c, bivia.score, { concurrency, abstention: "protect-baseline" });
        benchmark.push({ questionId: c.id, category: c.category, concurrency, elapsedMs: performance.now() - start,
          selectedIds: result.selected.map(e => e.id), metrics: retrievalMetrics(c, result.selected), scores: result.scores });
      } catch (error) { stopped = safeError(error); benchmark.push({ questionId: c.id, concurrency, elapsedMs: performance.now() - start, error: stopped }); }
      save(); console.log(JSON.stringify({ completedBenchmarkConditions: benchmark.length, calls: bivia.ledger.calls, stopped }));
      if (stopped) break outer;
    }
  }
  if (mode === "answers-credit") {
    // This flag means explicit user authorization for Liner credit charges, not a free-tier assertion.
    if (process.env.BIVIA_LINER_CREDIT_AUTHORIZED !== "1") throw new Error("credit_authorization_missing");
    const key = process.env.LINER_API_KEY;
    if (!key) throw new Error("credit_key_missing");
    // Whole-run reservation survives crashes; never silently reuse/refund it.
    writeFileSync(resolve(".ai-eval/bivia-answer-reservation.json"), JSON.stringify({ output, maxEstimatedUsd: 3,
      generatorCalls: 120, judgeCalls: 60, authorizedAt: new Date().toISOString() }), { flag: "wx" });
    const generator = credit.wrap(createLinerTextProvider({ apiKey: key, model: LINER_MODELS.generator }), "generator");
    const judge = credit.wrap(createLinerTextProvider({ apiKey: key, model: LINER_MODELS.judge }), "judge");
    for (const [index, c] of cases.entries()) {
      const order: Arm[] = index % 2 ? ["C2", "A"] : ["A", "C2"];
      const blindOrder: Arm[] = Math.floor(index / 2) % 2 ? ["C2", "A"] : ["A", "C2"];
      const pair: typeof answers[number] = { questionId: c.id, category: c.category, answerable: Boolean(c.expectedGroups.length), rows: [], blindOrder };
      answers.push(pair);
      for (const arm of order) {
        const selectedIds = selections[index][arm].selectedIds;
        const context = { ...structuredClone(c.context), evidence: c.context.evidence.filter(e => selectedIds.includes(e.id)) };
        let model: AiTextResponse | undefined;
        const harness = createDocentHarness({ publications: { load: async () => context, isCurrent: async () => true },
          text: { generate: async request => { model = await generator.generate(request); save(); return model; } } });
        const row: AnswerRow = { arm, selectedIds, elapsedMs: 0 }; pair.rows.push(row);
        const start = performance.now();
        try {
          const result = await harness.answer({ requestId: randomUUID(), exhibitionId: context.exhibitionId, artworkId: context.artworkId,
            intent: "question", question: c.question, contextSequence: 0, inputMode: "text", outputMode: "text" });
          row.answer = { answer: result.answer, outcome: result.outcome, citations: result.citations };
        } catch (error) { row.error = safeError(error); if (row.error !== "invalid_output") stopped = row.error; }
        row.elapsedMs = performance.now() - start; row.model = model; save();
        if (stopped) break;
      }
      if (!stopped && pair.rows.every(r => r.answer)) {
        try {
          const X = pair.rows.find(r => r.arm === blindOrder[0])!.answer!, Y = pair.rows.find(r => r.arm === blindOrder[1])!.answer!;
          const result = await judge.generate({ system: QUALITY_PROMPT, input: judgeInput(c, { X, Y }), schema: qualityJsonSchema, maxOutputTokens: 4096 });
          pair.judgment = qualitySchema.parse(result.output); pair.judgeTrace = result.trace;
        } catch (error) { stopped = safeError(error); pair.judgeError = stopped; }
      }
      save(); console.log(JSON.stringify({ completedAnswerPairs: answers.length, calls: credit.ledger.calls, estimatedUsd: credit.ledger.estimatedUsd, stopped }));
      if (stopped) break;
    }
  }
  save();
  console.log(JSON.stringify({ output, biviaUsage: bivia?.ledger ?? null, linerUsage: credit.ledger, stopped }));
  if (stopped) throw new Error(`Experiment stopped: ${stopped}; report saved.`);
});
