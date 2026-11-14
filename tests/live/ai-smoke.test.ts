import { readFile, stat } from "node:fs/promises";
import { basename } from "node:path";
import { expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));

import { createOpenAiSpeechProvider } from "../../src/lib/ai/providers/openai";
import { createTypecastSpeechProvider } from "../../src/lib/ai/providers/typecast";
import { createConfiguredSpeechProvider, createConfiguredTextProvider, createConfiguredTranscriptionProvider } from "../../src/lib/ai/runtime";
import { AI_CAPABILITIES, isMockMode, resolveAiRoute, type AiCapability } from "../../src/lib/ai/routing";
import { AI_MODELS, type AiEnvironment } from "../../src/lib/ai/config";
import { AiError } from "../../src/lib/ai/errors";
import { validateAnswer, validateNarrationDraft } from "../../src/lib/ai/harness";
import { answerJsonSchema, narrationDraftJsonSchema } from "../../src/lib/ai/contracts";
import { DOCENT_SYSTEM_PROMPT, NARRATION_SYSTEM_PROMPT } from "../../src/lib/ai/prompts";
import { organizationJsonSchema } from "../../src/lib/ai/artist-knowledge";
import { ids, syntheticPublication } from "../fixtures/ai";

function configured(capability: AiCapability, env: AiEnvironment) {
  if (capability === "stt") return createConfiguredTranscriptionProvider(undefined, env);
  if (capability === "tts") return createConfiguredSpeechProvider(undefined, env);
  return createConfiguredTextProvider(capability, undefined, env);
}

function localCheck() {
  // Never emit configured model/voice values. This command does not use fetch.
  const textOnly = process.env.AI_CHECK_SCOPE === "text";
  // Text preflight validates live credentials even while the app stays in mock mode.
  const env = textOnly ? { ...process.env, AI_PROVIDER_MODE: "live" } : process.env;
  const selected: AiCapability[] = textOnly ? ["qa", "draft", "organize", "judge"] : AI_CAPABILITIES;
  const checks = selected.map(capability => {
    try {
      const route = resolveAiRoute(capability, env);
      configured(capability, env);
      return [capability, { configured: true, provider: route.provider }] as const;
    } catch {
      return [capability, { configured: false, check: `AI_ROUTE_${capability.toUpperCase()}, selected provider key` +
        (capability === "tts" ? ", selected provider voice (Liner: LINER_TTS_VOICE and explicit model)" : "") +
        (capability === "judge" ? ", independent draft family" : "") }] as const;
    }
  });
  const capabilities = Object.fromEntries(checks);
  process.stdout.write(JSON.stringify({ check: "local-configuration-only", scope: textOnly ? "text" : "all",
    mode: isMockMode(env) ? "mock" : "live", networkCalls: 0, accountAccessVerified: false,
    billingTierVerified: false, capabilities }, null, 2) + "\n");
  expect(checks.every(([, value]) => value.configured)).toBe(true);
}

it("checks a local AI configuration or explicitly smokes one capability", async () => {
  const task = process.env.AI_SMOKE_TASK;
  if (task === "check") return localCheck();
  try {
    if (isMockMode()) throw new AiError("not_configured");
    const evidence = syntheticPublication().evidence;
    const sources = evidence.map(({ id, scope, body }) => ({ id, scope, text: body }));
    if (task === "qa" || task === "draft" || task === "exaone") {
      const qa = task !== "draft";
      const provider = createConfiguredTextProvider(qa ? "qa" : "draft", undefined, task === "exaone"
        ? { ...process.env, AI_ROUTE_QA: `exaone:${AI_MODELS.exaone}` } : process.env);
      const result = await provider.generate({ system: qa ? DOCENT_SYSTEM_PROMPT : NARRATION_SYSTEM_PROMPT,
        input: JSON.stringify(qa ? { question: "작품에 사용한 재료를 알려주세요.",
          evidence: evidence.map(({ id, version, sourceLabel, body }) => ({ id, version, sourceLabel, body })) }
          : { sources, strategy: "overview", feedback: [] }),
        schema: qa ? answerJsonSchema : narrationDraftJsonSchema });
      const validate = qa ? validateAnswer : validateNarrationDraft;
      if (validate(result.output, [ids.evidence]).outcome !== "answered") throw new AiError("invalid_response");
    } else if (task === "judge") {
      const result = await createConfiguredTextProvider("judge").generate({
        system: "Judge whether the statement is fully supported by the source. Respond only with a JSON object containing the boolean field grounded.",
        input: JSON.stringify({ sources, statement: sources[0].text }),
        schema: { name: "yeobek_smoke_judge", definition: { type: "object", additionalProperties: false,
          properties: { grounded: { type: "boolean" } }, required: ["grounded"] } },
      });
      expect(result.output).toEqual({ grounded: true });
    } else if (task === "organize") {
      const result = await createConfiguredTextProvider("organize").generate({
        system: "Assign the given artwork source to the description section. Return JSON sections, each with id and sourceIds.",
        input: JSON.stringify({ subjectType: "artwork", sources }),
        schema: organizationJsonSchema,
      });
      expect(result.output).toEqual({ sections: [{ id: "description", sourceIds: [ids.evidence] }] });
    } else if (task === "stt") {
      const path = process.env.AI_SMOKE_AUDIO;
      if (!path) throw new AiError("invalid_input");
      const file = await stat(path);
      if (!file.isFile() || file.size > 3 * 1024 * 1024) throw new AiError("invalid_input");
      const bytes = await readFile(path);
      const result = await createConfiguredTranscriptionProvider().transcribe({ audio: new Blob([bytes]), filename: basename(path), language: "ko" });
      if (!result.text) throw new AiError("invalid_response");
    } else if (task === "tts" || task === "typecast-tts" || task === "openai-tts") {
      const provider = task === "tts" ? createConfiguredSpeechProvider() : task === "typecast-tts"
        ? createTypecastSpeechProvider() : createOpenAiSpeechProvider();
      await provider.synthesize({ text: "합성 시험 안내입니다. 십팔 번 작품의 오른쪽 위에 파란 달이 있습니다." });
    } else { throw new AiError("invalid_input"); }
  } catch (error) {
    // Keep provider bodies, keys and local recording paths out of test reports.
    throw new Error(error instanceof AiError ? `AI smoke failed: ${error.code}` : "AI smoke failed: local input or output validation");
  }
});
