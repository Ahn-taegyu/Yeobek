import "server-only";

import { AI_MODELS, type AiModelConfig } from "../config";
import { AiError } from "../errors";
import { jsonBody, objectValue, outputTokenLimit, parseJson, providerTrace, requestJson } from "./http";
import type { AiProviderOptions, AiTextProvider } from "./types";

export function createGroqTextProvider(config: AiModelConfig, options: AiProviderOptions = {}): AiTextProvider {
  if (config.model !== AI_MODELS.groq) throw new AiError("not_configured");
  return {
    async generate({ system, input, schema, signal, maxOutputTokens, media }) {
      if (media) throw new AiError("invalid_input");
      const response = await requestJson({
        url: "https://api.groq.com/openai/v1/chat/completions",
        headers: { Authorization: `Bearer ${config.apiKey}`, "Content-Type": "application/json" },
        body: jsonBody({
          model: config.model,
          messages: [{ role: "system", content: system }, { role: "user", content: input }],
          max_completion_tokens: outputTokenLimit(maxOutputTokens, 4096),
          reasoning_effort: "low",
          include_reasoning: false,
          stream: false,
          response_format: {
            type: "json_schema",
            json_schema: { name: schema.name, schema: schema.definition, strict: true },
          },
        }),
        signal,
      }, options);
      const { choices } = response;
      if (!Array.isArray(choices) || choices.length !== 1) throw new AiError("invalid_response");
      const choice = objectValue(choices[0]);
      const message = objectValue(choice?.message);
      if (message?.refusal || choice?.finish_reason === "content_filter") throw new AiError("refused");
      if (choice?.finish_reason === "length") throw new AiError("incomplete");
      if (choice?.finish_reason !== "stop" || message?.role !== "assistant" || typeof message.content !== "string" ||
        message.function_call != null || (message.tool_calls != null && (!Array.isArray(message.tool_calls) || message.tool_calls.length))) {
        throw new AiError("invalid_response");
      }
      const output = objectValue(parseJson(message.content));
      if (!output) throw new AiError("invalid_response");
      return { output, trace: providerTrace("groq", config, response) };
    },
  };
}
