import "server-only";

import { AI_MODELS, type AiModelConfig } from "../config";
import { AiError } from "../errors";
import { jsonBody, objectValue, outputTokenLimit, parseJson, providerTrace, requestJson } from "./http";
import type { AiProviderOptions, AiTextProvider } from "./types";

const REFUSAL_REASONS = new Set([
  "SAFETY", "RECITATION", "LANGUAGE", "BLOCKLIST", "PROHIBITED_CONTENT", "SPII",
  "IMAGE_SAFETY", "IMAGE_PROHIBITED_CONTENT", "IMAGE_RECITATION", "ESCALATION", "PUP_LIMITED_DISABLED",
]);

function outputText(response: Record<string, unknown>): string {
  const blockReason = objectValue(response.promptFeedback)?.blockReason;
  if (blockReason && blockReason !== "BLOCK_REASON_UNSPECIFIED") throw new AiError("refused");
  const { candidates } = response;
  if (!Array.isArray(candidates) || candidates.length !== 1) throw new AiError("invalid_response");
  const candidate = objectValue(candidates[0]);
  const reason = candidate?.finishReason;
  if (reason === "MAX_TOKENS" || reason === "CONTINUATION") throw new AiError("incomplete");
  if (typeof reason === "string" && REFUSAL_REASONS.has(reason)) throw new AiError("refused");
  const content = objectValue(candidate?.content);
  if (reason !== "STOP" || !content || (content.role !== undefined && content.role !== "model") || !Array.isArray(content.parts)) {
    throw new AiError("invalid_response");
  }

  const text: string[] = [];
  for (const value of content.parts) {
    const part = objectValue(value);
    if (!part || typeof part.text !== "string" ||
      Object.keys(part).some(key => !["text", "thought", "thoughtSignature"].includes(key)) ||
      (part.thought !== undefined && typeof part.thought !== "boolean") ||
      (part.thoughtSignature !== undefined && typeof part.thoughtSignature !== "string")) {
      throw new AiError("invalid_response");
    }
    if (part.thought !== true) text.push(part.text);
  }
  if (!text.length) throw new AiError("invalid_response");
  return text.join("");
}

export function createGeminiTextProvider(config: AiModelConfig, options: AiProviderOptions = {}): AiTextProvider {
  if (config.model !== AI_MODELS.gemini) throw new AiError("not_configured");
  return {
    async generate({ system, input, schema, signal, maxOutputTokens, media }) {
      if (media) throw new AiError("invalid_input");
      const response = await requestJson({
        url: `https://generativelanguage.googleapis.com/v1beta/models/${config.model}:generateContent`,
        headers: { "x-goog-api-key": config.apiKey, "Content-Type": "application/json" },
        body: jsonBody({
          systemInstruction: { parts: [{ text: system }] },
          contents: [{ role: "user", parts: [{ text: input }] }],
          generationConfig: {
            candidateCount: 1,
            maxOutputTokens: outputTokenLimit(maxOutputTokens, 1600),
            responseMimeType: "application/json",
            responseJsonSchema: schema.definition,
          },
        }),
        signal,
      }, options);
      const output = objectValue(parseJson(outputText(response)));
      if (!output) throw new AiError("invalid_response");
      return { output, trace: providerTrace("gemini", config, response) };
    },
  };
}
