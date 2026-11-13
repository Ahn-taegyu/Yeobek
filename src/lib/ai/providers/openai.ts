import "server-only";

import { getOpenAiSpeechConfig, getOpenAiTextConfig, getOpenAiTranscriptionConfig } from "../config";
import { AiError } from "../errors";
import {
  jsonBody, objectValue, outputTokenLimit, parseJson, providerTrace, requestJson, requestSpeech,
  SPEECH_CONTENT_TYPE, validateSpeechText,
} from "./http";
import type {
  AiProviderOptions, AiSpeechProvider, AiTextProvider, AiTranscriptionProvider,
} from "./types";

const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";
const OPENAI_TRANSCRIPTIONS_URL = "https://api.openai.com/v1/audio/transcriptions";
const OPENAI_SPEECH_URL = "https://api.openai.com/v1/audio/speech";
const RECORDING_CONTENT_TYPES: Record<string, string> = {
  flac: "audio/flac",
  mp3: "audio/mpeg",
  mp4: "audio/mp4",
  mpeg: "audio/mpeg",
  mpga: "audio/mpeg",
  m4a: "audio/mp4",
  ogg: "audio/ogg",
  wav: "audio/wav",
  webm: "audio/webm",
};
export const MAX_RECORDING_BYTES = 3 * 1024 * 1024;

function outputText(response: Record<string, unknown>): string {
  if (response.status === "incomplete" || response.incomplete_details != null) {
    throw new AiError("incomplete");
  }
  if (response.status !== "completed" || !Array.isArray(response.output)) {
    throw new AiError("invalid_response");
  }

  const texts: string[] = [];
  for (const value of response.output) {
    const item = objectValue(value);
    if (item?.type === "reasoning") continue;
    if (item?.type !== "message" || item.role !== "assistant" || !Array.isArray(item.content)) {
      throw new AiError("invalid_response");
    }
    if (item.status === "incomplete" || item.status === "in_progress") throw new AiError("incomplete");
    for (const part of item.content) {
      const content = objectValue(part);
      if (content?.type === "refusal") throw new AiError("refused");
      if (content?.type !== "output_text" || typeof content.text !== "string") {
        throw new AiError("invalid_response");
      }
      texts.push(content.text);
    }
  }
  if (texts.length !== 1) throw new AiError("invalid_response");
  return texts[0];
}

export function createOpenAiTextProvider(
  config = getOpenAiTextConfig(),
  options: AiProviderOptions = {},
): AiTextProvider {
  return {
    async generate({ system, input, schema, signal, maxOutputTokens }) {
      const response = await requestJson({
        url: OPENAI_RESPONSES_URL,
        headers: { Authorization: `Bearer ${config.apiKey}`, "Content-Type": "application/json" },
        body: jsonBody({
          model: config.model,
          instructions: system,
          input,
          reasoning: { effort: "low" },
          max_output_tokens: outputTokenLimit(maxOutputTokens, 1600),
          store: false,
          text: { format: { type: "json_schema", name: schema.name, schema: schema.definition, strict: true } },
        }),
        signal,
      }, options);
      return { output: parseJson(outputText(response)), trace: providerTrace("openai", config, response) };
    },
  };
}

export function createOpenAiTranscriptionProvider(
  config = getOpenAiTranscriptionConfig(),
  options: AiProviderOptions = {},
): AiTranscriptionProvider {
  return {
    async transcribe({ audio, filename, language, signal }) {
      const extension = typeof filename === "string" ? /\.([a-z0-9]{3,4})$/i.exec(filename)?.[1].toLowerCase() : undefined;
      if (!(audio instanceof Blob) || audio.size === 0 || audio.size > MAX_RECORDING_BYTES ||
          !extension || !Object.hasOwn(RECORDING_CONTENT_TYPES, extension) ||
          (language !== undefined && !/^[a-z]{2}$/.test(language))) {
        throw new AiError("invalid_input");
      }

      const form = new FormData();
      form.append("file", audio.slice(0, audio.size, RECORDING_CONTENT_TYPES[extension]), `recording.${extension}`);
      form.append("model", config.model);
      form.append("response_format", "json");
      if (language) {
        const hint = config.model === "gpt-transcribe" || config.model.startsWith("gpt-transcribe-")
          ? "languages[]"
          : "language";
        form.append(hint, language);
      }

      const response = await requestJson({
        url: OPENAI_TRANSCRIPTIONS_URL,
        headers: { Authorization: `Bearer ${config.apiKey}` },
        body: form,
        signal,
      }, options);
      if (typeof response.text !== "string" || response.text.length > 4000) {
        throw new AiError("invalid_response");
      }
      return { text: response.text.trim(), trace: providerTrace("openai", config, response) };
    },
  };
}

export function createOpenAiSpeechProvider(
  config = getOpenAiSpeechConfig(),
  options: AiProviderOptions = {},
): AiSpeechProvider {
  return {
    async synthesize({ text, signal }) {
      validateSpeechText(text);
      const audio = await requestSpeech({
        url: OPENAI_SPEECH_URL,
        headers: { Authorization: `Bearer ${config.apiKey}`, "Content-Type": "application/json" },
        body: jsonBody({ model: config.model, voice: config.voice, input: text, response_format: "mp3" }),
        signal,
      }, options, [SPEECH_CONTENT_TYPE, "application/octet-stream"]);
      return { audio, contentType: SPEECH_CONTENT_TYPE, trace: providerTrace("openai", config) };
    },
  };
}
