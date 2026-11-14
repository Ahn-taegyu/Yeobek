import { z } from "zod";
import { boundedText } from "./chat";
import { revision, uuid } from "./requests";

export const interviewMaxQuestions = 5;
export const interviewMaxAnswer = 2000;
export const interviewQuestionText = boundedText(500);
const question = z.strictObject({
  id: uuid,
  slot: z.number().int().min(1).max(interviewMaxQuestions),
  question: interviewQuestionText,
  answer: boundedText(interviewMaxAnswer).nullable(),
  status: z.enum(["pending", "answered", "skipped", "approved"]),
  version: revision,
  evidenceId: uuid.nullable(),
});
export const interviewQuestions = z.array(question).max(interviewMaxQuestions);
export const interviewResponse = z.strictObject({
  exhibitionId: uuid,
  artworkTitle: z.string(),
  imageReady: z.boolean(),
  questions: interviewQuestions,
});
export const interviewJob = z.object({
  id: uuid,
  attempt: revision,
  status: z.enum(["running", "succeeded", "failed", "cancelled", "abstained"]),
  resultCode: z.string().nullable(),
});
export const interviewGenerationResponse = z.strictObject({ job: interviewJob, questions: interviewQuestions });
export const startInterview = z.strictObject({ requestId: uuid });
export const writeInterviewAnswer = z.discriminatedUnion("action", [
  z.strictObject({ action: z.literal("save"), expectedVersion: revision, answer: z.string().trim().pipe(boundedText(interviewMaxAnswer)) }),
  z.strictObject({ action: z.literal("skip"), expectedVersion: revision }),
  z.strictObject({ action: z.literal("approve"), expectedVersion: revision }),
]);
export type Interview = z.infer<typeof interviewResponse>;
export type WriteInterviewAnswer = z.infer<typeof writeInterviewAnswer>;
