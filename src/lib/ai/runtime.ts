import "server-only";
import type { PublicationStore, SpeechSourceStore } from "./contracts";
import { createDocentHarness, speakVerifiedReply } from "./harness";
import { createOpenAiSpeechProvider, createOpenAiTextProvider, createOpenAiTranscriptionProvider } from "./providers/openai";
import { createLinerSpeechProvider, createLinerTextProvider, createLinerTranscriptionProvider } from "./providers/liner";
import { createTypecastSpeechProvider } from "./providers/typecast";
import { createExaoneTextProvider } from "./providers/exaone";
import { createMockSpeechProvider, createMockTextProvider, createMockTranscriptionProvider } from "./providers/mock";
import type { AiProviderOptions, AiSpeechProvider, AiTextProvider, AiTranscriptionProvider } from "./providers/types";
import { createArtistKnowledgeHarness, type ArtistKnowledgeStore } from "./artist-knowledge";
import { createNarrationHarness } from "./narration";
import { getLinerSpeechConfig, getOpenAiSpeechConfig, getTypecastSpeechConfig, type AiEnvironment } from "./config";
import { assertIndependentJudge, getRoutedModelConfig, isMockMode, resolveAiRoute, type TextCapability } from "./routing";

export function createConfiguredTextProvider(capability: TextCapability, options?: AiProviderOptions, env: AiEnvironment = process.env): AiTextProvider {
  if (capability === "judge") assertIndependentJudge(env);
  const route = resolveAiRoute(capability, env);
  if (route.provider === "mock") return createMockTextProvider(route.model, env);
  const config = getRoutedModelConfig(route, env);
  if (route.provider === "liner") return createLinerTextProvider(config, options);
  if (route.provider === "exaone") return createExaoneTextProvider(config, options);
  return createOpenAiTextProvider(config, options);
}

export function createConfiguredSpeechProvider(options?: AiProviderOptions, env: AiEnvironment = process.env): AiSpeechProvider {
  const route = resolveAiRoute("tts", env);
  if (route.provider === "mock") return createMockSpeechProvider(env);
  if (route.provider === "liner") return createLinerSpeechProvider(getLinerSpeechConfig(getRoutedModelConfig(route, env), env), options);
  if (route.provider === "typecast") return createTypecastSpeechProvider(getTypecastSpeechConfig({ ...env, TYPECAST_TTS_MODEL: route.model }), options);
  return createOpenAiSpeechProvider(getOpenAiSpeechConfig({ ...env, OPENAI_TTS_MODEL: route.model }), options);
}

export function createConfiguredTranscriptionProvider(options?: AiProviderOptions, env: AiEnvironment = process.env): AiTranscriptionProvider {
  const route = resolveAiRoute("stt", env);
  if (route.provider === "mock") return createMockTranscriptionProvider(env);
  const config = getRoutedModelConfig(route, env);
  return route.provider === "liner" ? createLinerTranscriptionProvider(config, options) : createOpenAiTranscriptionProvider(config, options);
}

/** Keys are checked only when a model capability runs; fixed narration remains available offline. */
export function createDocentRuntime(publications: PublicationStore, answers: SpeechSourceStore) {
  const mock = isMockMode();
  const harness = createDocentHarness({ publications,
    text: { generate: input => createConfiguredTextProvider("qa").generate(input) },
  });
  return {
    answer: async (...args: Parameters<typeof harness.answer>) => ({
      ...await harness.answer(...args), ...(mock ? { mock: true as const } : {}),
    }),
    speak: (input: { sessionId: string; answerId: string }, signal?: AbortSignal) => speakVerifiedReply(input, {
      publications, answers, speech: { synthesize: request => createConfiguredSpeechProvider().synthesize(request) },
    }, signal),
  };
}

export const transcribeRecording: AiTranscriptionProvider["transcribe"] = input => createConfiguredTranscriptionProvider().transcribe(input);
export const createNarrationDraftProvider = () => createConfiguredTextProvider("draft");

export function createArtistKnowledgeRuntime(actorId: string, store: ArtistKnowledgeStore) {
  const mock = isMockMode();
  const harness = createArtistKnowledgeHarness(actorId, { store,
    text: { generate: input => createConfiguredTextProvider("organize").generate(input) },
  });
  return {
    propose: async (...args: Parameters<typeof harness.propose>) => ({
      ...await harness.propose(...args), ...(mock ? { mock: true as const } : {}),
    }),
    apply: async (...args: Parameters<typeof harness.apply>) => ({
      ...await harness.apply(...args), ...(mock ? { mock: true as const } : {}),
    }),
  };
}

export function createNarrationRuntime(actorId: string, store: Pick<ArtistKnowledgeStore, "loadOwnedContext">) {
  const mock = isMockMode();
  assertIndependentJudge();
  const harness = createNarrationHarness(actorId, { store,
    generator: { generate: input => createConfiguredTextProvider("draft").generate(input) },
    judge: { generate: input => createConfiguredTextProvider("judge").generate(input) },
  });
  return {
    draft: async (...args: Parameters<typeof harness.draft>) => ({
      ...await harness.draft(...args), ...(mock ? { mock: true as const } : {}),
    }),
  };
}
