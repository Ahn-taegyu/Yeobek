import "server-only";
import { z } from "zod";
import { boundedText, codepoints } from "../contracts/chat";
import { expectedQaEntry, expectedQaMaxItems, expectedQaJobResponse, qaScope, type ExpectedQaJob } from "../contracts/qa";
import { revision, uuid } from "../contracts/requests";
import { AI_LIMITS } from "../policy";
import { HarnessError } from "./context";
import { abortable, createDeadline } from "./deadline";
import { AiError } from "./errors";
import { validateAnswer } from "./harness";
import { normalizeAiOutcome, type AiRouting } from "./outcome";
import { PlaybookOrderError, startPlaybook, type PlaybookStepRecord } from "./playbook";
import { capabilitiesFor, playbookPrompt } from "./plugin";
import type { AiProviderTrace, AiTextProvider } from "./providers/types";

export const expectedQaContext = z.strictObject({
  ownerId: uuid, scope: qaScope, exhibitionId: uuid, artworkId: uuid.nullable(), documentId: uuid,
  revision, documentRevision: revision,
  sources: z.array(z.strictObject({
    id: uuid, version: revision, body: boundedText(2000), scope: z.enum(["artist", "exhibition", "artwork"]),
    sourceLabel: boundedText(200),
  })).max(AI_LIMITS.evidenceCount),
});
export type ExpectedQaContext = z.infer<typeof expectedQaContext>;
const expectedQaGenerationContext = expectedQaContext.extend({ maxItems: z.number().int().positive() })
  .refine(context => context.maxItems <= expectedQaMaxItems[context.scope], { path: ["maxItems"] });
const entryList = z.strictObject({ items: z.array(expectedQaEntry).max(expectedQaMaxItems.exhibition) });
type QaEntries = z.infer<typeof entryList>["items"];
export const expectedQaReservation = z.strictObject({
  claimed: z.boolean(), job: expectedQaJobResponse, context: expectedQaGenerationContext.nullable(),
}).refine(value => value.claimed === (value.context !== null));
export type ExpectedQaReservation = z.infer<typeof expectedQaReservation>;
export type QaOutcome = { status: "succeeded"; items: QaEntries; mock: boolean } |
  { status: "abstained" | "failed" | "cancelled"; resultCode: string; routing: AiRouting; mock: boolean };
export type QaExecution = { steps: readonly PlaybookStepRecord[]; usage: AiProviderTrace[] };
export type ExpectedQaCompletion = QaOutcome & QaExecution;
export interface ExpectedQaStore {
  reserve(signal?: AbortSignal): Promise<ExpectedQaReservation>;
  complete(job: ExpectedQaJob, result: ExpectedQaCompletion): Promise<ExpectedQaJob>;
}

const jsonSchema = {
  name: "yeobek_expected_qa",
  definition: {
    type: "object", additionalProperties: false, required: ["items"], properties: {
      items: { type: "array", items: { type: "object", additionalProperties: false,
        required: ["question", "answer", "citations"], properties: {
          question: { type: "string" }, answer: { type: "string" }, citations: { type: "array", items: { type: "string" } },
        } } },
    },
  },
};

export function validateQaContext(ownerId: string, job: Pick<ExpectedQaJob,
  "scope" | "exhibitionId" | "artworkId" | "documentId" | "expectedRevision" | "expectedDocumentRevision">, context: ExpectedQaContext | null) {
  if (!context || context.ownerId !== ownerId || context.scope !== job.scope || context.exhibitionId !== job.exhibitionId ||
    context.artworkId !== job.artworkId || context.documentId !== job.documentId ||
    context.revision !== job.expectedRevision || context.documentRevision !== job.expectedDocumentRevision ||
    context.sources.some(source => context.scope === "exhibition" && source.scope === "artwork") ||
    new Set(context.sources.map(source => source.id)).size !== context.sources.length ||
    context.sources.reduce((sum, source) => sum + codepoints(source.body), 0) > AI_LIMITS.evidenceChars) {
    throw new HarnessError("invalid_context");
  }
  // Source labels and user identity fields are UI data. Only evidence bytes and pins go to AI.
  return context.sources.map(({ id, version, body, scope }) => ({ id, version, body, scope }));
}

