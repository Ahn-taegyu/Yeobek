import { describe, expect, it } from "vitest";
import { parseCompareOptions } from "../../scripts/ai-compare-options.mjs";
import { estimateCost, humanLabelsSchema, pricingSchema, reviewKeySchema, summarizeComparison, summarizeHumanLabels, type ComparisonRun } from "../../src/lib/ai/narration-report";
import type { NarrationResult } from "../../src/lib/ai/narration";
const uuid = (n: number) => `30000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
function result(): NarrationResult {
  return { status: "abstained", reason: "timeout", selected: null, selectedCandidateId: null, contextHash: null, promptVersion: "test",
    metrics: { strategy: "single", rounds: 1, elapsedMs: 30_000, reservedCalls: 2, reservedOutputTokens: 4600, evaluations: [],
      calls: [{ role: "generation", round: 1, elapsedMs: 30_000, status: "failed", maxOutputTokens: 1600, errorCode: "timeout" }] } };
}
describe("comparison accounting", () => {
  it("never treats missing usage or exact-model pricing as free", () => {
    const r = result();
    const prices = pricingSchema.parse({ currency: "USD", asOf: "2026-11-13", rates: [{ provider: "openai", model: "fake", inputUsdPerMillion: 1, outputUsdPerMillion: 2 }] });
    expect(estimateCost(r, prices)).toEqual({ knownUsd: 0, unknownCalls: 1, totalUsd: null });
    r.metrics.calls[0].trace = { provider: "openai", model: "fake", usage: { inputTokens: 100, outputTokens: 50 } };
    expect(estimateCost(r, prices)).toEqual({ knownUsd: 0.0002, unknownCalls: 0, totalUsd: 0.0002 });
    r.metrics.calls[0].trace.model = "fake-different-version";
    expect(estimateCost(r, prices).totalUsd).toBeNull();
    r.metrics.calls = [];
    expect(estimateCost(r, null).totalUsd).toBe(0);
  });
  it("counts failed abstentions in latency but not correct withholding", () => {
    const runs: ComparisonRun[] = [{ id: uuid(1), pairId: uuid(2), caseId: "insufficient", repeat: 0, strategy: "single",
      expected: "abstained", expectedReasons: ["insufficient_evidence"], result: result() }];
    const summary = summarizeComparison(runs, null);
    expect(summary.single.elapsedMs.p95).toBe(30_000);
    expect(summary.single.expectedBehaviorMatchRate).toBe(0);
    expect(summary.single.estimatedCost.totalUsd).toBeNull();
    expect(summary.best_of_two.elapsedMs.p50).toBeNull();
  });
  it("uses only fully labeled pairs and reports human axis sample counts", () => {
    const key = reviewKeySchema.parse([
      { sampleId: uuid(1), runId: uuid(10), pairId: uuid(20), strategy: "single" },
      { sampleId: uuid(2), runId: uuid(11), pairId: uuid(20), strategy: "best_of_two" },
      { sampleId: uuid(3), runId: uuid(12), pairId: uuid(21), strategy: "single" },
    ]);
    const label = (n: number, acceptable: boolean | null) => ({ sampleId: uuid(n), acceptable, grounding: 4, relevance: 4, tone: null, concision: null });
    const labels = humanLabelsSchema.parse([label(1, false), label(2, true), label(3, null)]);
    const summary = summarizeHumanLabels(labels, key);
    expect(summary).toMatchObject({ completePairs: 1, singleWins: 0, bestOfTwoWins: 1 });
    expect(summary.byStrategy.single.rated).toBe(1);
    expect(summary.byStrategy.single.axes.tone).toEqual({ count: 0, mean: null });
    expect(() => humanLabelsSchema.parse([labels[0], labels[0]])).toThrow();
    expect(() => summarizeHumanLabels([label(99, true)], key)).toThrow("Unknown review sample");
    expect(() => pricingSchema.parse({ currency: "USD", asOf: "2026-11-13", rates: [{ provider: "openai", model: "x", inputUsdPerMillion: -1, outputUsdPerMillion: 2 }] })).toThrow();
  });
});
describe("comparison CLI gates", () => {
  it("defaults to offline and requires a whole-experiment live reservation", () => {
    expect(parseCompareOptions([]).mode).toBe("mock");
    expect(() => parseCompareOptions(["--mode=live"])).toThrow();
    expect(() => parseCompareOptions(["--mode=live", "--cases=grounded,injection", "--max-calls=8"])).toThrow();
    expect(parseCompareOptions(["--mode=live", "--max-calls=8"]).reservedCalls).toBe(8);
  });
  it.each([["--repeats=1.5"], ["--max-calls=8e0"], ["--mode=live", "--mode=mock"], ["--cases=grounded,grounded"], ["--unexpected=value"], ["--cases=private-file"]])("rejects malformed or ambiguous options: %s", (...args) => {
    expect(() => parseCompareOptions(args)).toThrow();
  });
});
