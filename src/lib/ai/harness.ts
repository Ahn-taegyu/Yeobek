import "server-only";
import { z } from "zod";
import { answerJsonSchema, answerSchema, chatRequestSchema, type DocentReply, type ModelAnswer, type PublicationContext,
  type PublicationRef, type PublicationStore, type SpeechSourceStore } from "./contracts";
import { assertNotCancelled, HarnessError, isNarrationRequest, mentionedNumbers, selectEvidence, textHash, validateContext } from "./context";
import { DOCENT_SYSTEM_PROMPT, PROMPT_VERSION } from "./prompts";
import type { AiSpeechProvider, AiTextProvider } from "./providers/types";
import { assertPluginTool, DOCENT_COPY } from "./plugin";

const reference = (context: PublicationContext): PublicationRef => ({ exhibitionId: context.exhibitionId,
  artworkId: context.artworkId, publicationId: context.publicationId, version: context.version });

export function validateAnswer(output: unknown, allowedIds: string[]): ModelAnswer {
  const parsed = answerSchema.safeParse(output);
  if (!parsed.success) throw new HarnessError("invalid_output");
  const answer = parsed.data;
  if (/(?:https?:\/\/|www\.|data:|file:\/\/)/iu.test(answer.answer) ||
    /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/iu.test(answer.answer) ||
    new Set(answer.citations).size !== answer.citations.length ||
    answer.citations.some(id => !allowedIds.includes(id)) ||
    (answer.outcome === "answered" ? answer.citations.length === 0 : answer.citations.length !== 0)) {
    throw new HarnessError("invalid_output");
  }
  return answer;
}

async function assertCurrent(store: PublicationStore, ref: PublicationRef, signal?: AbortSignal) {
  assertPluginTool("visitor-answer", "publication.recheck");
  assertNotCancelled(signal);
  if (!await store.isCurrent(ref, signal)) throw new HarnessError("publication_unavailable");
  assertNotCancelled(signal);
}

/** One bounded text call, with no tool loop or automatic repair/retry.
 * The caller must reserve a persisted request/budget before invoking this module.
 * No public route currently exposes this function.
 */
export function createDocentHarness(deps: { publications: PublicationStore; text: AiTextProvider }) {
  return {
    async answer(input: unknown, signal?: AbortSignal): Promise<DocentReply> {
      const parsed = chatRequestSchema.safeParse(input);
      if (!parsed.success) throw new HarnessError("invalid_request");
      const request = parsed.data;
      assertNotCancelled(signal);
      const base = { requestId: request.requestId, contextSequence: request.contextSequence,
        inputMode: request.inputMode, outputMode: request.outputMode, promptVersion: PROMPT_VERSION };
      const fixed = (answer: string, outcome: "clarify" | "insufficient_evidence", publication: PublicationRef | null = null): DocentReply =>
        ({ ...base, answer, outcome, citations: [], publication, source: "fixed" });
      const { numbers, invalid } = mentionedNumbers(request.question);
      if (invalid || numbers.length > 1) return fixed(DOCENT_COPY.chooseOne, "clarify");
      const selector = numbers.length ? { exhibitionId: request.exhibitionId, number: numbers[0] }
        : request.artworkId ? { exhibitionId: request.exhibitionId, artworkId: request.artworkId } : null;
      if (!selector) return fixed(DOCENT_COPY.chooseArtwork, "clarify");
      assertPluginTool("visitor-answer", "publication.read");
      const loaded = await deps.publications.load(selector, signal);
      assertNotCancelled(signal);
      if (!loaded) throw new HarnessError("publication_unavailable");
      const context = validateContext(loaded, selector);
      const ref = reference(context);
      await assertCurrent(deps.publications, ref, signal);
      const finish = async (result: DocentReply) => {
        await assertCurrent(deps.publications, ref, signal);
        return result;
      };
      if (isNarrationRequest(request.question)) {
        if (!context.narration) return finish(fixed(DOCENT_COPY.noNarration, "insufficient_evidence", ref));
        return finish({ ...base, publication: ref, source: "approved_narration", outcome: "answered",
          answer: context.narration.text, citations: [...context.narration.citations] });
      }
      // No image/pointing capability. With no verbal location, do not invent what
      // the visitor is pointing to. Rich prior conversation resolution is deferred.
      if (/^(?:이\s*작품(?:의)?\s*)?이\s*부분(?:에|은|이|에서)?\s*(?:그려진\s*(?:건|것은)\s*)?(?:뭐야|무엇인가요|뭔가요|설명해\s*줘)[.!?。]*$/u.test(request.question.trim())) {
        return finish(fixed(DOCENT_COPY.point, "clarify", ref));
      }
      const evidence = selectEvidence(context.evidence, request.question);
      if (!evidence.length) return finish(fixed(DOCENT_COPY.insufficient, "insufficient_evidence", ref));
      const generated = await deps.text.generate({ system: DOCENT_SYSTEM_PROMPT, schema: answerJsonSchema, signal,
        input: JSON.stringify({ question: request.question, artwork: { number: context.number, title: context.title },
          evidence: evidence.map(item => ({ id: item.id, version: item.version, sourceLabel: item.sourceLabel, body: item.body })) }),
      });
      assertNotCancelled(signal);
      const answer = validateAnswer(generated.output, evidence.map(item => item.id));
      if (answer.outcome !== "answered") return finish(fixed(
        answer.outcome === "clarify" ? DOCENT_COPY.clarify : DOCENT_COPY.insufficient, answer.outcome, ref));
      // Returning only validated fields keeps provider responses, prompts and keys
      // out of the public answer. Provider usage is available at the adapter port.
      return finish({ ...base, ...answer, publication: ref, source: "generated" });
    },
  };
}

/** Only a session-owned server record is spoken; no free-text speech proxy.
 * A failed speech request can be repeated without regenerating the text answer.
 * The HTTP caller must persist/serve audio with version checks and no-store.
 */
export async function speakVerifiedReply(input: { sessionId: string; answerId: string }, deps: {
  answers: SpeechSourceStore; publications: PublicationStore; speech: AiSpeechProvider;
}, signal?: AbortSignal) {
  const parsed = z.strictObject({ sessionId: z.uuid(), answerId: z.uuid() }).safeParse(input);
  if (!parsed.success) throw new HarnessError("invalid_request");
  assertNotCancelled(signal);
  const reply = await deps.answers.loadAnswer(parsed.data.sessionId, parsed.data.answerId, signal);
  assertNotCancelled(signal);
  if (!reply?.publication) throw new HarnessError("answer_unavailable");
  // Provenance comes from the trusted saved record, not from request parameters.
  validateAnswer({ answer: reply.answer, citations: reply.citations, outcome: reply.outcome }, reply.citations);
  await assertCurrent(deps.publications, reply.publication, signal);
  const audio = await deps.speech.synthesize({ text: reply.answer, signal });
  await assertCurrent(deps.publications, reply.publication, signal);
  return { ...audio, textHash: textHash(reply.answer), publication: reply.publication };
}
