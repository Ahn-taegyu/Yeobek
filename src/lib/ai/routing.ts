import "server-only";

import { AI_MODELS,
  modelIdentifier, providerKey, type AiEnvironment } from "./config";
import { AiError } from "./errors";

const linerDraft = AI_MODELS.draft;
const defaults = {
  draft: linerDraft,
  organize: linerDraft,
  material: "google/gemini-3.8-flash",
  automation: linerDraft,
  judge: "google/gemini-3.8-flash",
  qa: "openai/gpt-6-luna",
  stt: "openai/whisper-1",
  tts: undefined,
} as const;
export type AiCapability = keyof typeof defaults;
export const AI_CAPABILITIES = Object.keys(defaults) as AiCapability[];
export type TextCapability = Exclude<AiCapability, "stt" | "tts">;

const textProviders = ["liner", "openai", "exaone"] as const;
const transcriptionProviders = ["liner", "openai"] as const;
const speechProviders = ["liner", "openai", "typecast"] as const;
export type LiveAiProvider = typeof textProviders[number] | typeof speechProviders[number];

type Route = { provider: LiveAiProvider; model: string } | { provider: "mock"; model: string };

export function isMockMode(env: AiEnvironment = process.env): boolean {
  const mode = env.AI_PROVIDER_MODE?.trim() || "live";
  if (mode === "live") return false;
  if (mode === "mock" && (env.NODE_ENV === "test" || env.NODE_ENV === "development")) return true;
  throw new AiError("not_configured");
}

export function resolveAiRoute(capability: AiCapability, env: AiEnvironment = process.env): Route {
  if (isMockMode(env)) return { provider: "mock", model: "mock-" + capability };
  const providers: readonly LiveAiProvider[] = capability === "tts" ? speechProviders :
    capability === "stt" ? transcriptionProviders : capability === "automation" ? ["liner"] :
    capability === "material" ? ["liner", "openai"] : textProviders;
  const configured = env["AI_ROUTE_" + capability.toUpperCase()]?.trim();
  const legacySpeech = capability === "tts" ? env.AI_TTS_PROVIDER?.trim() : undefined;
  const selection = configured || legacySpeech || "liner";
  const colon = selection.indexOf(":");
  const provider = (colon < 0 ? selection : selection.slice(0, colon)) as LiveAiProvider;
  if (!providers.includes(provider) || (configured && colon < 0)) throw new AiError("not_configured");
  const explicit = colon >= 0 ? selection.slice(colon + 1) : undefined;
  if (explicit !== undefined && (!explicit || explicit.trim() !== explicit)) throw new AiError("not_configured");
  const fallback = capability === "tts"
    ? provider === "liner" ? env.LINER_TTS_MODEL?.trim()
      : provider === "typecast" ? env.TYPECAST_TTS_MODEL?.trim() || AI_MODELS.typecastSpeech
      : env.OPENAI_TTS_MODEL?.trim() || AI_MODELS.openAiSpeech
    : capability === "draft" ? env.LINER_DRAFT_MODEL?.trim() || defaults.draft
    : defaults[capability];
  return { provider, model: modelIdentifier(explicit, fallback) };
}

// Check upstream families across gateways, rather than comparing provider IDs.
// Only pinned, recognizable families qualify; router aliases cannot guarantee separation.
function family(route: Route): string | undefined {
  if (route.provider === "mock" || route.provider === "openai" || route.provider === "exaone") return route.provider;
  const model = route.model.toLowerCase();
  if (/^openai\/(?:gpt-|o[1-9](?:-|$))/.test(model)) return "openai";
  if (/^google\/gemini-/.test(model)) return "google";
  if (/^anthropic\/claude-/.test(model)) return "anthropic";
  if (/^deepseek\/deepseek-/.test(model)) return "deepseek";
  if (/^qwen\/qwen[0-9]/.test(model)) return "qwen";
}

export function assertIndependentJudge(env: AiEnvironment = process.env): void {
  if (isMockMode(env)) return;
  const draft = family(resolveAiRoute("draft", env));
  const judge = family(resolveAiRoute("judge", env));
  if (!draft || !judge || draft === judge) throw new AiError("not_configured");
}

export function getRoutedModelConfig(route: Exclude<Route, { provider: "mock" }>, env: AiEnvironment = process.env) {
  return { model: route.model, apiKey: providerKey(env[route.provider.toUpperCase() + "_API_KEY"]) };
}
