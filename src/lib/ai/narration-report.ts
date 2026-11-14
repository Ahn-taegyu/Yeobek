import { z } from "zod";
import type { NarrationResult, NarrationStrategy } from "./narration";

const rateSchema = z.strictObject({ provider: z.enum(["openai", "liner", "gemini", "groq"]), model: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/),
  inputUsdPerMillion: z.number().finite().nonnegative(), outputUsdPerMillion: z.number().finite().nonnegative() });
export const pricingSchema = z.strictObject({ currency: z.literal("USD"), asOf: z.iso.date(), rates: z.array(rateSchema).max(100) })
  .refine(v => new Set(v.rates.map(r => `${r.provider}:${r.model}`)).size === v.rates.length, "Duplicate rate");
export type Pricing = z.infer<typeof pricingSchema>;
export interface ComparisonRun { id: string; pairId: string; caseId: string; repeat: number; strategy: NarrationStrategy;
  expected: "selected" | "abstained"; expectedReasons: string[]; result: NarrationResult }

/** Aggregate token-rate estimate, not a provider invoice. Cache/tier discounts,
 * cache writes and hidden billing rules are not normalized by these adapters. */
export function estimateCost(result: NarrationResult, pricing: Pricing | null) {
  let knownUsd = 0; let unknownCalls = 0;
  for (const call of result.metrics.calls) {
    const trace = call.trace;
    const rate = pricing?.rates.find(r => r.provider === trace?.provider && r.model === trace?.model);
    const input = trace?.usage?.inputTokens; const output = trace?.usage?.outputTokens;
    if (!rate || input === undefined || output === undefined || !Number.isSafeInteger(input) || !Number.isSafeInteger(output) || input < 0 || output < 0) {
      unknownCalls++; continue;
    }
    knownUsd += (input * rate.inputUsdPerMillion + output * rate.outputUsdPerMillion) / 1_000_000;
  }
  return { knownUsd, unknownCalls, totalUsd: unknownCalls ? null : knownUsd };
}
export const percentile = (values: number[], fraction: number): number | null => values.length
  ? [...values].sort((a, b) => a - b)[Math.max(0, Math.ceil(values.length * fraction) - 1)] : null;
const ratio = (n: number, d: number) => d ? n / d : null;

export function summarizeComparison(runs: ComparisonRun[], pricing: Pricing | null) {
  return Object.fromEntries((["single", "best_of_two"] as const).map(strategy => {
    const subset = runs.filter(r => r.strategy === strategy); const n = subset.length;
    const costs = subset.map(r => estimateCost(r.result, pricing));
    const unknownCalls = costs.reduce((sum, c) => sum + c.unknownCalls, 0);
    const calls = subset.flatMap(r => r.result.metrics.calls);
    const selected = subset.filter(r => r.result.status === "selected").length;
    const knownUsd = costs.reduce((sum, c) => sum + c.knownUsd, 0);
    const selectedScores = subset.flatMap(r => r.result.metrics.evaluations.filter(e => e.candidateId === r.result.selectedCandidateId));
    return [strategy, { attempts: n, selected, abstained: n - selected, modelAcceptanceRate: ratio(selected, n),
      expectedBehaviorMatchRate: ratio(subset.filter(r => r.result.status === r.expected && r.expectedReasons.includes(r.result.reason)).length, n),
      regenerated: subset.filter(r => r.result.metrics.rounds > 1).length,
      reasons: Object.fromEntries([...new Set(subset.map(r => r.result.reason))].map(reason => [reason, subset.filter(r => r.result.reason === reason).length])),
      calls: calls.length, failedCalls: calls.filter(c => c.status === "failed").length,
      knownInputTokens: calls.reduce((sum, c) => sum + (c.trace?.usage?.inputTokens ?? 0), 0),
      knownOutputTokens: calls.reduce((sum, c) => sum + (c.trace?.usage?.outputTokens ?? 0), 0),
      callsWithUnknownUsage: calls.filter(c => c.trace?.usage?.inputTokens === undefined || c.trace?.usage?.outputTokens === undefined).length,
      elapsedMs: { p50: percentile(subset.map(r => r.result.metrics.elapsedMs), 0.5), p95: percentile(subset.map(r => r.result.metrics.elapsedMs), 0.95), denominator: "all attempts, including failures and abstentions" },
      selectedJudgeMeans: Object.fromEntries((["grounding", "relevance", "tone", "concision"] as const).map(key => [key,
        selectedScores.length ? selectedScores.reduce((sum, e) => sum + e[key], 0) / selectedScores.length : null])),
      estimatedCost: { knownUsd, unknownCalls, totalUsd: unknownCalls ? null : knownUsd,
        perAttemptUsd: unknownCalls || !n ? null : knownUsd / n },
    }];
  }));
}

export const humanLabelsSchema = z.array(z.strictObject({ sampleId: z.uuid(), acceptable: z.boolean().nullable(),
  grounding: z.number().int().min(1).max(5).nullable(), relevance: z.number().int().min(1).max(5).nullable(),
  tone: z.number().int().min(1).max(5).nullable(), concision: z.number().int().min(1).max(5).nullable(),
})).refine(items => new Set(items.map(i => i.sampleId)).size === items.length, "Duplicate sample");
export interface ReviewKey { sampleId: string; runId: string; pairId: string; strategy: NarrationStrategy }
export const reviewKeySchema = z.array(z.strictObject({ sampleId: z.uuid(), runId: z.uuid(), pairId: z.uuid(), strategy: z.enum(["single", "best_of_two"]) }))
  .refine(items => new Set(items.map(i => i.sampleId)).size === items.length && new Set(items.map(i => i.runId)).size === items.length &&
    new Set(items.map(i => `${i.pairId}:${i.strategy}`)).size === items.length, "Duplicate review key");
export function summarizeHumanLabels(labels: z.infer<typeof humanLabelsSchema>, key: ReviewKey[]) {
  if (labels.some(label => !key.some(k => k.sampleId === label.sampleId))) throw new Error("Unknown review sample");
  const rated = labels.filter(label => label.acceptable !== null).map(label => ({ ...label, ...key.find(k => k.sampleId === label.sampleId)! }));
  const byStrategy = Object.fromEntries((["single", "best_of_two"] as const).map(strategy => {
    const rows = rated.filter(r => r.strategy === strategy);
    return [strategy, { rated: rows.length, total: key.filter(k => k.strategy === strategy).length,
      acceptableRate: ratio(rows.filter(r => r.acceptable).length, rows.length),
      axes: Object.fromEntries((["grounding", "relevance", "tone", "concision"] as const).map(axis => {
        const values = rows.flatMap(r => r[axis] === null ? [] : [r[axis]]);
        return [axis, { count: values.length, mean: values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null }];
      })) }];
  }));
  let completePairs = 0; let singleWins = 0; let bestOfTwoWins = 0; let ties = 0;
  for (const pairId of new Set(key.map(k => k.pairId))) {
    const a = rated.find(r => r.pairId === pairId && r.strategy === "single");
    const b = rated.find(r => r.pairId === pairId && r.strategy === "best_of_two");
    if (!a || !b) continue;
    completePairs++;
    if (a.acceptable === b.acceptable) ties++;
    else if (a.acceptable) singleWins++; else bestOfTwoWins++;
  }
  return { byStrategy, completePairs, singleWins, bestOfTwoWins, ties,
    scope: "Final outputs/abstentions only; not false-rejection calibration for hidden rejected candidates. No significance claim." };
}
