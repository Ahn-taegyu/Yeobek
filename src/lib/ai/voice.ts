import "server-only";
import { createHash } from "node:crypto";
import { DEFAULT_OPENAI_TTS_VOICE, modelIdentifier, type AiEnvironment } from "./config";
import { resolveAiRoute } from "./routing";

/** Non-secret identity of the exact server voice configuration. Changing any
 * field requires a new DB voice_config_version before creating/publishing audio. */
export function speechIdentity(env: AiEnvironment = process.env) {
  const route = resolveAiRoute("tts", env);
  const voice = route.provider === "mock" ? "silent-v1"
    : route.provider === "liner" ? modelIdentifier(env.LINER_TTS_VOICE)
      : route.provider === "typecast" ? modelIdentifier(env.TYPECAST_VOICE_ID)
        : modelIdentifier(env.OPENAI_TTS_VOICE, DEFAULT_OPENAI_TTS_VOICE);
  const identity = { schemaVersion: 1, provider: route.provider, model: route.model, voice,
    format: "mp3", mock: route.provider === "mock" };
  return { ...identity, fingerprint: createHash("sha256").update(JSON.stringify(identity)).digest("hex") };
}
