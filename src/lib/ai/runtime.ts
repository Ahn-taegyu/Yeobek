import "server-only";
import type { PublicationStore, SpeechSourceStore } from "./contracts";
import { createDocentHarness, speakVerifiedReply } from "./harness";
import { AiError } from "./errors";
import { createOpenAiSpeechProvider, createOpenAiTextProvider, createOpenAiTranscriptionProvider } from "./providers/openai";
import { createLinerTextProvider } from "./providers/liner";
import { createTypecastSpeechProvider } from "./providers/typecast";
import type { AiSpeechProvider } from "./providers/types";

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
// Liner draft port only. Owner/revision checks and candidate storage belong to the
// pending authoring workflow. It must not be exposed as a generic prompt proxy.
export const createNarrationDraftProvider = createLinerTextProvider;
