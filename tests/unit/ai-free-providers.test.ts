import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));

import { AI_MODELS } from "@/lib/ai/config";
import { narrationDraftJsonSchema } from "@/lib/ai/contracts";
import type { NarrationResult } from "@/lib/ai/narration";
import { estimateCost, pricingSchema } from "@/lib/ai/narration-report";
import { createGeminiTextProvider, createGroqTextProvider } from "@/lib/ai/providers";
import { assertIndependentJudge, resolveAiRoute } from "@/lib/ai/routing";
import { createConfiguredTextProvider } from "@/lib/ai/runtime";

const apiKey = "test-provider-key";
const geminiRoute = `gemini:${AI_MODELS.gemini}`;
const groqRoute = `groq:${AI_MODELS.groq}`;
const env = { GEMINI_API_KEY: apiKey, GROQ_API_KEY: apiKey, AI_ROUTE_DRAFT: geminiRoute, AI_ROUTE_JUDGE: groqRoute };
const draft = { answer: "작품 설명", citations: [], outcome: "insufficient_evidence" };
const request = { system: "Keep the output grounded.", input: "{}", schema: narrationDraftJsonSchema, maxOutputTokens: 321 };
const evaluations = { evaluations: [{ candidateId: "one", grounding: 5 }] };
const evaluationSchema = {
  name: "test_evaluations",
  definition: { type: "object", additionalProperties: false, required: ["evaluations"], properties: {
    evaluations: { type: "array", items: { type: "object", additionalProperties: false, required: ["candidateId", "grounding"],
      properties: { candidateId: { type: "string" }, grounding: { type: "integer" } } } },
  } },
};

const part = { text: JSON.stringify(draft) };
const candidate = { finishReason: "STOP", content: { role: "model", parts: [part] } };
const message = { role: "assistant", content: JSON.stringify(evaluations) };
const choice = { finish_reason: "stop", message };

describe("Gemini generateContent", () => {
  it("requests one structured response and records visible and thinking tokens", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(Response.json({
      candidates: [{ ...candidate, content: { role: "model", parts: [
        { text: "Ignored thought summary", thought: true },
        { text: part.text.slice(0, 10), thoughtSignature: "ignored-signature" }, { text: part.text.slice(10) },
      ] } }],
      modelVersion: "gemini-3.5-flash-lite-001",
      usageMetadata: { promptTokenCount: 120, candidatesTokenCount: 24, thoughtsTokenCount: 32, totalTokenCount: 176 },
    }));
    await expect(createConfiguredTextProvider("draft", { fetch }, env).generate(request)).resolves.toEqual({
      output: draft,
      trace: { provider: "gemini", model: "gemini-3.5-flash-lite-001", usage: { inputTokens: 120, outputTokens: 56, totalTokens: 176 } },
    });
    expect(fetch).toHaveBeenCalledOnce();
    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe(`https://generativelanguage.googleapis.com/v1beta/models/${AI_MODELS.gemini}:generateContent`);
    expect(init).toMatchObject({ method: "POST", redirect: "error", cache: "no-store",
      headers: { "x-goog-api-key": apiKey, "Content-Type": "application/json" } });
    expect(JSON.parse(String(init?.body))).toEqual({
      systemInstruction: { parts: [{ text: request.system }] },
      contents: [{ role: "user", parts: [{ text: request.input }] }],
      generationConfig: { candidateCount: 1, maxOutputTokens: 321,
        responseMimeType: "application/json", responseJsonSchema: narrationDraftJsonSchema.definition },
    });
  });

  it.each([
    { response: { promptFeedback: { blockReason: "SAFETY", blockReasonMessage: apiKey } }, code: "refused" },
    { response: { candidates: [{ ...candidate, finishReason: "PROHIBITED_CONTENT" }] }, code: "refused" },
    { response: { candidates: [{ ...candidate, finishReason: "MAX_TOKENS" }] }, code: "incomplete" },
    { response: { candidates: [candidate, candidate] }, code: "invalid_response" },
    { response: { candidates: [{ ...candidate, content: { parts: [part, part] } }] }, code: "invalid_response" },
    { response: { candidates: [{ ...candidate, content: { parts: [{ ...part, functionCall: {} }] } }] }, code: "invalid_response" },
    { response: { candidates: [{ ...candidate, content: { parts: [{ ...part, thought: true }] } }] }, code: "invalid_response" },
    { response: { candidates: [{ ...candidate, content: { parts: [{ text: "{" }] } }] }, code: "invalid_response" },
  ])("rejects untrusted output with $code", async ({ response, code }) => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(Response.json(response));
    const result = createGeminiTextProvider({ model: AI_MODELS.gemini, apiKey }, { fetch }).generate(request);
    await expect(result).rejects.toMatchObject({ code });
    await expect(result).rejects.not.toThrow(apiKey);
    expect(fetch).toHaveBeenCalledOnce();
  });

  it("drops unsafe model names and omitted or invalid token counts", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(Response.json({
      candidates: [candidate], modelVersion: apiKey,
      usageMetadata: { promptTokenCount: -1, candidatesTokenCount: 3, thoughtsTokenCount: "unknown" },
    }));
    const result = await createGeminiTextProvider({ model: AI_MODELS.gemini, apiKey }, { fetch }).generate(request);
    expect(result.trace).toEqual({ provider: "gemini", model: AI_MODELS.gemini });
  });
});

