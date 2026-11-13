import "server-only";
import type { PublicationStore, SpeechSourceStore } from "./contracts";
import { createDocentHarness, speakVerifiedReply } from "./harness";
import { AiError } from "./errors";
import { createOpenAiSpeechProvider, createOpenAiTextProvider, createOpenAiTranscriptionProvider } from "./providers/openai";
import { createLinerTextProvider } from "./providers/liner";
import { createTypecastSpeechProvider } from "./providers/typecast";
import type { AiSpeechProvider } from "./providers/types";
import { createArtistKnowledgeHarness, type ArtistKnowledgeStore } from "./artist-knowledge";
import { createNarrationHarness } from "./narration";
import { getOpenAiJudgeConfig } from "./config";

export function createConfiguredSpeechProvider(): AiSpeechProvider {
  const selection = process.env.AI_TTS_PROVIDER?.trim() || "typecast";
  if (selection === "typecast") return createTypecastSpeechProvider();
  if (selection === "openai") return createOpenAiSpeechProvider();
  throw new AiError("not_configured");
}

/** Composition for future authenticated routes. No keys are needed until the
 * selected capability actually runs; fixed narration remains available offline.
 * Stores must be server implementations, never request bodies or mock fallbacks.
 */
export function createDocentRuntime(publications: PublicationStore, answers: SpeechSourceStore) {
  const harness = createDocentHarness({ publications,
    text: { generate: input => createOpenAiTextProvider().generate(input) },
  });
  return {
    answer: harness.answer,
    speak: (input: { sessionId: string; answerId: string }, signal?: AbortSignal) => speakVerifiedReply(input, {
      publications, answers, speech: { synthesize: request => createConfiguredSpeechProvider().synthesize(request) },
    }, signal),
  };
}

// Separate capabilities: transcribing never sends a chat or selects output mode.
export const transcribeRecording: ReturnType<typeof createOpenAiTranscriptionProvider>["transcribe"] =
  input => createOpenAiTranscriptionProvider().transcribe(input);
// Raw single-call provider retained for smoke checks. Author workflows use
// createNarrationRuntime with a trusted owner-scoped store, never a prompt proxy.
export const createNarrationDraftProvider = createLinerTextProvider;

/** Caller binds verified artist auth and a private transactional store. */
export function createArtistKnowledgeRuntime(actorId: string, store: ArtistKnowledgeStore) {
  return createArtistKnowledgeHarness(actorId, { store,
    text: { generate: input => createLinerTextProvider().generate(input) },
  });
}

/** Private authoring only. Returns a review candidate, never approval/publication. */
export function createNarrationRuntime(actorId: string, store: Pick<ArtistKnowledgeStore, "loadOwnedContext">) {
  return createNarrationHarness(actorId, { store,
    generator: { generate: input => createLinerTextProvider().generate(input) },
    judge: { generate: input => createOpenAiTextProvider(getOpenAiJudgeConfig()).generate(input) },
  });
}