function validateOutput(output: unknown, limit: number, allowed: string[]) {
  const parsed = entryList.safeParse(output);
  if (!parsed.success || parsed.data.items.length > limit) throw new HarnessError("invalid_output");
  const questions = new Set<string>();
  for (const item of parsed.data.items) {
    const key = item.question.normalize("NFKC").toLocaleLowerCase("ko").replace(/[\p{White_Space}\p{P}]/gu, "");
    if (!key || questions.has(key)) throw new HarnessError("invalid_output");
    questions.add(key);
    validateAnswer({ answer: item.question, outcome: "answered", citations: item.citations }, allowed);
    validateAnswer({ answer: item.answer, outcome: "answered", citations: item.citations }, allowed);
  }
  return parsed.data.items;
}

export async function executeExpectedQa(ownerId: string, store: ExpectedQaStore, text: AiTextProvider, signal?: AbortSignal) {
  if (signal?.aborted) throw new AiError("cancelled");
  const caps = capabilitiesFor("expected-qa-draft", { expectedQa: store });
  const flow = startPlaybook("expected-qa-draft");
  const reservation = await flow.step("job.reserve", () => caps["qa.reserve"](signal)).catch(error => {
    if (!(error instanceof PlaybookOrderError)) flow.fail(error);
    throw error;
  });
  const { job } = reservation;
  if (!reservation.claimed) {
    for (const phase of ["context.validate", "model.generate", "output.validate", "job.complete"] as const) flow.skip(phase, "job_replay");
    flow.finish();
    return { job, created: false };
  }
  const deadline = createDeadline(30_000, signal);
  let result: QaOutcome;
  const usage: AiProviderTrace[] = [];
  try {
    const { evidence, maxItems } = await flow.step("context.validate", () => {
      deadline.signal.throwIfAborted();
      const context = expectedQaGenerationContext.safeParse(reservation.context);
      if (!context.success) throw new HarnessError("invalid_context");
      return { evidence: validateQaContext(ownerId, job, context.data), maxItems: context.data.maxItems };
    });
    let items: QaEntries = [];
    if (evidence.length === 0) {
      flow.skip("model.generate", "insufficient_evidence");
      flow.skip("output.validate", "insufficient_evidence");
    } else {
      const response = await flow.step("model.generate", () => abortable(deadline.signal, activeSignal => text.generate({
        system: playbookPrompt("expected-qa-draft"), schema: jsonSchema, signal: activeSignal,
        maxOutputTokens: 3072, input: JSON.stringify({ scope: job.scope, maxItems, evidence }),
      }), { defer: true }));
      usage.push(response.trace);
      items = await flow.step("output.validate", () => {
        deadline.signal.throwIfAborted();
        if (Boolean(response.trace.mock) !== job.mock) throw new HarnessError("invalid_output");
        return validateOutput(response.output, maxItems, evidence.map(source => source.id));
      });
    }
    result = items.length ? { status: "succeeded", items, mock: job.mock } :
      { status: "abstained", resultCode: "EVIDENCE_REQUIRED", routing: "author", mock: job.mock };
  } catch (error) {
    if (error instanceof PlaybookOrderError) throw error;
    const failure = normalizeAiOutcome(deadline.timedOut() ? new AiError("timeout") : signal?.aborted ? new AiError("cancelled") : error);
    result = { status: failure.status === 499 ? "cancelled" : "failed", resultCode: failure.code, routing: failure.routing, mock: job.mock };
  } finally { deadline.dispose(); }
  let settled = job;
  await flow.settleJob(async steps => { settled = await caps["qa.complete"](job, { ...result, steps, usage }); });
  return { job: settled, created: true };
}
