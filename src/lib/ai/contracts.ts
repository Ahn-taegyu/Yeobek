import { z } from "zod";
import type { PlaybookStepRecord } from "./playbook";

import { AI_LIMITS, boundedText, type ChatRequest } from "../contracts/chat";

export { AI_LIMITS, chatRequestSchema, codepoints } from "../contracts/chat";
export type { ChatRequest, ChatRequestInput } from "../contracts/chat";

const id = z.uuid();
const version = z.number().int().positive().max(2147483647);

export const answerSchema = z.strictObject({
  answer: boundedText(AI_LIMITS.answer),
  citations: z.array(id).max(AI_LIMITS.evidenceCount),
  outcome: z.enum(["answered", "clarify", "insufficient_evidence"]),
});
export type ModelAnswer = z.infer<typeof answerSchema>;
export const narrationDraftSchema = answerSchema.extend({ answer: boundedText(AI_LIMITS.narration), followUpQuestions: z.array(boundedText(200)).max(3).optional() });
export type NarrationDraft = z.infer<typeof narrationDraftSchema>;

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
export const narrationDraftJsonSchema = { ...answerJsonSchema, name: "yeobek_narration_draft" };
export const narrationDraftWithQuestionsJsonSchema = {
  name: "yeobek_narration_draft_with_questions",
  definition: {
    ...answerJsonSchema.definition,
    properties: {
      ...answerJsonSchema.definition.properties,
      followUpQuestions: { type: "array", maxItems: 3, items: { type: "string", maxLength: 200 } },
    },
    required: [...answerJsonSchema.definition.required, "followUpQuestions"],
  },
};


export const evidenceSchema = z.strictObject({
  id, version, ownerId: id, exhibitionId: id, publicationId: id,
  artworkId: id.nullable(), scope: z.enum(["artist", "exhibition", "artwork"]),
  sourceLabel: boundedText(200), body: boundedText(AI_LIMITS.evidenceChars),
  contentHash: z.string().regex(/^[a-f0-9]{64}$/),
});
export type Evidence = z.infer<typeof evidenceSchema>;
export const approvedNarrationSchema = z.strictObject({
  text: boundedText(AI_LIMITS.narration), citations: z.array(id).min(1).max(AI_LIMITS.evidenceCount),
});
export const publicationContextSchema = z.strictObject({
  ownerId: id, exhibitionId: id, artworkId: id, publicationId: id, version,
  number: z.number().int().min(1).max(9999), title: boundedText(100),
  evidence: z.array(evidenceSchema).max(100),
  narration: approvedNarrationSchema.nullable(),
});
export type PublicationContext = z.infer<typeof publicationContextSchema>;
export type PublicationRef = Pick<PublicationContext, "exhibitionId" | "artworkId" | "publicationId" | "version">;
export type ArtworkSelector = { exhibitionId: string } & ({ artworkId: string } | { number: number });

/** Server capability, never constructed from a browser-supplied snapshot.
 * load must enforce tenant/current publication/source revocation BEFORE reading
 * evidence. isCurrent rechecks all gates, including common-source revocation.
 * The publisher must persist approved citation IDs and validate each pinned
 * source's ownership/version/hash. The current SQL JSON-array check is not this
 * contract; never invent narration citations by citing every evidence row.
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
  /** Internal execution metadata: omit from the future visitor HTTP response. */
  steps: readonly PlaybookStepRecord[];
};

/** Session ownership/expiry and the saved validated reply (including trusted
 * source, outcome and citations) are checked by the implementation. An HTTP
 * speech endpoint must accept IDs, never arbitrary text/source assertions.
 */
export interface SpeechSourceStore {
  loadAnswer(sessionId: string, answerId: string, signal?: AbortSignal): Promise<Omit<DocentReply, "steps"> | null>;
}
