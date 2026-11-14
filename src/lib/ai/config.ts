import "server-only";

import { AiError } from "./errors";

export const AI_MODELS = {
  qa: "gpt-6-luna",
  exaone: "k-exaone_v2.5",
  gemini: "gemini-3.5-flash-lite",
  groq: "openai/gpt-oss-120b",
  draft: "openai/gpt-6.1-sol",
  transcription: "gpt-transcribe",
  typecastSpeech: "ssfm-v31",
  // Temporary opt-in fallback, scheduled to shut down on 2027-01-06.
  openAiSpeech: "gpt-4o-mini-tts",
} as const;

export const DEFAULT_OPENAI_TTS_VOICE = "coral";
export const AI_REQUEST_TIMEOUT_MS = 30_000;

export type AiEnvironment = Readonly<Record<string, string | undefined>>;

export interface AiModelConfig {
  apiKey: string;
  model: string;
}

export interface TypecastSpeechConfig extends AiModelConfig {
  voiceId: string;
}

export interface OpenAiSpeechConfig extends AiModelConfig {
  voice: string;
}

export function providerKey(value: string | undefined): string {
  const trimmed = value?.trim();
  if (!trimmed || !/^[!-~]+$/.test(trimmed)) throw new AiError("not_configured");
  return trimmed;
}

export function modelIdentifier(value: string | undefined, fallback?: string): string {
  const selected = value?.trim() || fallback;
  if (!selected || !/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/.test(selected)) {
    throw new AiError("not_configured");
  }
  return selected;
}

export function getOpenAiTextConfig(env: AiEnvironment = process.env): AiModelConfig {
  return { apiKey: providerKey(env.OPENAI_API_KEY), model: modelIdentifier(env.OPENAI_QA_MODEL, AI_MODELS.qa) };
}

export function getLinerTextConfig(env: AiEnvironment = process.env): AiModelConfig {
  return { apiKey: providerKey(env.LINER_API_KEY), model: modelIdentifier(env.LINER_DRAFT_MODEL, AI_MODELS.draft) };
}

export function getOpenAiJudgeConfig(env: AiEnvironment = process.env): AiModelConfig {
  return { apiKey: providerKey(env.OPENAI_API_KEY), model: modelIdentifier(env.OPENAI_JUDGE_MODEL, AI_MODELS.qa) };
}

export function getOpenAiTranscriptionConfig(env: AiEnvironment = process.env): AiModelConfig {
  return { apiKey: providerKey(env.OPENAI_API_KEY), model: modelIdentifier(env.OPENAI_STT_MODEL, AI_MODELS.transcription) };
}

export function getTypecastSpeechConfig(env: AiEnvironment = process.env): TypecastSpeechConfig {
  return {
    apiKey: providerKey(env.TYPECAST_API_KEY),
    model: modelIdentifier(env.TYPECAST_TTS_MODEL, AI_MODELS.typecastSpeech),
    voiceId: modelIdentifier(env.TYPECAST_VOICE_ID),
  };
}

export function getOpenAiSpeechConfig(env: AiEnvironment = process.env): OpenAiSpeechConfig {
  return {
    apiKey: providerKey(env.OPENAI_API_KEY),
    model: modelIdentifier(env.OPENAI_TTS_MODEL, AI_MODELS.openAiSpeech),
    voice: modelIdentifier(env.OPENAI_TTS_VOICE, DEFAULT_OPENAI_TTS_VOICE),
  };
}

export function getLinerSpeechConfig(config: AiModelConfig, env: AiEnvironment = process.env): OpenAiSpeechConfig {
  return { ...config, voice: modelIdentifier(env.LINER_TTS_VOICE) };
}
