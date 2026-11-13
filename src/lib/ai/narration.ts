import "server-only";
import { randomInt } from "node:crypto";
import { z } from "zod";
import { KnowledgeError, validateArtistKnowledgeContext, type ArtistKnowledgeStore } from "./artist-knowledge";
import { textHash } from "./context";
import { answerJsonSchema, type ModelAnswer } from "./contracts";
import { AiError, type AiErrorCode } from "./errors";
import { validateAnswer } from "./harness";
import { assertPlaybookToolConfigured, playbookPrompt } from "./plugin";
import { NARRATION_SYSTEM_PROMPT, PROMPT_VERSION } from "./prompts";
import type { AiProviderTrace, AiTextProvider, AiTextRequest } from "./providers/types";

const strategySchema = z.enum(["single", "best_of_two"]);
const requestSchema = z.strictObject({
  documentId: z.uuid(),
  expectedRevision: z.number().int().positive().max(2147483647),
  strategy: strategySchema,
});
export type NarrationStrategy = z.infer<typeof strategySchema>;
export type NarrationRequest = z.infer<typeof requestSchema>;

const score = z.number().int().min(1).max(5);
const evaluationSchema = z.strictObject({
  candidateId: z.string(),
  grounding: score,
  relevance: score,
  tone: score,
  concision: score,
  unsupportedIntent: z.boolean(),
  confidentialityLeak: z.boolean(),
});
const judgeSchema = z.strictObject({ evaluations: z.array(evaluationSchema).min(1).max(2) });
export type JudgeEvaluation = z.infer<typeof evaluationSchema>;

const judgeJsonSchema = {
  name: "yeobek_narration_evaluations",
  definition: {
    type: "object", additionalProperties: false, required: ["evaluations"],
    properties: {
      evaluations: { type: "array", items: {
        type: "object", additionalProperties: false, required: Object.keys(evaluationSchema.shape),
        properties: {
          candidateId: { type: "string" },
          grounding: { type: "integer" }, relevance: { type: "integer" },
          tone: { type: "integer" }, concision: { type: "integer" },
          unsupportedIntent: { type: "boolean" }, confidentialityLeak: { type: "boolean" },
        },
      } },
    },
  },
};

export const NARRATION_LIMITS = {
  deadlineMs: 120_000,
  callTimeoutMs: 30_000,
  generationOutputTokens: 1600,
  judgeOutputTokens: 3000,
  single: { rounds: 1, candidates: 1, calls: 2, outputTokens: 4600 },
  best_of_two: { rounds: 2, candidates: 2, calls: 6, outputTokens: 12_400 },
} as const;

export interface NarrationCallMetric {
  role: "generation" | "judge";
  round: number;
  candidateId?: string;
  elapsedMs: number;
  maxOutputTokens: number;
  status: "success" | "failed";
  errorCode?: AiErrorCode | "invalid_candidate" | "invalid_evaluation";
  trace?: AiProviderTrace;
}

type AbstentionReason = "invalid_request" | "unavailable" | "invalid_context" | "stale_context" |
  "insufficient_evidence" | "clarify" | "generation_failed" | "invalid_candidate" |
  "judge_failed" | "below_threshold" | "cancelled" | "timeout";
type NarrationResultBase = {
  promptVersion: string;
  contextHash: string | null;
  metrics: {
    strategy: NarrationStrategy | null;
    rounds: number;
    elapsedMs: number;
    reservedCalls: number;
    reservedOutputTokens: number;
    calls: NarrationCallMetric[];
    evaluations: (JudgeEvaluation & { round: number; passed: boolean })[];
  };
};
export type NarrationResult = NarrationResultBase & (
  { status: "selected"; reason: "passed"; selected: ModelAnswer; selectedCandidateId: string } |
  { status: "abstained"; reason: AbstentionReason; selected: null; selectedCandidateId: null }
);