describe("Groq Chat Completions", () => {
  it("sends the named strict schema to GPT-OSS and records completion usage", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(Response.json({
      choices: [{ ...choice, message: { ...message, reasoning: "ignored", refusal: null } }], model: AI_MODELS.groq,
      usage: { prompt_tokens: 40, completion_tokens: 60, total_tokens: 100, completion_tokens_details: { reasoning_tokens: 40 } },
    }));
    await expect(createConfiguredTextProvider("judge", { fetch }, env).generate({ ...request, schema: evaluationSchema })).resolves.toEqual({
      output: evaluations, trace: { provider: "groq", model: AI_MODELS.groq, usage: { inputTokens: 40, outputTokens: 60, totalTokens: 100 } },
    });
    expect(fetch).toHaveBeenCalledOnce();
    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe("https://api.groq.com/openai/v1/chat/completions");
    expect(init).toMatchObject({ method: "POST", redirect: "error", cache: "no-store",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" } });
    expect(JSON.parse(String(init?.body))).toEqual({
      model: AI_MODELS.groq,
      messages: [{ role: "system", content: request.system }, { role: "user", content: request.input }],
      max_completion_tokens: 321, reasoning_effort: "low", include_reasoning: false, stream: false,
      response_format: { type: "json_schema", json_schema: { name: evaluationSchema.name, schema: evaluationSchema.definition, strict: true } },
    });
  });

  it.each([
    { choices: [{ ...choice, message: { ...message, refusal: apiKey } }], code: "refused" },
    { choices: [{ finish_reason: "content_filter" }], code: "refused" },
    { choices: [{ ...choice, finish_reason: "length" }], code: "incomplete" },
    { choices: [choice, choice], code: "invalid_response" },
    { choices: [{ ...choice, message: { ...message, content: "[]" } }], code: "invalid_response" },
    { choices: [{ ...choice, message: { ...message, content: "{} {}" } }], code: "invalid_response" },
    { choices: [{ ...choice, message: { ...message, tool_calls: [{}] } }], code: "invalid_response" },
  ])("rejects untrusted output with $code", async ({ choices, code }) => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(Response.json({ choices }));
    const result = createGroqTextProvider({ model: AI_MODELS.groq, apiKey }, { fetch }).generate(request);
    await expect(result).rejects.toMatchObject({ code });
    await expect(result).rejects.not.toThrow(apiKey);
    expect(fetch).toHaveBeenCalledOnce();
  });
});

const providers = [
  { name: "Gemini", create: createGeminiTextProvider, model: AI_MODELS.gemini },
  { name: "Groq", create: createGroqTextProvider, model: AI_MODELS.groq },
];

