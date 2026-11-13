import "server-only";

import { getLinerTextConfig } from "../config";
import { AiError } from "../errors";
import { jsonBody, objectValue, parseJson, providerTrace, requestJson } from "./http";
import type { AiProviderOptions, AiTextProvider } from "./types";

const LINER_COMPLETIONS_URL = "https://platform.liner.com/api/v1/chat/completions";

export function createLinerTextProvider(
  config = getLinerTextConfig(),
  options: AiProviderOptions = {},
): AiTextProvider {
  return {
    async generate({ system, input, schema, signal }) {
      const response = await requestJson({
        url: LINER_COMPLETIONS_URL,
        headers: { Authorization: `Bearer ${config.apiKey}`, "Content-Type": "application/json" },
        body: jsonBody({
          model: config.model,
          messages: [{ role: "system", content: system }, { role: "user", content: input }],
          max_completion_tokens: 4096,
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
