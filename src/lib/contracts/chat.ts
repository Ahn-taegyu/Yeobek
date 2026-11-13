import { z } from "zod";

import { AI_LIMITS } from "../policy";
export { AI_LIMITS } from "../policy";
export const codepoints = (value: string) => Array.from(value).length;
const visible = (value: string) => /[^\s\p{Cc}\p{Cf}\p{Default_Ignorable_Code_Point}]/u.test(value);
export const boundedText = (max: number) => z.string().min(1).refine(value =>
  codepoints(value) <= max && visible(value) && !value.includes("\u0000"));
const id = z.uuid();

export const chatRequestSchema = z.strictObject({
  requestId: id,
  exhibitionId: id,
  artworkId: id.nullable(),
  // Resolve legacy text using the raw intent presence BEFORE this default.
  intent: z.enum(["question", "narration"]).default("question"),
  artworkNumber: z.number().int().min(1).max(9999).optional(),
  question: boundedText(AI_LIMITS.question),
  contextSequence: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  inputMode: z.enum(["text", "voice"]),
  outputMode: z.enum(["text", "voice"]),
});
export type ChatRequest = z.infer<typeof chatRequestSchema>;
export type ChatRequestInput = z.input<typeof chatRequestSchema>;
