import "server-only";
import { randomInt } from "node:crypto";
import { z } from "zod";
import { KnowledgeError, validateArtistKnowledgeContext, type ArtistKnowledgeStore } from "./artist-knowledge";
import { textHash } from "./context";
import { AI_LIMITS, codepoints, narrationDraftJsonSchema, type NarrationDraft } from "./contracts";
import { AiError, type AiErrorCode } from "./errors";
import { validateNarrationDraft } from "./harness";
import { abortable, createDeadline } from "./deadline";
import { PlaybookOrderError, startPlaybook, type PlaybookStepId, type PlaybookStepRecord } from "./playbook";
import { capabilitiesFor, playbookPrompt } from "./plugin";
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

export type AbstentionReason = "invalid_request" | "unavailable" | "invalid_context" | "stale_context" |
  "insufficient_evidence" | "clarify" | "generation_failed" | "invalid_candidate" |
  "judge_failed" | "below_threshold" | "cancelled" | "timeout";
type NarrationResultBase = {
  promptVersion: string;
  contextHash: string | null;
  /** Internal execution records. Omit from future HTTP responses. */
  steps: readonly PlaybookStepRecord[];
  metrics: {
    strategy: NarrationStrategy | null;
    rounds: number;
    elapsedMs: number;
    reservedCalls: number;
    reservedOutputTokens: number;
    calls: NarrationCallMetric[];
    evaluations: (JudgeEvaluation & { round: number; passed: boolean })[];
    evaluationSteps: { round: number; steps: readonly PlaybookStepRecord[] }[];
  };
};
export type NarrationResult = NarrationResultBase & (
  { status: "selected"; reason: "passed"; selected: NarrationDraft; selectedCandidateId: string; overTarget: boolean } |
  { status: "abstained"; reason: AbstentionReason; selected: null; selectedCandidateId: null }
);

type Candidate = { id: string; draft: NarrationDraft };
type Feedback = "invalid_candidate" | "grounding" | "relevance" | "tone" | "concision" | "unsupported_intent" | "confidentiality";
type CandidateSelection = { winner: Candidate } | { reason: AbstentionReason };

class InvalidModelOutput extends Error {
  constructor(readonly code: "invalid_candidate" | "invalid_evaluation") { super(code); }
}

