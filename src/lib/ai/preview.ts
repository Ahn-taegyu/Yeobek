import "server-only";
import { z } from "zod";
import { previewAnswerResponse, type PreviewAnswer } from "../contracts/qa";
import { answerJsonSchema } from "./contracts";
import { HarnessError } from "./context";
import { abortable, createDeadline } from "./deadline";
import { AiError } from "./errors";
import { expectedQaContext, validateQaContext, type QaExecution } from "./expected-qa";
import { validateAnswer } from "./harness";
import { normalizeAiOutcome, type AiRouting } from "./outcome";
import { PlaybookOrderError, startPlaybook } from "./playbook";
import { capabilitiesFor, playbookPrompt } from "./plugin";
import type { AiTextProvider, AiProviderTrace } from "./providers/types";

export const previewReservation = z.strictObject({
  claimed: z.boolean(), job: previewAnswerResponse, context: expectedQaContext.nullable(),
}).refine(value => value.claimed === (value.context !== null));
type PreviewOutcome = { status: "succeeded"; answer: string; citations: string[]; mock: boolean } |
  { status: "failed" | "cancelled" | "abstained"; resultCode: string; routing: AiRouting; mock: boolean };
export interface PreviewStore {
  reserve(signal?: AbortSignal): Promise<z.infer<typeof previewReservation>>;
  complete(job: PreviewAnswer, result: PreviewOutcome & QaExecution): Promise<PreviewAnswer>;
}

export async function executePreview(ownerId: string, store: PreviewStore, text: AiTextProvider, signal?: AbortSignal) {
  if (signal?.aborted) throw new AiError("cancelled");
  const caps = capabilitiesFor("artist-preview", { preview: store });
  const flow = startPlaybook("artist-preview");
  const { job, context, claimed } = await flow.step("job.reserve", () => caps["preview.reserve"](signal)).catch(error => {
    if (!(error instanceof PlaybookOrderError)) flow.fail(error);
    throw error;
  });
  if (!claimed) {
    for (const phase of ["context.validate", "model.generate", "output.validate", "job.complete"] as const) flow.skip(phase, "job_replay");
    flow.finish();
    return { job, created: false };
  }
  const deadline = createDeadline(30_000, signal);
  const usage: AiProviderTrace[] = [];
  let result: PreviewOutcome = { status: "abstained", resultCode: "EVIDENCE_REQUIRED", routing: "author", mock: job.mock };
  try {
    const evidence = await flow.step("context.validate", () => {
      deadline.signal.throwIfAborted();
      return validateQaContext(ownerId, job, context);
    });
    if (!evidence.length) {
      flow.skip("model.generate", "insufficient_evidence");
      flow.skip("output.validate", "insufficient_evidence");
    } else {
      const response = await flow.step("model.generate", () => abortable(deadline.signal, activeSignal => text.generate({
        system: playbookPrompt("artist-preview"), input: JSON.stringify({ question: job.question, scope: job.scope, evidence }),
        schema: { ...answerJsonSchema, name: "yeobek_artist_preview" }, maxOutputTokens: 1000, signal: activeSignal,
      }), { defer: true }));
      usage.push(response.trace);
      const answer = await flow.step("output.validate", () => {
        deadline.signal.throwIfAborted();
        if (Boolean(response.trace.mock) !== job.mock) throw new HarnessError("invalid_output");
        return validateAnswer(response.output, evidence.map(source => source.id));
      });
      if (answer.outcome === "answered") result = { status: "succeeded", answer: answer.answer, citations: answer.citations, mock: job.mock };
      else if (answer.outcome === "clarify") result = { ...result, resultCode: "CONTEXT_AMBIGUOUS" };
    }
  } catch (error) {
    if (error instanceof PlaybookOrderError) throw error;
    const failure = normalizeAiOutcome(deadline.timedOut() ? new AiError("timeout") : signal?.aborted ? new AiError("cancelled") : error);
    result = { status: failure.status === 499 ? "cancelled" : "failed", resultCode: failure.code, routing: failure.routing, mock: job.mock };
  } finally { deadline.dispose(); }
  let settled = job;
  await flow.settleJob(async steps => { settled = await caps["preview.complete"](job, { ...result, steps, usage }); });
  return { job: settled, created: true };
}
