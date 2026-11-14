import "server-only";

import type { AiModelConfig } from "../config";
import { AiError } from "../errors";
import { jsonBody, objectValue, outputTokenLimit, parseJson, providerTrace, requestJson } from "./http";
import type { AiProviderOptions, AiTextProvider } from "./types";

export function createExaoneTextProvider(config: AiModelConfig, options: AiProviderOptions = {}): AiTextProvider {
  return {
    async generate({ system, input, schema, signal, maxOutputTokens, media }) {
      if (media) throw new AiError("invalid_input");
      // K-EXAONE 2.5 does not document a schema parameter. Request JSON in the
      // system prompt; the calling harness still validates its own local schema.
      const response = await requestJson({
        url: "https://api.exaone.ai/v1/chat/completions",
        headers: { Authorization: `Bearer ${config.apiKey}`, "Content-Type": "application/json" },
        body: jsonBody({
          model: config.model,
          messages: [
            { role: "system", content: system + "\nReturn only one JSON object matching this schema: " + JSON.stringify(schema.definition) },
            { role: "user", content: input },
          ],
          max_tokens: outputTokenLimit(maxOutputTokens, 4096),
          reasoning_effort: "low",
          stream: false,
        }),
        signal,
      }, options);
      const choices = response.choices;
      if (!Array.isArray(choices) || choices.length !== 1) throw new AiError("invalid_response");
      const choice = objectValue(choices[0]);
      const message = objectValue(choice?.message);
      if (message?.refusal || choice?.finish_reason === "content_filter") throw new AiError("refused");
      if (choice?.finish_reason === "length") throw new AiError("incomplete");
      if (choice?.finish_reason !== "stop" || message?.role !== "assistant" || typeof message.content !== "string") {
        throw new AiError("invalid_response");
      }
      const output = objectValue(parseJson(message.content));
      if (!output) throw new AiError("invalid_response");
      return { output, trace: providerTrace("exaone", config, response) };
    },
  };
}
