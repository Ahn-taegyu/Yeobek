import "server-only";
import { mentionedArtworks, normalizeArtworkTitle } from "./artwork-mentions";
import { z } from "zod";
import { answerJsonSchema, answerSchema, narrationDraftSchema, chatRequestSchema, type DocentReply, type ModelAnswer, type NarrationDraft, type PublicationContext,
  type ArtworkSelector, type PublicationRef, type PublicationStore, type SpeechSourceStore } from "./contracts";
import { assertNotCancelled, HarnessError, resolveIntent, mentionedNumbers, selectEvidence, textHash, validateContext } from "./context";
import { DOCENT_SYSTEM_PROMPT, PROMPT_VERSION } from "./prompts";
import type { AiSpeechProvider, AiTextProvider } from "./providers/types";
import { capabilitiesFor, DOCENT_COPY } from "./plugin";
import { PlaybookOrderError, startPlaybook } from "./playbook";
import type { VisitorLifecycle } from "./visitor-lifecycle";

const reference = (context: PublicationContext): PublicationRef => ({ exhibitionId: context.exhibitionId,
  artworkId: context.artworkId, publicationId: context.publicationId, version: context.version });

function validateCitedText(output: unknown, allowedIds: string[], schema: typeof answerSchema | typeof narrationDraftSchema) {
  const parsed = schema.safeParse(output);
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
export function validateAnswer(output: unknown, allowedIds: string[]): ModelAnswer {
  return validateCitedText(output, allowedIds, answerSchema);
}
export function validateNarrationDraft(output: unknown, allowedIds: string[]): NarrationDraft {
  return validateCitedText(output, allowedIds, narrationDraftSchema);
}

async function assertCurrent(recheck: PublicationStore["isCurrent"], ref: PublicationRef, signal?: AbortSignal) {
  assertNotCancelled(signal);
  if (!await recheck(ref, signal)) throw new HarnessError("publication_unavailable");
  assertNotCancelled(signal);
}

/** One bounded text call. HTTP must bind visitor persistence; isolated model
 * evaluations may leave it unbound and record the skipped lifecycle explicitly. */
export function createDocentHarness(deps: { publications: PublicationStore; text: AiTextProvider; visitor?: VisitorLifecycle; exhibitionScopeChat?: boolean }) {
  const caps = capabilitiesFor("visitor-answer", { publications: deps.publications, visitor: deps.visitor });
  return {
    async answer(input: unknown, signal?: AbortSignal): Promise<DocentReply> {
      const flow = startPlaybook("visitor-answer");
      try {
        const { request, explicitIntent } = await flow.step("request.validate", () => {
          const parsed = chatRequestSchema.safeParse(input);
          if (!parsed.success) throw new HarnessError("invalid_request");
          assertNotCancelled(signal);
          // Use the validated value, preserving raw presence before its default.
          const explicitIntent = Object.hasOwn(input as object, "intent") && (input as { intent?: unknown }).intent !== undefined
            ? parsed.data.intent : undefined;
          return { request: parsed.data, explicitIntent };
        });
        if (caps["request.reserve"]) await flow.step("request.reserve", () => caps["request.reserve"]!(request));
        else flow.skip("request.reserve", "request_unbound");
        const base = { requestId: request.requestId, contextSequence: request.contextSequence,
          inputMode: request.inputMode, outputMode: request.outputMode, promptVersion: PROMPT_VERSION };
        const fixed = (answer: string, outcome: "clarify" | "insufficient_evidence", publication: PublicationRef | null = null): Omit<DocentReply, "steps"> =>
          ({ ...base, answer, outcome, citations: [], publication, source: "fixed" });
        const persist = async (reply: Omit<DocentReply, "steps">): Promise<DocentReply> => {
          if (caps["answer.store"]) await flow.step("answer.store", () => caps["answer.store"]!(reply));
          else flow.skip("answer.store", "request_unbound");
          if (caps["gap.record"] && reply.publication?.artworkId && reply.outcome === "insufficient_evidence") {
            await flow.step("gap.record", () => caps["gap.record"]!(request.question, reply));
          } else flow.skip("gap.record", "gap_not_applicable");
          return { ...reply, steps: flow.finish() };
        };
        const resolved = await flow.step("intent.resolve", async () => {
          assertNotCancelled(signal);
          const intent = resolveIntent({ question: request.question, intent: explicitIntent });
          const { numbers, invalid } = mentionedNumbers(request.question);
          const titles = caps["publication.list"] ? mentionedArtworks(request.question,
            await caps["publication.list"](request.exhibitionId, signal)) : { matches: [], explicitUnknown: false };
          const named = titles.matches.length === 1 ? titles.matches[0] : undefined;
          const ambiguous = invalid || numbers.length > 1 || titles.matches.length > 1 || titles.explicitUnknown ||
            (named !== undefined && (request.artworkNumber ?? numbers[0]) !== undefined && named.number !== (request.artworkNumber ?? numbers[0])) ||
            (request.artworkNumber !== undefined && numbers.length === 1 && numbers[0] !== request.artworkNumber);
          const number = request.artworkNumber ?? numbers[0];
          const selector: ArtworkSelector | null = ambiguous ? null : number !== undefined ? { exhibitionId: request.exhibitionId, number }
            : named ? { exhibitionId: request.exhibitionId, artworkId: named.id }
            : request.artworkId ? { exhibitionId: request.exhibitionId, artworkId: request.artworkId }
            : deps.exhibitionScopeChat && intent === "question" ? { exhibitionId: request.exhibitionId, artworkId: null } : null;
          return { intent, selector, named, message: ambiguous ? DOCENT_COPY.chooseOne : DOCENT_COPY.chooseArtwork };
        });
        if (!resolved.selector) {
          for (const id of ["publication.read", "publication.recheck", "evidence.select", "model.generate", "output.validate", "publication.recheck.final"] as const) flow.skip(id, "selection_required");
          return await persist(fixed(resolved.message, "clarify"));
        }
        const selector = resolved.selector;
        const context = await flow.step("publication.read", async () => {
          assertNotCancelled(signal);
          const loaded = await caps["publication.read"](selector, signal);
          assertNotCancelled(signal);
          if (!loaded) {
            if ("number" in selector) return null;
            throw new HarnessError("publication_unavailable");
          }
          const context = validateContext(loaded, selector);
          if (resolved.named && (context.artworkId !== resolved.named.id ||
              normalizeArtworkTitle(context.title) !== normalizeArtworkTitle(resolved.named.title))) return null;
          return context;
        });
        if (!context) {
          for (const id of ["publication.recheck", "evidence.select", "model.generate", "output.validate", "publication.recheck.final"] as const) flow.skip(id, "number_unavailable");
          // A number that was published here before is a work on the wall whose online guide
          // is paused; only a never-published number is reported as not found.
          const paused = "number" in selector && !resolved.named && caps["publication.history"]
            ? await caps["publication.history"](selector.exhibitionId, selector.number, signal) : false;
          return await persist(fixed(paused ? DOCENT_COPY.artworkPaused : DOCENT_COPY.artworkUnavailable, "clarify"));
        }
        const ref = reference(context);
        await flow.step("publication.recheck", () => assertCurrent(caps["publication.recheck"], ref, signal));
        const finish = async (result: Omit<DocentReply, "steps">): Promise<DocentReply> => {
          await flow.step("publication.recheck.final", () => assertCurrent(caps["publication.recheck"], ref, signal));
          return persist(result);
        };
        if (resolved.intent === "narration") {
          for (const id of ["evidence.select", "model.generate", "output.validate"] as const) flow.skip(id, "approved_narration");
          if (!context.narration) return await finish(fixed(DOCENT_COPY.noNarration, "insufficient_evidence", ref));
          return await finish({ ...base, publication: ref, source: "approved_narration", outcome: "answered",
            answer: context.narration.text, citations: [...context.narration.citations] });
        }
        // No image/pointing capability. With no verbal location, do not invent what
        // the visitor is pointing to. Rich prior conversation resolution is deferred.
        if (/^(?:이\s*작품(?:의)?\s*)?이\s*부분(?:에|은|이|에서)?\s*(?:그려진\s*(?:건|것은)\s*)?(?:뭐야|무엇인가요|뭔가요|설명해\s*줘)[.!?。]*$/u.test(request.question.trim())) {
          for (const id of ["evidence.select", "model.generate", "output.validate"] as const) flow.skip(id, "verbal_location_required");
          return await finish(fixed(DOCENT_COPY.point, "clarify", ref));
        }
        const evidence = await flow.step("evidence.select", () => selectEvidence(context.evidence, request.question));
        if (!evidence.length) {
          flow.skip("model.generate", "no_evidence"); flow.skip("output.validate", "no_evidence");
          return await finish(fixed(DOCENT_COPY.insufficient, "insufficient_evidence", ref));
        }
        const generated = await flow.step("model.generate", async () => {
          assertNotCancelled(signal);
          const result = await deps.text.generate({ system: DOCENT_SYSTEM_PROMPT, schema: answerJsonSchema, signal,
            input: JSON.stringify({ question: request.question,
              ...(context.artworkId === null ? { exhibition: { title: context.title } }
                : { artwork: { number: context.number, title: context.title } }),
              evidence: evidence.map(item => ({ id: item.id, version: item.version, sourceLabel: item.sourceLabel, body: item.body })) }),
          });
          assertNotCancelled(signal);
          return result;
        });
        const answer = await flow.step("output.validate", () => validateAnswer(generated.output, evidence.map(item => item.id)));
        if (answer.outcome !== "answered") return await finish(fixed(
          answer.outcome === "clarify" ? DOCENT_COPY.clarify : DOCENT_COPY.insufficient, answer.outcome, ref));
        // Returning only validated fields keeps provider responses, prompts and keys
        // out of the public answer. Provider usage is available at the adapter port.
        return await finish({ ...base, ...answer, publication: ref, source: "generated" });
      } catch (error) {
        if (!(error instanceof PlaybookOrderError)) flow.fail(error);
        throw error;
      }
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
  const caps = capabilitiesFor("visitor-answer", { publications: deps.publications });
  const parsed = z.strictObject({ sessionId: z.union([z.uuid(), z.string().regex(/^[a-f0-9]{64}$/)]), answerId: z.uuid() }).safeParse(input);
  if (!parsed.success) throw new HarnessError("invalid_request");
  assertNotCancelled(signal);
  const reply = await deps.answers.loadAnswer(parsed.data.sessionId, parsed.data.answerId, signal);
  assertNotCancelled(signal);
  if (!reply) throw new HarnessError("answer_unavailable");
  if (!reply.publication) {
    // Before selecting a work, only these server-owned navigation messages may
    // be spoken. The store rechecks session TTL and the exhibition public gate.
    const navigation: readonly string[] = [DOCENT_COPY.chooseOne, DOCENT_COPY.chooseArtwork, DOCENT_COPY.artworkUnavailable, DOCENT_COPY.artworkPaused];
    if (reply.source !== "fixed" || reply.outcome !== "clarify" || reply.citations.length || !navigation.includes(reply.answer)) {
      throw new HarnessError("invalid_output");
    }
    const audio = await deps.speech.synthesize({ text: reply.answer, signal });
    assertNotCancelled(signal);
    const current = await deps.answers.loadAnswer(parsed.data.sessionId, parsed.data.answerId, signal);
    assertNotCancelled(signal);
    if (!current || current.publication || current.source !== "fixed" || current.outcome !== "clarify" ||
      current.citations.length || current.answer !== reply.answer) throw new HarnessError("answer_unavailable");
    return { ...audio, textHash: textHash(reply.answer), publication: null };
  }
  // Provenance comes from the trusted saved record, not from request parameters.
  await assertCurrent(caps["publication.recheck"], reply.publication, signal);
  if (reply.source === "approved_narration") {
    const selector = { exhibitionId: reply.publication.exhibitionId, artworkId: reply.publication.artworkId };
    const loaded = await caps["publication.read"](selector, signal);
    assertNotCancelled(signal);
    if (!loaded) throw new HarnessError("publication_unavailable");
    const context = validateContext(loaded, selector);
    const approved = context.narration;
    // An approved source label alone cannot grant the larger text budget or
    // bypass generated-text guards. Match the current immutable publication.
    if (!approved || reply.outcome !== "answered" || context.publicationId !== reply.publication.publicationId ||
      context.version !== reply.publication.version || reply.answer !== approved.text ||
      !Array.isArray(reply.citations) || reply.citations.length !== approved.citations.length ||
      reply.citations.some((id, index) => id !== approved.citations[index])) throw new HarnessError("invalid_output");
  } else if (reply.source === "generated" || reply.source === "fixed") {
    validateAnswer({ answer: reply.answer, citations: reply.citations, outcome: reply.outcome }, reply.citations);
  } else {
    throw new HarnessError("invalid_output");
  }
  const audio = await deps.speech.synthesize({ text: reply.answer, signal });
  await assertCurrent(caps["publication.recheck"], reply.publication, signal);
  return { ...audio, textHash: textHash(reply.answer), publication: reply.publication };
}
