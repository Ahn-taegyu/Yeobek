import { z } from "zod";

export const AI_LIMITS = { question: 500, answer: 600, evidenceCount: 12, evidenceChars: 8000 } as const;
export const codepoints = (value: string) => Array.from(value).length;
const visible = (value: string) => /[^\s\p{Cc}\p{Cf}\p{Default_Ignorable_Code_Point}]/u.test(value);
const boundedText = (max: number) => z.string().min(1).refine(value =>
  codepoints(value) <= max && visible(value) && !value.includes("\u0000"));
const id = z.uuid();
const version = z.number().int().positive().max(2147483647);

export const chatRequestSchema = z.strictObject({
  requestId: id,
  exhibitionId: id,
  artworkId: id.nullable(),
  question: boundedText(AI_LIMITS.question),
  contextSequence: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  inputMode: z.enum(["text", "voice"]),
  outputMode: z.enum(["text", "voice"]),
});
export type ChatRequest = z.infer<typeof chatRequestSchema>;
export const answerSchema = z.strictObject({
  answer: boundedText(AI_LIMITS.answer),
  citations: z.array(id).max(AI_LIMITS.evidenceCount),
  outcome: z.enum(["answered", "clarify", "insufficient_evidence"]),
});
export type ModelAnswer = z.infer<typeof answerSchema>;

// Provider schema is deliberately simple; local validation additionally checks
// codepoint budgets, citation membership and outcome/citation relationships.
export const answerJsonSchema = {
  name: "yeobek_docent_answer",
  definition: {
    type: "object", additionalProperties: false,
    properties: {
      answer: { type: "string" },
      citations: { type: "array", items: { type: "string" } },
      outcome: { type: "string", enum: ["answered", "clarify", "insufficient_evidence"] },
    },
    required: ["answer", "citations", "outcome"],
  },
};

export const evidenceSchema = z.strictObject({
  id, version, ownerId: id, exhibitionId: id, publicationId: id,
  artworkId: id.nullable(), scope: z.enum(["artist", "exhibition", "artwork"]),
  sourceLabel: boundedText(200), body: boundedText(AI_LIMITS.evidenceChars),
  contentHash: z.string().regex(/^[a-f0-9]{64}$/),
});
export type Evidence = z.infer<typeof evidenceSchema>;
export const publicationContextSchema = z.strictObject({
  ownerId: id, exhibitionId: id, artworkId: id, publicationId: id, version,
  number: z.number().int().min(1).max(9999), title: boundedText(100),
  evidence: z.array(evidenceSchema).max(100),
  narration: z.strictObject({ text: boundedText(AI_LIMITS.answer), citations: z.array(id).min(1).max(12) }).nullable(),
});
export type PublicationContext = z.infer<typeof publicationContextSchema>;
export type PublicationRef = Pick<PublicationContext, "exhibitionId" | "artworkId" | "publicationId" | "version">;
export type ArtworkSelector = { exhibitionId: string } & ({ artworkId: string } | { number: number });

/** Server capability, never constructed from a browser-supplied snapshot.
 * load must enforce tenant/current publication/source revocation BEFORE reading
 * evidence. isCurrent rechecks all gates, including common-source revocation.
 * No production DB adapter exists until the approval/publication workflow lands.
 */
export interface PublicationStore {
  load(selector: ArtworkSelector, signal?: AbortSignal): Promise<unknown | null>;
  isCurrent(ref: PublicationRef, signal?: AbortSignal): Promise<boolean>;
}

export type DocentReply = ModelAnswer & {
  requestId: string; contextSequence: number;
  inputMode: ChatRequest["inputMode"]; outputMode: ChatRequest["outputMode"];
  publication: PublicationRef | null;
  source: "approved_narration" | "generated" | "fixed";
  promptVersion: string;
};

/** Session ownership/expiry and the saved validated reply are checked by the
 * implementation. An HTTP speech endpoint must accept IDs, never arbitrary text.
 */
export interface SpeechSourceStore {
  loadAnswer(sessionId: string, answerId: string, signal?: AbortSignal): Promise<DocentReply | null>;
}
