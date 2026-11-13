import "server-only";
import { getFeatures } from "../features";
import type { JobLifecycle } from "./job-lifecycle";
import type { VisitorLifecycle } from "./visitor-lifecycle";
import type { PublicationStore, SpeechSourceStore } from "./contracts";
import { createDocentHarness, speakVerifiedReply } from "./harness";
import { createOpenAiSpeechProvider, createOpenAiTextProvider, createOpenAiTranscriptionProvider } from "./providers/openai";
import { createLinerSpeechProvider, createLinerTextProvider, createLinerTranscriptionProvider } from "./providers/liner";
import { createTypecastSpeechProvider } from "./providers/typecast";
import { createExaoneTextProvider } from "./providers/exaone";
import { createMockSpeechProvider, createMockTextProvider, createMockTranscriptionProvider } from "./providers/mock";
import type { AiProviderOptions, AiProviderTrace, AiSpeechProvider, AiTextProvider, AiTranscriptionProvider } from "./providers/types";
import { createArtistKnowledgeHarness, type ArtistKnowledgeStore, type KnowledgeOrganizationResult } from "./artist-knowledge";
import { createNarrationHarness, type NarrationResult } from "./narration";
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
export function createDocentRuntime(publications: PublicationStore, answers: SpeechSourceStore, visitor?: VisitorLifecycle,
  onUsage?: (trace: AiProviderTrace) => void) {
  const mock = isMockMode();
  const harness = createDocentHarness({ publications, visitor,
    text: { generate: async input => {
      const result = await createConfiguredTextProvider("qa").generate(input);
      onUsage?.(result.trace); // Record a charged response even if later validation fails.
      return result;
    } },
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

export function createArtistKnowledgeRuntime(actorId: string, store: ArtistKnowledgeStore, jobs?: JobLifecycle<KnowledgeOrganizationResult>) {
  const mock = isMockMode();
  const harness = createArtistKnowledgeHarness(actorId, { store, jobs,
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

export function createNarrationRuntime(actorId: string, store: Pick<ArtistKnowledgeStore, "loadOwnedContext">, jobs?: JobLifecycle<NarrationResult>) {
  const harness = createNarrationHarness(actorId, {
    store,
    jobs,
    prepare: () => {
      assertIndependentJudge();
      // Validate keys and settings only for a claimed job, before loading sources.
      createConfiguredTextProvider("draft");
      createConfiguredTextProvider("judge");
      return { followUpQuestions: getFeatures().followUpQuestions };
    },
    generator: { generate: input => createConfiguredTextProvider("draft").generate(input) },
    judge: { generate: input => createConfiguredTextProvider("judge").generate(input) },
  });
  return {
    draft: async (...args: Parameters<typeof harness.draft>) => {
      const result = await harness.draft(...args);
      return { ...result, ...(isLocalNarrationMock() ? { mock: true as const } : {}) };
    },
  };
}

// Metadata alone must be safe even when configuration was the reason a job failed.
export function isLocalNarrationMock(env: AiEnvironment = process.env): boolean {
  return process.env.NODE_ENV !== "production" &&
    (env.NODE_ENV === "development" || env.NODE_ENV === "test") && env.AI_PROVIDER_MODE?.trim() === "mock";
}
