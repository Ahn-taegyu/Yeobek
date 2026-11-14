import "server-only";
import { z } from "zod";
import { rpc, type DbClient } from "../api/db";
import { ApiError } from "../api/errors";
import { decodeDatabase } from "../api/publication";
import { boundedText } from "../contracts/chat";
import { exhibitionInterviewGenerationResponse, exhibitionInterviewResponse, type WriteExhibitionInterviewAnswer } from "../contracts/exhibition-interview";
import { interviewJob } from "../contracts/interview";
import { createWorkerSupabase } from "../supabase/worker";
import { abortable, createDeadline } from "./deadline";
import { AiError } from "./errors";
import { normalizeAiOutcome } from "./outcome";
import { startPlaybook } from "./playbook";
import { playbookPrompt } from "./plugin";
import type { AiProviderTrace } from "./providers/types";
import { isMockMode } from "./routing";
import { createConfiguredTextProvider } from "./runtime";

const questionText = boundedText(500);
const reservation = z.strictObject({
  job: interviewJob,
  claimed: z.boolean(),
  context: z.object({
    sources: z.array(z.object({ text: z.string() })).max(24),
    artworks: z.array(z.object({ number: z.number().int(), title: z.string() })).max(200),
    priorQuestions: z.array(z.object({ question: questionText, answer: z.string().nullable() })).max(100),
    maxQuestions: z.number().int().min(1).max(10),
  }).nullable(),
}).refine(value => value.claimed === (value.context !== null));

const output = z.strictObject({ questions: z.array(questionText).max(10) });
const schema = {
  name: "yeobek_exhibition_interview",
  definition: {
    type: "object", additionalProperties: false, required: ["questions"],
    properties: { questions: { type: "array", items: { type: "string" } } },
  },
};

export async function listExhibitionInterview(db: DbClient, exhibitionId: string) {
  return decodeDatabase(exhibitionInterviewResponse, await rpc(db, "list_exhibition_interview", { p_exhibition_id: exhibitionId }));
}

export async function answerExhibitionInterview(db: DbClient, exhibitionId: string, questionId: string, input: WriteExhibitionInterviewAnswer) {
  return decodeDatabase(exhibitionInterviewResponse, await rpc(db, "save_exhibition_interview_answer", {
    p_exhibition_id: exhibitionId, p_question_id: questionId, p_expected_version: input.expectedVersion,
    p_answer: input.action === "save" ? input.answer : null, p_skip: input.action === "skip",
  }));
}

/** Generates the first 10 questions, or the next 5 when the artist continues past the answered ones. */
export async function generateExhibitionInterview(db: DbClient, ownerId: string, exhibitionId: string, requestId: string, signal: AbortSignal) {
  await listExhibitionInterview(db, exhibitionId); // ownership check through the artist session
  const worker = createWorkerSupabase({ timeoutMs: 5000 });
  const mock = isMockMode();
  const flow = startPlaybook("exhibition-interview");
  const { job, context } = await flow.step("job.reserve", async () => decodeDatabase(reservation, await rpc(
    worker, "reserve_exhibition_interview", { p_owner: ownerId, p_exhibition_id: exhibitionId, p_request_id: requestId, p_mock: mock }, signal,
  )));
  if (!context) {
    for (const phase of ["model.generate", "output.validate", "job.complete"] as const) flow.skip(phase, "job_replay");
    flow.finish();
    return { job, interview: await listExhibitionInterview(db, exhibitionId) };
  }
  const deadline = createDeadline(45_000, signal);
  const usage: AiProviderTrace[] = [];
  let result: { status: "succeeded"; questions: string[]; mock: boolean } | { status: "failed" | "cancelled"; resultCode: string };
  try {
    const response = await flow.step("model.generate", () => abortable(deadline.signal, activeSignal =>
      createConfiguredTextProvider("qa").generate({
        system: playbookPrompt("exhibition-interview"),
        input: JSON.stringify(context), schema, signal: activeSignal, maxOutputTokens: 2048,
      })));
    usage.push(response.trace);
    const questions = await flow.step("output.validate", () => {
      deadline.signal.throwIfAborted();
      const parsed = output.safeParse(response.output);
      if (!parsed.success || Boolean(response.trace.mock) !== mock || parsed.data.questions.length > context.maxQuestions) {
        throw new AiError("invalid_response");
      }
      const normalize = (text: string) => text.normalize("NFKC").toLowerCase().replace(/[\p{White_Space}\p{P}]/gu, "");
      const seen = new Set(context.priorQuestions.map(item => normalize(item.question)));
      return parsed.data.questions.flatMap(text => {
        const key = normalize(text);
        if (!key || seen.has(key)) return []; // drop repeats instead of failing the whole batch
        seen.add(key);
        return [text.trim()];
      });
    });
    result = { status: "succeeded", questions, mock };
  } catch (error) {
    const failure = deadline.timedOut() ? new AiError("timeout") : signal.aborted ? new AiError("cancelled") : error;
    const { code } = failure instanceof ApiError ? failure : normalizeAiOutcome(failure);
    result = { status: signal.aborted ? "cancelled" : "failed", resultCode: code };
  } finally {
    deadline.dispose();
  }
  let completed: z.infer<typeof exhibitionInterviewGenerationResponse> | undefined;
  await flow.settleJob(async steps => {
    completed = decodeDatabase(exhibitionInterviewGenerationResponse, await rpc(worker, "complete_exhibition_interview", {
      p_owner: ownerId, p_job_id: job.id, p_attempt: job.attempt, p_result: { ...result, steps, usage },
    }));
  });
  return completed ?? { job, interview: await listExhibitionInterview(db, exhibitionId) };
}