type Candidate = { id: string; draft: ModelAnswer };
type Feedback = "invalid_candidate" | "grounding" | "relevance" | "tone" | "concision" | "unsupported_intent" | "confidentiality";

function failedCriteria(evaluation: JudgeEvaluation): Feedback[] {
  const failures: Feedback[] = [];
  if (evaluation.grounding < 4) failures.push("grounding");
  if (evaluation.relevance < 4) failures.push("relevance");
  if (evaluation.tone < 4) failures.push("tone");
  if (evaluation.concision < 3) failures.push("concision");
  if (evaluation.unsupportedIntent) failures.push("unsupported_intent");
  if (evaluation.confidentialityLeak) failures.push("confidentiality");
  return failures;
}

function totalScore(evaluation: JudgeEvaluation) {
  return evaluation.grounding + evaluation.relevance + evaluation.tone + evaluation.concision;
}

function validateEvaluations(output: unknown, candidates: Candidate[]): JudgeEvaluation[] | null {
  const parsed = judgeSchema.safeParse(output);
  if (!parsed.success || parsed.data.evaluations.length !== candidates.length ||
    candidates.some(candidate => parsed.data.evaluations.filter(row => row.candidateId === candidate.id).length !== 1)) {
    return null;
  }
  return parsed.data.evaluations;
}

// The abort race also bounds a store or injected provider that ignores its signal.
function abortable<T>(signal: AbortSignal, operation: (signal: AbortSignal) => Promise<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const abort = () => reject(signal.reason);
    if (signal.aborted) {
      abort();
      return;
    }
    signal.addEventListener("abort", abort, { once: true });
    void Promise.resolve().then(() => {
      signal.throwIfAborted();
      return operation(signal);
    }).then(resolve, reject).finally(() => signal.removeEventListener("abort", abort));
  });
}

/** actorId comes from server authentication. The store must authorize every
 * load and source before returning a snapshot. This workflow only reads drafts.
 */
