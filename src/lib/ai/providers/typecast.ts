import "server-only";

import { getTypecastSpeechConfig } from "../config";
import { jsonBody, providerTrace, requestSpeech, SPEECH_CONTENT_TYPE, validateSpeechText } from "./http";
import type { AiProviderOptions, AiSpeechProvider } from "./types";

const TYPECAST_SPEECH_URL = "https://api.typecast.ai/v1/text-to-speech";

export function createTypecastSpeechProvider(
  config = getTypecastSpeechConfig(),
  options: AiProviderOptions = {},
): AiSpeechProvider {
  return {
    async synthesize({ text, signal }) {
      validateSpeechText(text);
      const audio = await requestSpeech({
        url: TYPECAST_SPEECH_URL,
        headers: { "X-API-KEY": config.apiKey, "Content-Type": "application/json" },
        body: jsonBody({
          model: config.model,
          voice_id: config.voiceId,
          text,
          output: { audio_format: "mp3" },
        }),
        signal,
      }, options);
      return { audio, contentType: SPEECH_CONTENT_TYPE, trace: providerTrace("typecast", config) };
    },
  };
}
