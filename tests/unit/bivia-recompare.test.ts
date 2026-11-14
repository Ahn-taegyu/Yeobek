import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { selectEvidence, textHash } from "../../src/lib/ai/context";
import { retrievalCases } from "../evaluation/retrieval-cases";
import { rerank, scoreCandidates, selectScoredEvidence, RERANK_PROMPT, type ScoredEvidence } from "../../scripts/experiments/bivia-retrieval";
import { readScoreCache, sha256 } from "../../scripts/experiments/bivia-cache";
import { createCreditBudget, judgeInput, qualitySchema } from "../../scripts/experiments/bivia-answer-quality";

const c = retrievalCases[0];
const answered = { type: "score" as const, status: "answered" as const, value: .7 };
const scores = (): ScoredEvidence[] => c.context.evidence.map(e => ({ evidenceId: e.id, ...answered }));

describe("bounded concurrent scoring", () => {
  it("uses at most four in-flight calls, preserves evidence mapping and selects identically", async () => {
    let active = 0, peak = 0;
    const scorer = vi.fn(async () => { active++; peak = Math.max(peak, active);
      await new Promise(r => setTimeout(r, 2)); active--; return answered; });
    const parallel = await rerank(c, scorer, { concurrency: 4, abstention: "protect-baseline" });
    const sequential = selectScoredEvidence(c, scores(), "protect-baseline");
    expect(peak).toBe(4); expect(active).toBe(0); expect(scorer).toHaveBeenCalledTimes(24);
    expect(parallel.selected).toEqual(sequential.selected);
  });
  it("drains in-flight calls after failure and never starts the next batch", async () => {
    let active = 0;
    const scorer = vi.fn(async () => {
      const index = active++;
      await new Promise(r => setTimeout(r, index ? 8 : 1)); active--;
      if (!index) throw new Error("bivia_http_429");
      return answered;
    });
    await expect(scoreCandidates(c, scorer, 4)).rejects.toThrow("bivia_http_429");
    expect(scorer).toHaveBeenCalledTimes(4); expect(active).toBe(0);
    await expect(scoreCandidates(c, scorer, 5)).rejects.toThrow("bivia_invalid_concurrency");
    expect(scorer).toHaveBeenCalledTimes(4);
  });
});

describe("abstention preservation and cache", () => {
  it("keeps baseline-selected uncertainty without changing valid scores or exceeding the budget", () => {
    const baseline = selectEvidence(c.context.evidence, c.question), protectedId = baseline[0].id;
    const input = scores().map(s => s.evidenceId === protectedId ? { ...s, status: "abstained" as const, value: null } : s);
    const result = selectScoredEvidence(c, input, "protect-baseline");
    expect(result.selected.some(e => e.id === protectedId)).toBe(true);
    expect(result.selected).toHaveLength(12); expect(result.protectedIds).toEqual([protectedId]);
    expect(result.scores.find(s => s.evidenceId === protectedId)?.value).toBeNull();
    const allAbstained = scores().map(s => ({ ...s, status: "abstained" as const, value: null }));
    expect(selectScoredEvidence(c, allAbstained, "protect-baseline").selected).toEqual(baseline);
  });
  it("respects the Unicode budget with large protected evidence and rejects missing/duplicate scores", () => {
    const large = structuredClone(c), id = selectEvidence(c.context.evidence, c.question)[0].id;
    const e = large.context.evidence.find(e => e.id === id)!;
    e.body = "가".repeat(7900); e.contentHash = textHash(e.body);
    const input = scores().map(s => ({ ...s, status: "abstained" as const, value: null }));
    const result = selectScoredEvidence(large, input, "protect-baseline");
    expect(result.selected.reduce((n, e) => n + [...e.body].length, 0)).toBeLessThanOrEqual(8000);
    expect(result.selected).toEqual(selectEvidence(large.context.evidence, c.question));
    expect(() => selectScoredEvidence(c, input.slice(1), "protect-baseline")).toThrow("bivia_score_coverage_invalid");
    expect(() => selectScoredEvidence(c, [input[0], ...input.slice(0, -1)], "protect-baseline")).toThrow("bivia_score_coverage_invalid");
  });
  it("pins cache bytes, corpus, prompt and complete question/evidence coverage", () => {
    const report = { schemaVersion: 1, corpusHash: sha256(JSON.stringify(retrievalCases)), promptHash: sha256(RERANK_PROMPT), stopped: null,
      options: { mode: "live-free", split: "eval", repeats: 1 }, rows: retrievalCases.filter(c => c.split === "eval").map(c => ({
        questionId: c.id, arm: "C", repeat: 0, status: "completed", scores: c.context.evidence.map(e => ({ evidenceId: e.id, ...answered })) })) };
    const raw = JSON.stringify(report);
    expect(readScoreCache(raw, sha256(raw), retrievalCases).size).toBe(60);
    expect(() => readScoreCache(raw + " ", sha256(raw), retrievalCases)).toThrow("bivia_cache_hash_mismatch");
    const changed = JSON.stringify({ ...report, promptHash: "changed" });
    expect(() => readScoreCache(changed, sha256(changed), retrievalCases)).toThrow("bivia_cache_inputs_changed");
    report.rows[0].scores.pop(); const partial = JSON.stringify(report);
    expect(() => readScoreCache(partial, sha256(partial), retrievalCases)).toThrow("bivia_score_coverage_invalid");
  });
});

describe("answer experiment boundary", () => {
  it("counts actual usage, reserves credit before requests and fails closed without retry", async () => {
    for (const invalid of [NaN, Infinity, 0, -1, 4]) expect(() => createCreditBudget(invalid)).toThrow("credit_budget_invalid");
    const generate = vi.fn(async () => ({ output: {}, trace: { provider: "liner" as const, model: "test", usage: { inputTokens: 100, outputTokens: 10 } } }));
    const budget = createCreditBudget(.003), provider = budget.wrap({ generate }, "generator");
    const request = { system: "test", input: "test", schema: { name: "test", definition: {} } };
    await provider.generate(request);
    await expect(provider.generate(request)).rejects.toThrow("credit_budget_exhausted");
    expect(generate).toHaveBeenCalledTimes(1); expect(budget.ledger.estimatedUsd).toBeCloseTo(.000015);
    const missing = createCreditBudget(), unknown = vi.fn(async () => ({ output: {}, trace: { provider: "liner" as const, model: "test" } }));
    const p = missing.wrap({ generate: unknown }, "judge");
    await expect(p.generate(request)).rejects.toThrow("credit_usage_unavailable");
    await expect(p.generate(request)).rejects.toThrow("credit_run_stopped"); expect(unknown).toHaveBeenCalledTimes(1);
  });
  it("gives the judge anonymous replies, reference facts and citation text but no treatment names or scores", () => {
    const reply = { answer: "예시", outcome: "answered" as const, citations: [c.context.evidence[0].id] };
    const data = JSON.parse(judgeInput(c, { X: reply, Y: reply }));
    expect(Object.keys(data)).toEqual(["question", "artwork", "answerable", "referenceFacts", "citedSources", "answers"]);
    expect(data.artwork).toEqual({ title: c.context.title, number: c.context.number });
    expect(Object.keys(data.answers)).toEqual(["X", "Y"]);
    expect(() => judgeInput(c, { X: { ...reply, citations: ["foreign"] }, Y: reply })).toThrow("quality_foreign_citation");
    expect(qualitySchema.safeParse({ X: { grounded: true }, Y: {} }).success).toBe(false);
  });
});