class StaleNarrationContext extends Error {}

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
  const draftCapabilities = capabilitiesFor("narration-draft", { author: deps.store });
  const evaluationCapabilities = capabilitiesFor("narration-evaluate", { author: deps.store });
  return {
    async draft(input: NarrationRequest, signal?: AbortSignal): Promise<NarrationResult> {
      const started = now();
      const run = startPlaybook("narration-draft");
      const parsed = await run.step("request.validate", () => {
        const request = requestSchema.safeParse(input);
        return { request, validActor: z.uuid().safeParse(actorId).success };
      });
      const metrics: NarrationResultBase["metrics"] = {
        strategy: parsed.request.success ? parsed.request.data.strategy : null, rounds: 0, elapsedMs: 0,
        reservedCalls: 0, reservedOutputTokens: 0, calls: [], evaluations: [], evaluationSteps: [],
      };
      let contextHash: string | null = null;
      const resultBase = (steps: readonly PlaybookStepRecord[]): NarrationResultBase => ({
        contextHash, promptVersion: PROMPT_VERSION, steps, metrics: { ...metrics, elapsedMs: now() - started },
      });
      const abstained = (reason: AbstentionReason, steps: readonly PlaybookStepRecord[]): NarrationResult => ({
        ...resultBase(steps), status: "abstained", reason, selected: null, selectedCandidateId: null,
      });
      const abstain = (reason: AbstentionReason, ...remaining: PlaybookStepId<"narration-draft">[]) => {
        for (const id of remaining) run.skip(id, reason);
        return abstained(reason, run.finish());
      };
      const afterRounds = ["author.recheck.final", "output.validate"] as const;
      const afterEvidence = ["candidate.rounds", ...afterRounds] as const;
      const afterRead = ["evidence.select", ...afterEvidence] as const;
      const afterValidation = ["author.read", ...afterRead] as const;
      if (!parsed.request.success || !parsed.validActor) return abstain("invalid_request", ...afterValidation);
      const { documentId, expectedRevision, strategy } = parsed.request.data;
      const budget = NARRATION_LIMITS[strategy];
      const deadline = createDeadline(NARRATION_LIMITS.deadlineMs, signal);
      const requestSignal = deadline.signal;
      function interrupted(): "cancelled" | "timeout" | undefined {
        if (signal?.aborted) return "cancelled";
        if (deadline.timedOut() || now() - started >= NARRATION_LIMITS.deadlineMs) return "timeout";
      }
      const load = (read: ArtistKnowledgeStore["loadOwnedContext"]) =>
        abortable(requestSignal, activeSignal => read(actorId, documentId, activeSignal), { defer: true });

      async function invoke<T>(
        provider: AiTextProvider,
        request: () => Omit<AiTextRequest, "signal" | "maxOutputTokens">,
        call: { role: "generation" | "judge"; round: number; candidateId?: string },
        process: (generate: () => Promise<unknown>) => T | Promise<T>,
      ): Promise<T> {
        const maxOutputTokens = call.role === "generation" ? NARRATION_LIMITS.generationOutputTokens : NARRATION_LIMITS.judgeOutputTokens;
        const metric: NarrationCallMetric = { ...call, maxOutputTokens, elapsedMs: 0, status: "failed" };
        let callStarted: number | undefined;
        let timeout: ReturnType<typeof createDeadline> | undefined;
        try {
          const value = await process(async () => {
            const stopped = interrupted();
            if (stopped) throw new AiError(stopped);
            callStarted = now();
            metrics.calls.push(metric);
            timeout = createDeadline(NARRATION_LIMITS.callTimeoutMs, requestSignal);
            const response = await abortable(timeout.signal, activeSignal =>
              provider.generate({ ...request(), maxOutputTokens, signal: activeSignal }), { defer: true });
            metric.trace = response.trace;
            const interruptedAfterCall = interrupted();
            if (interruptedAfterCall) throw new AiError(interruptedAfterCall);
            if (now() - callStarted >= NARRATION_LIMITS.callTimeoutMs) throw new AiError("timeout");
            return response.output;
          });
          metric.status = "success";
          return value;
        } catch (error) {
          metric.errorCode = interrupted() ?? (error instanceof AiError || error instanceof InvalidModelOutput
            ? error.code : "provider_unavailable");
          throw error;
        } finally {
          timeout?.dispose();
          if (callStarted !== undefined) metric.elapsedMs = now() - callStarted;
        }
      }

      async function assertSnapshot(read: ArtistKnowledgeStore["loadOwnedContext"]) {
        try {
          const current = validateArtistKnowledgeContext(await load(read), actorId, documentId);
          if (textHash(JSON.stringify(current)) === contextHash) return;
        } catch (error) {
          if (error instanceof PlaybookOrderError) throw error;
        }
        throw new StaleNarrationContext();
      }

      try {
        const stopped = interrupted();
        if (stopped) return abstain(stopped, ...afterValidation);
        const raw = await run.step("author.read", () => load(draftCapabilities["author.read"]));
        const stoppedAfterLoad = interrupted();
        if (stoppedAfterLoad) return abstain(stoppedAfterLoad, ...afterRead);
        if (raw === null) return abstain("unavailable", ...afterRead);
        const sources = await run.step("evidence.select", () => {
          const context = validateArtistKnowledgeContext(raw, actorId, documentId);
          if (context.subjectType !== "artwork") throw new KnowledgeError("invalid_context");
          if (context.revision !== expectedRevision) throw new StaleNarrationContext();
          contextHash = textHash(JSON.stringify(context));
          return context.sources.map(source => ({ id: source.id, scope: source.subjectType, text: source.text }));
        });
        if (!sources.length) return abstain("insufficient_evidence", ...afterEvidence);
        const allowedIds = sources.map(source => source.id);
        const candidateStrategies = (["overview", "focused"] as const).slice(0, budget.candidates);
        const failureFeedback = new Set<Feedback>();

        async function evaluate(candidates: Candidate[], round: number): Promise<CandidateSelection | undefined> {
          const evaluation = startPlaybook("narration-evaluate");
          try {
            await evaluation.step("author.recheck", () => assertSnapshot(evaluationCapabilities["author.read"]));
            const assessments = await invoke(deps.judge, () => {
              const ordered = candidates.length === 2 && randomInt(2) ? [...candidates].reverse() : candidates;
              return {
                system: playbookPrompt("narration-evaluate"), schema: judgeJsonSchema,
                input: JSON.stringify({ sources, candidates: ordered.map(({ id, draft }) => ({
                  candidateId: id, answer: draft.answer, citations: draft.citations,
                })) }),
              };
            }, { role: "judge", round }, async generate => {
              const output = await evaluation.step("model.evaluate", generate);
              return evaluation.step("output.validate", () => {
                const assessments = validateEvaluations(output, candidates);
                if (!assessments) throw new InvalidModelOutput("invalid_evaluation");
                return assessments;
              });
            });
            const stopped = interrupted();
            if (stopped) {
              evaluation.skip("candidate.rank", stopped);
              metrics.evaluationSteps.push({ round, steps: evaluation.finish() });
              return { reason: stopped };
            }
            const ranked = await evaluation.step("candidate.rank", () => {
              const eligible: JudgeEvaluation[] = [];
              for (const assessment of assessments) {
                const failures = failedCriteria(assessment);
                metrics.evaluations.push({ ...assessment, round, passed: failures.length === 0 });
                if (!failures.length) eligible.push(assessment);
                for (const failure of failures) failureFeedback.add(failure);
              }
              eligible.sort((a, b) => totalScore(b) - totalScore(a) || a.candidateId.localeCompare(b.candidateId));
              return candidates.find(candidate => candidate.id === eligible[0]?.candidateId);
            });
            metrics.evaluationSteps.push({ round, steps: evaluation.finish() });
            if (ranked) return { winner: ranked };
          } catch (error) {
            if (error instanceof PlaybookOrderError) throw error;
            metrics.evaluationSteps.push({ round, steps: evaluation.fail(error) });
            if (error instanceof StaleNarrationContext) throw error;
            return { reason: interrupted() ?? "judge_failed" };
          }
        }

        async function selectCandidate(): Promise<CandidateSelection> {
          for (let round = 1; round <= budget.rounds; round++) {
            if (round > 1) await assertSnapshot(draftCapabilities["author.read"]);
            const stopped = interrupted();
            if (stopped) return { reason: stopped };

            // A failed call or skipped judge never replenishes the round's reservation.
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
              try {
                const value = await invoke(deps.generator, () => ({
                  system: NARRATION_SYSTEM_PROMPT, schema: narrationDraftJsonSchema,
                  input: JSON.stringify({ sources, strategy: expression, feedback }),
                }), { role: "generation", round, candidateId: id }, async generate => {
                  const output = await generate();
                  try {
                    return validateNarrationDraft(output, allowedIds);
                  } catch {
                    throw new InvalidModelOutput("invalid_candidate");
                  }
                });
                return { id, value };
              } catch (error) {
                if (error instanceof PlaybookOrderError) throw error;
                if (error instanceof InvalidModelOutput) failureFeedback.add("invalid_candidate");
                return { id, value: null };
              }
            }));
            const stoppedAfterGeneration = interrupted();
            if (stoppedAfterGeneration) return { reason: stoppedAfterGeneration };

            const candidates: Candidate[] = [];
            let missingEvidence: "clarify" | "insufficient_evidence" | undefined;
            for (const attempt of attempts) {
              if (!attempt.value) continue;
              if (attempt.value.outcome === "answered") candidates.push({ id: attempt.id, draft: attempt.value });
              else missingEvidence = attempt.value.outcome === "insufficient_evidence" ? "insufficient_evidence" : missingEvidence ?? "clarify";
            }

            let reason: AbstentionReason = missingEvidence ?? (failureFeedback.size ? "invalid_candidate" : "generation_failed");
            if (candidates.length) {
              const evaluated = await evaluate(candidates, round);
              if (evaluated) return evaluated;
              reason = missingEvidence ?? "below_threshold";
            }
            if (missingEvidence || failureFeedback.has("confidentiality") || !failureFeedback.size ||
              round === budget.rounds) return { reason };
          }
          return { reason: "below_threshold" };
        }
        const selection = await run.step("candidate.rounds", selectCandidate);
        const stoppedAfterRounds = interrupted();
        if (stoppedAfterRounds) return abstain(stoppedAfterRounds, ...afterRounds);
        if ("reason" in selection) return abstain(selection.reason, ...afterRounds);
        await run.step("author.recheck.final", () => assertSnapshot(draftCapabilities["author.read"]));
        const stoppedBeforeSelection = interrupted();
        if (stoppedBeforeSelection) return abstain(stoppedBeforeSelection, "output.validate");
        const selected = await run.step("output.validate", () => validateNarrationDraft(selection.winner.draft, allowedIds));
        const stoppedAfterValidation = interrupted();
        if (stoppedAfterValidation) return abstain(stoppedAfterValidation);
        return { ...resultBase(run.finish()), status: "selected", reason: "passed", selected, selectedCandidateId: selection.winner.id,
          overTarget: codepoints(selected.answer) > AI_LIMITS.narrationTarget };
      } catch (error) {
        if (error instanceof PlaybookOrderError) throw error;
        const steps = run.fail(error);
        const stopped = interrupted();
        if (stopped) return abstained(stopped, steps);
        if (error instanceof StaleNarrationContext) return abstained("stale_context", steps);
        return abstained(error instanceof KnowledgeError && error.code === "invalid_context" ? "invalid_context" : "unavailable", steps);
      } finally {
        deadline.dispose();
      }
    },
  };
}
