import { z } from "zod";
import { boundedText } from "./chat";
import { interviewJob } from "./interview";
import { revision, uuid } from "./requests";

export const exhibitionInterviewMaxAnswer = 2000;
const question = z.strictObject({
  id: uuid,
  seq: z.number().int().min(1).max(100),
  question: boundedText(500),
  answer: boundedText(exhibitionInterviewMaxAnswer).nullable(),
  status: z.enum(["pending", "answered", "skipped"]),
  version: revision,
});
export const exhibitionInterviewResponse = z.strictObject({
  exhibitionId: uuid,
  requiredCount: z.number().int().positive(),
  batchSize: z.number().int().positive(),
  generating: z.boolean(),
  questions: z.array(question).max(100),
});
export const exhibitionInterviewGenerationResponse = z.strictObject({ job: interviewJob, interview: exhibitionInterviewResponse });
export const writeExhibitionInterviewAnswer = z.discriminatedUnion("action", [
  z.strictObject({ action: z.literal("save"), expectedVersion: revision,
    answer: z.string().trim().pipe(boundedText(exhibitionInterviewMaxAnswer)) }),
  z.strictObject({ action: z.literal("skip"), expectedVersion: revision }),
]);
export type ExhibitionInterview = z.infer<typeof exhibitionInterviewResponse>;
export type WriteExhibitionInterviewAnswer = z.infer<typeof writeExhibitionInterviewAnswer>;
