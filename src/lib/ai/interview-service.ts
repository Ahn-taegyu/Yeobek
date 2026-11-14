import "server-only";
import { z } from "zod";
import { rpc, type DbClient } from "../api/db";
import { ApiError } from "../api/errors";
import { decodeDatabase } from "../api/publication";
import { boundedText, codepoints } from "../contracts/chat";
import { interviewGenerationResponse, interviewJob, interviewMaxQuestions, interviewQuestionText, interviewResponse, type WriteInterviewAnswer } from "../contracts/interview";
import { materialByteLimits } from "../contracts/materials";
import { revision, uuid } from "../contracts/requests";
import { downloadMaterialForRead } from "../storage/materials";
import { createWorkerSupabase } from "../supabase/worker";
import { abortable, createDeadline } from "./deadline";
import { AiError } from "./errors";
import { normalizeAiOutcome } from "./outcome";
import { startPlaybook } from "./playbook";
import { playbookPrompt } from "./plugin";
import type { AiProviderTrace } from "./providers/types";
import { isMockMode } from "./routing";
import { createConfiguredTextProvider } from "./runtime";

const reservation = z.strictObject({
  job: interviewJob,
  claimed: z.boolean(),
  context: z.object({
    image: z.strictObject({
      id: uuid,
      version: revision,
      storageKey: z.string().min(1),
      contentType: z.enum(["image/jpeg", "image/png", "image/webp"]),
      byteSize: z.number().int().min(1).max(materialByteLimits.image),
      contentHash: z.string().regex(/^[a-f0-9]{64}$/),
    }),
    sources: z.array(z.object({ text: boundedText(8000) })).max(12),
    priorQuestions: z.array(interviewQuestionText).max(interviewMaxQuestions),
    maxQuestions: z.number().int().min(1).max(interviewMaxQuestions),
  }).nullable(),
}).refine(value => value.claimed === (value.context !== null));

const output = z.strictObject({ questions: z.array(interviewQuestionText).max(interviewMaxQuestions) });
const schema = {
  name: "yeobek_artwork_interview",
  definition: {
    type: "object", additionalProperties: false, required: ["questions"],
    properties: { questions: { type: "array", items: { type: "string" } } },
  },
};

export async function listInterview(db: DbClient, artworkId: string) {
  return decodeDatabase(interviewResponse, await rpc(db, "list_artwork_interview", { p_artwork_id: artworkId }));
}

export async function updateInterview(db: DbClient, artworkId: string, questionId: string, input: WriteInterviewAnswer) {
  return decodeDatabase(interviewResponse, await rpc(db, "save_artwork_interview_answer", {
    p_artwork_id: artworkId, p_question_id: questionId, p_expected_version: input.expectedVersion,
    p_answer: input.action === "save" ? input.answer : null,
    p_skip: input.action === "skip", p_approve: input.action === "approve",
  }));
}

export async function generateInterview(db: DbClient, ownerId: string, artworkId: string, requestId: string, signal: AbortSignal) {
  const worker = createWorkerSupabase({ timeoutMs: 5000 });
  const mock = isMockMode();
  const flow = startPlaybook("artwork-interview");
  const { job, context } = await flow.step("job.reserve", async () => decodeDatabase(reservation, await rpc(
    worker, "reserve_artwork_interview", { p_owner: ownerId, p_artwork_id: artworkId, p_request_id: requestId, p_mock: mock }, signal,
  )));
  if (!context) {
    for (const phase of ["photo.read", "model.generate", "output.validate", "job.complete"] as const) flow.skip(phase, "job_replay");
    flow.finish();
    return { job, questions: (await listInterview(db, artworkId)).questions };
  }
  const deadline = createDeadline(45_000, signal);
  const usage: AiProviderTrace[] = [];
  let result: { status: "succeeded"; questions: string[]; mock: boolean } |
    { status: "failed" | "cancelled"; resultCode: string };
  try {
    const { image, priorQuestions, maxQuestions } = context;
    const sources = context.sources.map(({ text }) => text);
    const data = await flow.step("photo.read", () => abortable(deadline.signal, () =>
      downloadMaterialForRead(worker, image.storageKey, image.byteSize, image.contentHash)));
    const response = await flow.step("model.generate", () => abortable(deadline.signal, activeSignal =>
      createConfiguredTextProvider("material").generate({
        system: playbookPrompt("artwork-interview"),
        input: JSON.stringify({ sources, priorQuestions, maxQuestions }),
        schema, media: { data, contentType: image.contentType }, signal: activeSignal, maxOutputTokens: 2048,
      })));
    usage.push(response.trace);
    const questions = await flow.step("output.validate", () => {
      deadline.signal.throwIfAborted();
      const parsed = output.safeParse(response.output);
      if (!parsed.success || Boolean(response.trace.mock) !== mock || parsed.data.questions.length > maxQuestions ||
          sources.reduce((sum, text) => sum + codepoints(text), 0) > 8000) throw new AiError("invalid_response");
      const normalize = (text: string) => text.normalize("NFKC").toLowerCase().replace(/[\p{White_Space}\p{P}]/gu, "");
      const seen = new Set(priorQuestions.map(normalize));
      return parsed.data.questions.map(text => {
        const key = normalize(text);
        if (!key || seen.has(key)) throw new AiError("invalid_response");
        seen.add(key);
        return text.trim();
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
  let completed = { job, questions: [] as z.infer<typeof interviewGenerationResponse>["questions"] };
  await flow.settleJob(async steps => {
    completed = decodeDatabase(interviewGenerationResponse, await rpc(worker, "complete_artwork_interview", {
      p_owner: ownerId, p_job_id: job.id, p_attempt: job.attempt, p_result: { ...result, steps, usage },
    }));
  });
  return completed;
}
