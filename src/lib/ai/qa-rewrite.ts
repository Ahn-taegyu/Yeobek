import "server-only";
import { z } from "zod";
import { qaAnswer, qaQuestion, qaRewriteJobResponse, qaRewriteSchema, type QaRewriteJob } from "../contracts/qa";
import { answerJsonSchema } from "./contracts";
import { HarnessError } from "./context";
import { abortable, createDeadline } from "./deadline";
import { AiError } from "./errors";
import { expectedQaContext, validateQaContext, type ExpectedQaCompletion, type QaOutcome } from "./expected-qa";
import { validateAnswer } from "./harness";
import { normalizeAiOutcome } from "./outcome";
import { PlaybookOrderError, startPlaybook } from "./playbook";
import { capabilitiesFor, playbookPrompt } from "./plugin";
import type { AiProviderTrace, AiTextProvider } from "./providers/types";

const rewriteContext = expectedQaContext.extend({ question: qaQuestion, previousAnswer: qaAnswer.nullable(),
  instruction: qaRewriteSchema.shape.instruction });
export const qaRewriteReservation = z.strictObject({
  claimed: z.boolean(), job: qaRewriteJobResponse, context: rewriteContext.nullable(),
}).refine(value => value.claimed === (value.context !== null));
export interface QaRewriteStore {
  reserve(signal?: AbortSignal): Promise<z.infer<typeof qaRewriteReservation>>;
  complete(job: QaRewriteJob, result: ExpectedQaCompletion): Promise<QaRewriteJob>;
}
const judgment = z.strictObject({ grounded: z.boolean() });
// Completion caps include reasoning as well as the final JSON at gateways.
// Keep a finite budget matching narration evaluation, even for a boolean verdict.
export const QA_REWRITE_JUDGE_OUTPUT_TOKENS = 3000;
const judgeSchema = { name: "yeobek_artist_qa_rewrite_judge", definition: {
  type: "object", required: ["grounded"], additionalProperties: false, properties: { grounded: { type: "boolean" } },
} };

export async function executeQaRewrite(ownerId: string, store: QaRewriteStore, text: AiTextProvider, judge: AiTextProvider, signal?: AbortSignal) {
  if (signal?.aborted) throw new AiError("cancelled");
  const caps = capabilitiesFor("artist-qa-rewrite", { qaRewrite: store });
  const flow = startPlaybook("artist-qa-rewrite");
  const { job, context, claimed } = await flow.step("job.reserve", () => caps["rewrite.reserve"](signal)).catch(error => {
    if (!(error instanceof PlaybookOrderError)) flow.fail(error);
    throw error;
  });
  if (!claimed) {
    for (const phase of ["context.validate", "model.generate", "output.validate", "model.judge", "judge.validate", "job.complete"] as const) {
      flow.skip(phase, "job_replay");
    }
    flow.finish();
    return { job, created: false };
  }
  const deadline = createDeadline(65_000, signal);
  const usage: AiProviderTrace[] = [];
  let result: QaOutcome =
    { status: "abstained", resultCode: "EVIDENCE_REQUIRED", routing: "author", mock: job.mock };
  async function invoke(provider: AiTextProvider, request: Omit<Parameters<AiTextProvider["generate"]>[0], "signal">) {
    const callDeadline = createDeadline(30_000, deadline.signal);
    try {
      const response = await abortable(callDeadline.signal, activeSignal => provider.generate({ ...request, signal: activeSignal }), { defer: true });
      usage.push(response.trace);
      if (Boolean(response.trace.mock) !== job.mock) throw new HarnessError("invalid_output");
      return response.output;
    } finally { callDeadline.dispose(); }
  }
  try {
    const { question, previousAnswer, instruction, evidence } = await flow.step("context.validate", () => {
      deadline.signal.throwIfAborted();
      const evidence = validateQaContext(ownerId, job, context);
      if (!context) throw new HarnessError("invalid_context");
      return { question: context.question, previousAnswer: context.previousAnswer, instruction: context.instruction, evidence };
    });
    if (!evidence.length) {
      for (const phase of ["model.generate", "output.validate", "model.judge", "judge.validate"] as const) flow.skip(phase, "insufficient_evidence");
    } else {
      const output = await flow.step("model.generate", () => invoke(text, {
        system: playbookPrompt("artist-qa-rewrite"), input: JSON.stringify({ question, previousAnswer, instruction, evidence }),
        schema: { ...answerJsonSchema, name: "yeobek_artist_qa_rewrite" }, maxOutputTokens: 1000,
      }));
      const answer = await flow.step("output.validate", () => validateAnswer(output, evidence.map(source => source.id)));
      if (answer.outcome === "answered") {
        const candidate = { question, answer: answer.answer, citations: answer.citations };
        const assessment = await flow.step("model.judge", () => invoke(judge, {
          system: playbookPrompt("artist-qa-rewrite"), input: JSON.stringify({ question, candidate,
            evidence: evidence.filter(source => answer.citations.includes(source.id)) }),
          schema: judgeSchema, maxOutputTokens: QA_REWRITE_JUDGE_OUTPUT_TOKENS,
        }));
        const grounded = await flow.step("judge.validate", () => {
          deadline.signal.throwIfAborted();
          const parsed = judgment.safeParse(assessment);
          if (!parsed.success) throw new HarnessError("invalid_output");
          return parsed.data.grounded;
        });
        result = grounded ? { status: "succeeded", items: [candidate], mock: job.mock } :
          { status: "abstained", resultCode: "EVIDENCE_REQUIRED", routing: "author", mock: job.mock };
      } else {
        flow.skip("model.judge", "insufficient_evidence");
        flow.skip("judge.validate", "insufficient_evidence");
      }
    }
  } catch (error) {
    if (error instanceof PlaybookOrderError) throw error;
    const failure = normalizeAiOutcome(deadline.timedOut() ? new AiError("timeout") : signal?.aborted ? new AiError("cancelled") : error);
    result = { status: failure.status === 499 ? "cancelled" : "failed", resultCode: failure.code, routing: failure.routing, mock: job.mock };
  } finally { deadline.dispose(); }
  let settled = job;
  await flow.settleJob(async steps => { settled = await caps["rewrite.complete"](job, { ...result, steps, usage }); });
  return { job: settled, created: true };
}