describe.each(providers)("$name transport boundaries", ({ create, model }) => {
  it("rejects oversized bodies, token limits, media and cancelled requests before fetch", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>();
    const provider = create({ model, apiKey }, { fetch });
    await expect(provider.generate({ ...request, input: "가".repeat(45_000) })).rejects.toMatchObject({ code: "invalid_input" });
    await expect(provider.generate({ ...request, maxOutputTokens: 8193 })).rejects.toMatchObject({ code: "invalid_input" });
    await expect(provider.generate({ ...request, media: { contentType: "application/pdf", data: new Uint8Array(2) } }))
      .rejects.toMatchObject({ code: "invalid_input" });
    await expect(provider.generate({ ...request, signal: AbortSignal.abort(apiKey) })).rejects.toMatchObject({ code: "cancelled" });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("bounds streamed response bytes without relying on Content-Length", async () => {
    const response = new Response("x".repeat(256 * 1024 + 1), { headers: { "Content-Type": "application/json" } });
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(response);
    await expect(create({ model, apiKey }, { fetch }).generate(request)).rejects.toMatchObject({ code: "response_too_large" });
    expect(fetch).toHaveBeenCalledOnce();
  });

  it("does not retry quota failures, timeouts or network errors", async () => {
    const quota = vi.fn<typeof globalThis.fetch>().mockResolvedValue(new Response(apiKey, { status: 429 }));
    const http = create({ model, apiKey }, { fetch: quota }).generate(request);
    await expect(http).rejects.toMatchObject({ code: "rate_limited" });
    await expect(http).rejects.not.toThrow(apiKey);
    expect(quota).toHaveBeenCalledOnce();

    const hanging = vi.fn<typeof globalThis.fetch>().mockImplementation(() => new Promise(() => {}));
    await expect(create({ model, apiKey }, { fetch: hanging, timeoutMs: 5 }).generate(request)).rejects.toMatchObject({ code: "timeout" });
    expect(hanging).toHaveBeenCalledOnce();
    expect(hanging.mock.calls[0][1]?.signal?.aborted).toBe(true);

    const broken = vi.fn<typeof globalThis.fetch>().mockRejectedValue(new Error(apiKey));
    const failure = create({ model, apiKey }, { fetch: broken }).generate(request);
    await expect(failure).rejects.toMatchObject({ code: "network_error" });
    await expect(failure).rejects.not.toThrow(apiKey);
    expect(broken).toHaveBeenCalledOnce();
  });
});

describe("explicit free provider routes and pricing", () => {
  const notConfigured = expect.objectContaining({ code: "not_configured" });
  it("keeps Liner defaults and allows the pinned providers only for text roles that support them", () => {
    for (const capability of ["draft", "organize", "judge", "qa"] as const) {
      expect(resolveAiRoute(capability, {}).provider).toBe("liner");
      for (const route of [geminiRoute, groqRoute]) {
        expect(resolveAiRoute(capability, { ["AI_ROUTE_" + capability.toUpperCase()]: route }).provider).toBe(route.split(":")[0]);
      }
    }
    for (const capability of ["material", "automation", "stt", "tts"] as const) {
      for (const route of [geminiRoute, groqRoute]) {
        expect(() => resolveAiRoute(capability, { ["AI_ROUTE_" + capability.toUpperCase()]: route })).toThrow(notConfigured);
      }
    }
    expect(() => createConfiguredTextProvider("draft", {}, { AI_ROUTE_DRAFT: geminiRoute })).toThrow(notConfigured);
    expect(() => createConfiguredTextProvider("judge", {}, { AI_ROUTE_DRAFT: geminiRoute, AI_ROUTE_JUDGE: groqRoute })).toThrow(notConfigured);
  });

  it("compares actual model families across providers and rejects unidentified selections", () => {
    expect(() => assertIndependentJudge(env)).not.toThrow();
    expect(() => assertIndependentJudge({ AI_ROUTE_DRAFT: geminiRoute })).toThrow(notConfigured);
    expect(() => assertIndependentJudge({ AI_ROUTE_JUDGE: groqRoute })).toThrow(notConfigured);
    expect(() => assertIndependentJudge({ AI_ROUTE_DRAFT: "openai:gpt-6-luna", AI_ROUTE_JUDGE: groqRoute })).toThrow(notConfigured);
    expect(() => assertIndependentJudge({ AI_ROUTE_DRAFT: "liner:openai/gpt-oss-120b", AI_ROUTE_JUDGE: groqRoute })).toThrow(notConfigured);
    expect(() => assertIndependentJudge({ AI_ROUTE_DRAFT: "liner:google/gemini-3.8-flash", AI_ROUTE_JUDGE: geminiRoute })).toThrow(notConfigured);
    expect(() => assertIndependentJudge({ AI_ROUTE_DRAFT: "gemini:gemini-router", AI_ROUTE_JUDGE: groqRoute })).toThrow(notConfigured);
    expect(() => assertIndependentJudge({ AI_ROUTE_DRAFT: geminiRoute, AI_ROUTE_JUDGE: "groq:groq/compound" })).toThrow(notConfigured);
  });

  it.each(["gemini", "groq"] as const)("requires an explicit rate for %s spend estimates", provider => {
    const model = AI_MODELS[provider];
    const result: NarrationResult = { status: "abstained", reason: "below_threshold", selected: null, selectedCandidateId: null,
      contextHash: null, promptVersion: "test", steps: [], metrics: { strategy: "single", rounds: 1, elapsedMs: 1,
        reservedCalls: 2, reservedOutputTokens: 4600, evaluations: [], evaluationSteps: [], calls: [
          { role: "generation", round: 1, elapsedMs: 1, maxOutputTokens: 321, status: "success", trace: {
            provider, model, usage: { inputTokens: 100, outputTokens: 200 },
          } },
        ] } };
    expect(estimateCost(result, null)).toEqual({ knownUsd: 0, unknownCalls: 1, totalUsd: null });
    const prices = pricingSchema.parse({ currency: "USD", asOf: "2026-11-14", rates: [
      { provider, model, inputUsdPerMillion: 1, outputUsdPerMillion: 2 },
    ] });
    expect(estimateCost(result, prices)).toEqual({ knownUsd: 0.0005, unknownCalls: 0, totalUsd: 0.0005 });
  });
});