export function createNarrationHarness(actorId: string, deps: {
  store: Pick<ArtistKnowledgeStore, "loadOwnedContext">;
  generator: AiTextProvider;
  judge: AiTextProvider;
  now?: () => number;
}) {
  const now = deps.now ?? (() => performance.now());
  return {
    async draft(input: NarrationRequest, signal?: AbortSignal): Promise<NarrationResult> {
      const started = now();
      const parsed = requestSchema.safeParse(input);
      const metrics: NarrationResultBase["metrics"] = {
        strategy: parsed.success ? parsed.data.strategy : null, rounds: 0, elapsedMs: 0,
        reservedCalls: 0, reservedOutputTokens: 0, calls: [], evaluations: [],
      };
      let contextHash: string | null = null;
      const resultBase = (): NarrationResultBase => ({
        contextHash, promptVersion: PROMPT_VERSION, metrics: { ...metrics, elapsedMs: now() - started },
      });
      const abstain = (reason: AbstentionReason): NarrationResult => ({
        ...resultBase(), status: "abstained", reason, selected: null, selectedCandidateId: null,
      });
      if (!parsed.success || !z.uuid().safeParse(actorId).success) return abstain("invalid_request");
      const { documentId, expectedRevision, strategy } = parsed.data;
      const budget = NARRATION_LIMITS[strategy];
      const deadline = new AbortController();
      const timer = setTimeout(() => deadline.abort(new AiError("timeout")), NARRATION_LIMITS.deadlineMs);
      const requestSignal = signal ? AbortSignal.any([signal, deadline.signal]) : deadline.signal;
      function interrupted(): "cancelled" | "timeout" | undefined {
        if (signal?.aborted) return "cancelled";
        if (deadline.signal.aborted || now() - started >= NARRATION_LIMITS.deadlineMs) return "timeout";
      }
      const load = () => {
        assertPlaybookToolConfigured("narration-draft", "author.read");
        return abortable(requestSignal, activeSignal => deps.store.loadOwnedContext(actorId, documentId, activeSignal));
      };

      async function invoke<T>(
        provider: AiTextProvider,
        request: Omit<AiTextRequest, "signal" | "maxOutputTokens">,
        call: { role: "generation" | "judge"; round: number; candidateId?: string },
        parse: (output: unknown) => T | null,
      ): Promise<{ value: T | null; errorCode?: NarrationCallMetric["errorCode"] }> {
        const stopped = interrupted();
        if (stopped) return { value: null, errorCode: stopped };
        const callStarted = now();
        const maxOutputTokens = call.role === "generation" ? NARRATION_LIMITS.generationOutputTokens : NARRATION_LIMITS.judgeOutputTokens;
        const metric: NarrationCallMetric = { ...call, maxOutputTokens, elapsedMs: 0, status: "failed" };
        metrics.calls.push(metric);
        const timeout = new AbortController();
        const callTimer = setTimeout(() => timeout.abort(new AiError("timeout")), NARRATION_LIMITS.callTimeoutMs);
        const callSignal = AbortSignal.any([requestSignal, timeout.signal]);
        try {
          const response = await abortable(callSignal, activeSignal =>
            provider.generate({ ...request, maxOutputTokens, signal: activeSignal }));
          metric.trace = response.trace;
          const interruptedAfterCall = interrupted();
          if (interruptedAfterCall) throw new AiError(interruptedAfterCall);
          if (now() - callStarted >= NARRATION_LIMITS.callTimeoutMs) throw new AiError("timeout");
          const value = parse(response.output);
          if (value === null) {
            metric.errorCode = call.role === "generation" ? "invalid_candidate" : "invalid_evaluation";
            return { value: null, errorCode: metric.errorCode };
          }
          metric.status = "success";
          return { value };
        } catch (error) {
          metric.errorCode = interrupted() ?? (error instanceof AiError ? error.code : "provider_unavailable");
          return { value: null, errorCode: metric.errorCode };
        } finally {
          clearTimeout(callTimer);
          metric.elapsedMs = now() - callStarted;
        }
      }

      let rechecking = false;
      try {
        const stopped = interrupted();
        if (stopped) return abstain(stopped);
        const raw = await load();
        const stoppedAfterLoad = interrupted();
        if (stoppedAfterLoad) return abstain(stoppedAfterLoad);
        if (raw === null) return abstain("unavailable");
        const context = validateArtistKnowledgeContext(raw, actorId, documentId);
        if (context.subjectType !== "artwork") return abstain("invalid_context");
        if (context.revision !== expectedRevision) return abstain("stale_context");
        contextHash = textHash(JSON.stringify(context));
        const sources = context.sources.map(source => ({ id: source.id, scope: source.subjectType, text: source.text }));
        if (!sources.length) return abstain("insufficient_evidence");
        const allowedIds = sources.map(source => source.id);
        const candidateStrategies = (["overview", "focused"] as const).slice(0, budget.candidates);
        const failureFeedback = new Set<Feedback>();

        async function checkSnapshot() {
          rechecking = true;
          const current = validateArtistKnowledgeContext(await load(), actorId, documentId);
          rechecking = false;
          return textHash(JSON.stringify(current)) === contextHash;
        }

        for (let round = 1; round <= budget.rounds; round++) {
          if (round > 1 && !await checkSnapshot()) return abstain(interrupted() ?? "stale_context");
          const stopped = interrupted();
          if (stopped) return abstain(stopped);

          // Reserve the whole round before starting parallel generation. A failed
          // call or skipped judge never replenishes the current request's budget.
          const calls = budget.candidates + 1;
          const tokens = budget.candidates * NARRATION_LIMITS.generationOutputTokens + NARRATION_LIMITS.judgeOutputTokens;
          if (metrics.reservedCalls + calls > budget.calls || metrics.reservedOutputTokens + tokens > budget.outputTokens) break;
          metrics.reservedCalls += calls;
          metrics.reservedOutputTokens += tokens;
          metrics.rounds = round;

          const feedback = [...failureFeedback].sort();
          failureFeedback.clear();
          const attempts = await Promise.all(candidateStrategies.map(async (expression, index) => {
            const id = `r${round}-c${index + 1}`;
            const result = await invoke(deps.generator, {
              system: NARRATION_SYSTEM_PROMPT, schema: answerJsonSchema,
              input: JSON.stringify({ sources, strategy: expression, feedback }),
            }, { role: "generation", round, candidateId: id }, output => {
              try {
                return validateAnswer(output, allowedIds);
              } catch {
                return null;
              }
            });
            return { id, ...result };
          }));
          const stoppedAfterGeneration = interrupted();
          if (stoppedAfterGeneration) return abstain(stoppedAfterGeneration);

          const candidates: Candidate[] = [];
          let missingEvidence: "clarify" | "insufficient_evidence" | undefined;
          for (const attempt of attempts) {
            if (attempt.errorCode === "invalid_candidate") failureFeedback.add("invalid_candidate");
            if (!attempt.value) continue;
            if (attempt.value.outcome === "answered") candidates.push({ id: attempt.id, draft: attempt.value });
            else missingEvidence = attempt.value.outcome === "insufficient_evidence" ? "insufficient_evidence" : missingEvidence ?? "clarify";
          }

          let reason: AbstentionReason = missingEvidence ?? (failureFeedback.size ? "invalid_candidate" : "generation_failed");
          if (candidates.length) {
            assertPlaybookToolConfigured("narration-evaluate", "author.read");
            if (!await checkSnapshot()) return abstain(interrupted() ?? "stale_context");
            const ordered = candidates.length === 2 && randomInt(2) ? [...candidates].reverse() : candidates;
            const assessment = await invoke(deps.judge, {
              system: playbookPrompt("narration-evaluate"), schema: judgeJsonSchema,
              input: JSON.stringify({ sources, candidates: ordered.map(({ id, draft }) => ({
                candidateId: id, answer: draft.answer, citations: draft.citations,
              })) }),
            }, { role: "judge", round }, output => validateEvaluations(output, candidates));
            const stoppedAfterJudging = interrupted();
            if (stoppedAfterJudging) return abstain(stoppedAfterJudging);
            if (!assessment.value) return abstain("judge_failed");

            const eligible: JudgeEvaluation[] = [];
            for (const evaluation of assessment.value) {
              const failures = failedCriteria(evaluation);
              metrics.evaluations.push({ ...evaluation, round, passed: failures.length === 0 });
              if (!failures.length) eligible.push(evaluation);
              for (const failure of failures) failureFeedback.add(failure);
            }
            eligible.sort((a, b) => totalScore(b) - totalScore(a) || a.candidateId.localeCompare(b.candidateId));
            if (eligible.length) {
              const winner = candidates.find(candidate => candidate.id === eligible[0].candidateId)!;
              if (!await checkSnapshot()) return abstain(interrupted() ?? "stale_context");
              const stoppedBeforeSelection = interrupted();
              if (stoppedBeforeSelection) return abstain(stoppedBeforeSelection);
              const selected = validateAnswer(winner.draft, allowedIds);
              return { ...resultBase(), status: "selected", reason: "passed", selected, selectedCandidateId: winner.id };
            }
            reason = missingEvidence ?? "below_threshold";
          }
          if (missingEvidence || failureFeedback.has("confidentiality") || !failureFeedback.size ||
            round === budget.rounds) return abstain(reason);
        }
        return abstain("below_threshold");
      } catch (error) {
        const stopped = interrupted();
        if (stopped) return abstain(stopped);
        if (rechecking) return abstain("stale_context");
        return abstain(error instanceof KnowledgeError && error.code === "invalid_context" ? "invalid_context" : "unavailable");
      } finally {
        clearTimeout(timer);
      }
    },
  };
}
