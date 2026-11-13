import "server-only";

import { getLinerTextConfig, type AiModelConfig, type OpenAiSpeechConfig } from "../config";
import { AiError } from "../errors";
import { jsonBody, objectValue, outputTokenLimit, parseJson, providerTrace, requestJson, requestSpeech, SPEECH_CONTENT_TYPE, validateSpeechText } from "./http";
import type { AiProviderOptions, AiTextProvider, AiSpeechProvider, AiTranscriptionProvider } from "./types";

import { recordingExtension, RECORDING_CONTENT_TYPES } from "./recording";

const LINER_COMPLETIONS_URL = "https://platform.liner.com/api/v1/chat/completions";

export function createLinerTextProvider(
  config = getLinerTextConfig(),
  options: AiProviderOptions = {},
): AiTextProvider {
  return {
    async generate({ system, input, schema, signal, maxOutputTokens }) {
      const response = await requestJson({
        url: LINER_COMPLETIONS_URL,
        headers: { Authorization: `Bearer ${config.apiKey}`, "Content-Type": "application/json" },
        body: jsonBody({
          model: config.model,
          messages: [{ role: "system", content: system }, { role: "user", content: input }],
          max_completion_tokens: outputTokenLimit(maxOutputTokens, 4096),
          store: false,
          response_format: {
            type: "json_schema",
            json_schema: { name: schema.name, schema: schema.definition, strict: true },
          },
        }),
        signal,
      }, options);

      const choices = response.choices;
      if (!Array.isArray(choices) || choices.length !== 1) throw new AiError("invalid_response");
      const choice = objectValue(choices[0]);
      const message = objectValue(choice?.message);
      if (message?.refusal || choice?.finish_reason === "content_filter") throw new AiError("refused");
      if (choice?.finish_reason === "length") throw new AiError("incomplete");
      if (choice?.finish_reason !== "stop" || message?.role !== "assistant" ||
          typeof message.content !== "string") {
        throw new AiError("invalid_response");
      }
      return { output: parseJson(message.content), trace: providerTrace("liner", config, response) };
    },
  };
}

export function createLinerTranscriptionProvider(config: AiModelConfig, options: AiProviderOptions = {}): AiTranscriptionProvider {
  return {
    async transcribe({ audio, filename, language, signal }) {
      const extension = recordingExtension(audio, filename, language);
      if (!["wav", "mp3", "flac", "m4a", "ogg", "webm"].includes(extension)) throw new AiError("invalid_input");
      const form = new FormData();
      form.append("file", audio.slice(0, audio.size, RECORDING_CONTENT_TYPES[extension]), `recording.${extension}`);
      form.append("model", config.model);
      if (language) form.append("language", language);
      form.append("response_format", "json");
      const response = await requestJson({
        url: "https://platform.liner.com/api/v1/audio/transcriptions",
        headers: { Authorization: `Bearer ${config.apiKey}` }, body: form, signal,
      }, options);
      if (typeof response.text !== "string" || response.text.length > 4000) throw new AiError("invalid_response");
      return { text: response.text.trim(), trace: providerTrace("liner", config, response) };
    },
  };
}

export function createLinerSpeechProvider(config: OpenAiSpeechConfig, options: AiProviderOptions = {}): AiSpeechProvider {
  return {
    async synthesize({ text, signal }) {
      validateSpeechText(text);
      const audio = await requestSpeech({
        url: "https://platform.liner.com/api/v1/audio/speech",
        headers: { Authorization: `Bearer ${config.apiKey}`, "Content-Type": "application/json" },
        body: jsonBody({ model: config.model, voice: config.voice, input: text, response_format: "mp3" }), signal,
      }, options);
      return { audio, contentType: SPEECH_CONTENT_TYPE, trace: providerTrace("liner", config) };
    },
  };
}
