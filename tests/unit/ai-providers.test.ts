import { describe, expect, it, vi } from "vitest";
import {
  getLinerTextConfig,
  getOpenAiSpeechConfig,
  getOpenAiTextConfig,
  getOpenAiTranscriptionConfig,
  getTypecastSpeechConfig,
} from "@/lib/ai/config";
import {
  createLinerTextProvider,
  createOpenAiSpeechProvider,
  createOpenAiTextProvider,
  createOpenAiTranscriptionProvider,
  createTypecastSpeechProvider,
} from "@/lib/ai/providers";
import { MAX_RECORDING_BYTES } from "@/lib/ai/providers/openai";
import type { AiTextRequest } from "@/lib/ai/providers/types";

vi.mock("server-only", () => ({}));

const openAiConfig = getOpenAiTextConfig({ OPENAI_API_KEY: "test-openai-key" });
const linerConfig = getLinerTextConfig({ LINER_API_KEY: "test-liner-key" });
const typecastConfig = getTypecastSpeechConfig({ TYPECAST_API_KEY: "test-typecast-key", TYPECAST_VOICE_ID: "tc_example" });
const sttConfig = getOpenAiTranscriptionConfig({ OPENAI_API_KEY: "test-openai-key" });
const openAiSpeechConfig = getOpenAiSpeechConfig({ OPENAI_API_KEY: "test-openai-key" });

const textRequest: AiTextRequest = {
  system: "승인된 작품 설명을 바탕으로 JSON을 작성한다.",
  input: '{"question":"작품의 재료는 무엇인가요?"}',
  schema: {
    name: "artwork_reply",
    definition: {
      type: "object",
      properties: { answer: { type: "string" } },
      required: ["answer"],
      additionalProperties: false,
    },
  },
};
const answer = { answer: "한지를 사용했습니다." };
const speech = "  한지를 사용했습니다. ";
const mp3 = new Uint8Array([0x49, 0x44, 0x33, 0x04, 0, 0, 0, 0, 0, 0, 0xff, 0xfb, 0x10, 0]);

function openAiOutput(part: unknown = { type: "output_text", text: JSON.stringify(answer) }) {
  return {
    status: "completed",
    output: [
      { type: "reasoning", summary: [] },
      { type: "message", role: "assistant", status: "completed", content: [part] },
    ],
  };
}

function mockFetch(response: Response) {
  return vi.fn<typeof fetch>().mockResolvedValue(response);
}

describe("AI provider configuration", () => {
  it("loads per-capability defaults and permits explicit model and voice configuration", () => {
    expect(getOpenAiTextConfig({ OPENAI_API_KEY: " test ", OPENAI_QA_MODEL: "gpt-example" }))
      .toEqual({ apiKey: "test", model: "gpt-example" });
    expect(getLinerTextConfig({ LINER_API_KEY: "liner-test" }).model).toBe("openai/gpt-6.1-sol");
    expect(sttConfig.model).toBe("gpt-transcribe");
    expect(typecastConfig).toEqual({ apiKey: "test-typecast-key", model: "ssfm-v31", voiceId: "tc_example" });
    expect(openAiSpeechConfig).toEqual({ apiKey: "test-openai-key", model: "gpt-4o-mini-tts", voice: "coral" });
    expect(getOpenAiSpeechConfig({ OPENAI_API_KEY: "test", OPENAI_TTS_MODEL: "gpt-4o-mini-tts-2025-12-15", OPENAI_TTS_VOICE: "alloy" }))
      .toMatchObject({ model: "gpt-4o-mini-tts-2025-12-15", voice: "alloy" });
  });

  it("requires the selected provider's credentials and voice without exposing bad values", () => {
    expect(() => getLinerTextConfig({ OPENAI_API_KEY: "test" })).toThrow(expect.objectContaining({ code: "not_configured" }));
    expect(() => getTypecastSpeechConfig({ TYPECAST_API_KEY: "test-typecast-key" }))
      .toThrow(expect.objectContaining({ code: "not_configured" }));
    expect(() => getOpenAiTextConfig({ OPENAI_API_KEY: "secret\nkey" }))
      .toThrow(expect.objectContaining({ code: "not_configured", message: "AI 서비스 연결을 준비하고 있습니다." }));
  });
});

describe("AI text providers", () => {
  it("calls OpenAI Responses with a strict schema, low reasoning, and no response storage", async () => {
    const fetch = mockFetch(Response.json({
      ...openAiOutput(),
      model: "gpt-6-luna-2026-11-01",
      usage: { input_tokens: 42, output_tokens: 13, total_tokens: 55, extra: "ignored" },
    }));
    const result = await createOpenAiTextProvider(openAiConfig, { fetch }).generate(textRequest);
    expect(result).toEqual({
      output: answer,
      trace: { provider: "openai", model: "gpt-6-luna-2026-11-01", usage: { inputTokens: 42, outputTokens: 13, totalTokens: 55 } },
    });
    expect(fetch).toHaveBeenCalledExactlyOnceWith("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { Authorization: "Bearer test-openai-key", "Content-Type": "application/json" },
      body: expect.any(String),
      signal: expect.any(AbortSignal),
      cache: "no-store",
      redirect: "error",
    });
    expect(JSON.parse(String(fetch.mock.calls[0][1]?.body))).toEqual({
      model: "gpt-6-luna",
      instructions: textRequest.system,
      input: textRequest.input,
      reasoning: { effort: "low" },
      max_output_tokens: 1600,
      store: false,
      text: { format: { type: "json_schema", name: textRequest.schema.name, schema: textRequest.schema.definition, strict: true } },
    });
  });

  it("uses Liner's structured Chat Completions format and normalized token counts", async () => {
    const fetch = mockFetch(Response.json({
      model: "openai/gpt-6.1-sol",
      choices: [{ finish_reason: "stop", message: { role: "assistant", content: JSON.stringify(answer) } }],
      usage: { prompt_tokens: 20, completion_tokens: 15, total_tokens: 35 },
    }));
    const result = await createLinerTextProvider(linerConfig, { fetch }).generate(textRequest);
    expect(result).toEqual({
      output: answer,
      trace: { provider: "liner", model: "openai/gpt-6.1-sol", usage: { inputTokens: 20, outputTokens: 15, totalTokens: 35 } },
    });
    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe("https://platform.liner.com/api/v1/chat/completions");
    expect(init?.headers).toMatchObject({ Authorization: "Bearer test-liner-key" });
    expect(JSON.parse(String(init?.body))).toEqual({
      model: "openai/gpt-6.1-sol",
      messages: [{ role: "system", content: textRequest.system }, { role: "user", content: textRequest.input }],
      max_completion_tokens: 4096,
      store: false,
      response_format: {
        type: "json_schema",
        json_schema: { name: textRequest.schema.name, schema: textRequest.schema.definition, strict: true },
      },
    });
  });

  it.each([
    ["incomplete", { ...openAiOutput(), status: "incomplete", incomplete_details: { reason: "max_output_tokens" } }],
    ["refused", openAiOutput({ type: "refusal", refusal: "private error" })],
    ["invalid_response", openAiOutput({ type: "output_text", text: "{unfinished" })],
    ["invalid_response", { status: "completed", output_text: JSON.stringify(answer) }],
    ["invalid_response", { ...openAiOutput(), output: [{ type: "function_call", name: "unrequested" }] }],
  ])("rejects OpenAI response with %s", async (code, body) => {
    const fetch = mockFetch(Response.json(body));
    await expect(createOpenAiTextProvider(openAiConfig, { fetch }).generate(textRequest))
      .rejects.toMatchObject({ code, retryable: false });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["incomplete", "length", { role: "assistant", content: JSON.stringify(answer) }],
    ["refused", "stop", { role: "assistant", refusal: "private error" }],
    ["refused", "content_filter", { role: "assistant", content: "" }],
    ["invalid_response", "tool_calls", { role: "assistant", content: JSON.stringify(answer) }],
  ])("rejects Liner response with %s", async (code, finish_reason, message) => {
    const fetch = mockFetch(Response.json({ choices: [{ finish_reason, message }] }));
    await expect(createLinerTextProvider(linerConfig, { fetch }).generate(textRequest))
      .rejects.toMatchObject({ code, retryable: false });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("drops invalid trace values and never exposes the upstream key through the response model", async () => {
    const fetch = mockFetch(Response.json({
      ...openAiOutput(),
      model: "model/test-openai-key",
      usage: { input_tokens: "120", output_tokens: -3, total_tokens: 4 },
    }));
    await expect(createOpenAiTextProvider(openAiConfig, { fetch }).generate(textRequest))
      .resolves.toMatchObject({ trace: { model: "gpt-6-luna", usage: { totalTokens: 4 } } });
  });
});

describe("AI audio providers", () => {
  const audio = new Blob([new Uint8Array([1, 2, 3])], { type: "audio/webm" });

  it("submits audio as multipart and returns editable text", async () => {
    const fetch = mockFetch(Response.json({ text: " 한지를 사용했나요? ", usage: { input_tokens: 5, output_tokens: 2 } }));
    const result = await createOpenAiTranscriptionProvider(sttConfig, { fetch })
      .transcribe({ audio, filename: "visitor-private-name.webm", language: "ko" });
    expect(result).toEqual({
      text: "한지를 사용했나요?",
      trace: { provider: "openai", model: "gpt-transcribe", usage: { inputTokens: 5, outputTokens: 2 } },
    });
    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe("https://api.openai.com/v1/audio/transcriptions");
    expect(init?.headers).toEqual({ Authorization: "Bearer test-openai-key" });
    const multipart = init?.body as FormData;
    expect(multipart.get("model")).toBe("gpt-transcribe");
    expect(multipart.get("response_format")).toBe("json");
    expect(multipart.getAll("languages[]")).toEqual(["ko"]);
    expect(multipart.get("file")).toMatchObject({ name: "recording.webm", size: 3, type: "audio/webm" });
  });

  it("provides format metadata for raw audio bytes from a server file", async () => {
    const fetch = mockFetch(Response.json({ text: "" }));
    const provider = createOpenAiTranscriptionProvider(sttConfig, { fetch });
    await expect(provider.transcribe({ audio: new Blob([audio]), filename: "Example.WAV" }))
      .resolves.toMatchObject({ text: "" });
    const multipart = fetch.mock.calls[0][1]?.body as FormData;
    expect(multipart.get("file")).toMatchObject({ name: "recording.wav", type: "audio/wav" });
  });

  it("bounds recordings and returned transcript text", async () => {
    const fetch = mockFetch(Response.json({ text: "한".repeat(4001) }));
    const provider = createOpenAiTranscriptionProvider(sttConfig, { fetch });
    await expect(provider.transcribe({ audio: new Blob([new Uint8Array(MAX_RECORDING_BYTES + 1)]), filename: "recording.wav" }))
      .rejects.toMatchObject({ code: "invalid_input" });
    await expect(provider.transcribe({ audio, filename: "recording.html" }))
      .rejects.toMatchObject({ code: "invalid_input" });
    expect(fetch).not.toHaveBeenCalled();
    await expect(provider.transcribe({ audio, filename: "recording.webm" }))
      .rejects.toMatchObject({ code: "invalid_response" });
  });

  it("calls Typecast using its voice ID and preserves the exact input text", async () => {
    const fetch = mockFetch(new Response(mp3, { headers: { "content-type": "audio/mpeg" } }));
    await expect(createTypecastSpeechProvider(typecastConfig, { fetch }).synthesize({ text: speech }))
      .resolves.toEqual({ audio: mp3, contentType: "audio/mpeg", trace: { provider: "typecast", model: "ssfm-v31" } });
    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe("https://api.typecast.ai/v1/text-to-speech");
    expect(init?.headers).toMatchObject({ "X-API-KEY": "test-typecast-key" });
    expect(JSON.parse(String(init?.body))).toEqual({
      voice_id: "tc_example", model: "ssfm-v31", text: speech, output: { audio_format: "mp3" },
    });
  });

  it("can explicitly call the temporary OpenAI speech fallback", async () => {
    const fetch = mockFetch(new Response(mp3, { headers: { "content-type": "application/octet-stream" } }));
    await expect(createOpenAiSpeechProvider(openAiSpeechConfig, { fetch }).synthesize({ text: speech }))
      .resolves.toEqual({ audio: mp3, contentType: "audio/mpeg", trace: { provider: "openai", model: "gpt-4o-mini-tts" } });
    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe("https://api.openai.com/v1/audio/speech");
    expect(JSON.parse(String(init?.body))).toEqual({
      model: "gpt-4o-mini-tts", voice: "coral", input: speech, response_format: "mp3",
    });
  });

  it("does not switch providers when Typecast rejects speech", async () => {
    const fetch = mockFetch(Response.json({ message: "test-typecast-key" }, { status: 402 }));
    const provider = createTypecastSpeechProvider(typecastConfig, { fetch });
    await expect(provider.synthesize({ text: "한".repeat(2001) })).rejects.toMatchObject({ code: "invalid_input" });
    expect(fetch).not.toHaveBeenCalled();
    await expect(provider.synthesize({ text: speech })).rejects.toMatchObject({ code: "provider_rejected", retryable: false });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch.mock.calls[0][0]).toBe("https://api.typecast.ai/v1/text-to-speech");
  });

  it("rejects empty, mislabeled, and malformed speech responses", async () => {
    for (const response of [
      new Response(null, { headers: { "content-type": "audio/mpeg" } }),
      new Response(mp3, { headers: { "content-type": "audio/wav" } }),
      new Response("not an MP3", { headers: { "content-type": "audio/mpeg" } }),
    ]) {
      const provider = createTypecastSpeechProvider(typecastConfig, { fetch: mockFetch(response) });
      await expect(provider.synthesize({ text: speech })).rejects.toMatchObject({ code: "invalid_response" });
    }
  });
});

describe("AI provider transport", () => {
  it.each([
    [429, "rate_limited", true],
    [503, "provider_unavailable", true],
    [401, "provider_rejected", false],
    [500, "provider_rejected", false],
  ])("normalizes HTTP %s and sends exactly one request", async (status, code, retryable) => {
    const cancel = vi.fn();
    const fetch = mockFetch(new Response(new ReadableStream({ cancel }), { status }));
    await expect(createOpenAiTextProvider(openAiConfig, { fetch }).generate(textRequest))
      .rejects.toMatchObject({ code, retryable });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(cancel).toHaveBeenCalledTimes(1);
  });

  it("does not expose request information from transport errors", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockRejectedValue(new Error("test-openai-key, private prompt"));
    await expect(createOpenAiTextProvider(openAiConfig, { fetch }).generate(textRequest))
      .rejects.toMatchObject({ code: "network_error", retryable: false, message: "AI 서비스와 통신하는 중 오류가 발생했습니다." });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("rejects an oversized request before dispatch", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>();
    await expect(createOpenAiTextProvider(openAiConfig, { fetch }).generate({ ...textRequest, input: "한".repeat(45_000) }))
      .rejects.toMatchObject({ code: "invalid_input" });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("bounds declared and streamed response byte counts", async () => {
    const declared = new Response("a", { headers: { "content-type": "application/json", "content-length": "500000" } });
    const cancel = vi.fn();
    const streamed = new Response(new ReadableStream({
      start(controller) {
        controller.enqueue(new Uint8Array(128 * 1024));
        controller.enqueue(new Uint8Array(128 * 1024 + 1));
      },
      cancel,
    }), { headers: { "content-type": "application/json" } });
    for (const response of [declared, streamed]) {
      await expect(createOpenAiTextProvider(openAiConfig, { fetch: mockFetch(response) }).generate(textRequest))
        .rejects.toMatchObject({ code: "response_too_large" });
    }
    expect(cancel).toHaveBeenCalledTimes(1);
  });

  it("rejects malformed JSON or the wrong content type", async () => {
    for (const response of [
      new Response("{bad JSON", { headers: { "content-type": "application/json" } }),
      new Response(JSON.stringify(openAiOutput()), { headers: { "content-type": "text/html" } }),
    ]) {
      await expect(createOpenAiTextProvider(openAiConfig, { fetch: mockFetch(response) }).generate(textRequest))
        .rejects.toMatchObject({ code: "invalid_response" });
    }
  });

  it("propagates cancellation through reading a stalled body", async () => {
    const controller = new AbortController();
    const cancel = vi.fn();
    const response = new Response(new ReadableStream({ cancel }), { headers: { "content-type": "application/json" } });
    const fetch = mockFetch(response);
    const result = createOpenAiTextProvider(openAiConfig, { fetch }).generate({ ...textRequest, signal: controller.signal });
    await Promise.resolve();
    expect(response.body?.locked).toBe(true);
    controller.abort("private abort reason");
    await expect(result).rejects.toMatchObject({ code: "cancelled", retryable: false });
    expect(fetch.mock.calls[0][1]?.signal?.aborted).toBe(true);
    expect(cancel).toHaveBeenCalledTimes(1);
  });

  it("applies the deadline to fetch and response body reads", async () => {
    const noHeaders = vi.fn<typeof globalThis.fetch>(() => new Promise(() => {}));
    const cancel = vi.fn();
    const noBody = mockFetch(new Response(new ReadableStream({ cancel }), { headers: { "content-type": "application/json" } }));
    for (const fetch of [noHeaders, noBody]) {
      const provider = createOpenAiTextProvider(openAiConfig, { fetch, timeoutMs: 5 });
      await expect(provider.generate(textRequest)).rejects.toMatchObject({ code: "timeout", retryable: false });
      expect(fetch).toHaveBeenCalledTimes(1);
      expect(fetch.mock.calls[0][1]?.signal?.aborted).toBe(true);
    }
    expect(cancel).toHaveBeenCalledTimes(1);
  });

  it("does not dispatch with an already-aborted signal", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>();
    const provider = createOpenAiTextProvider(openAiConfig, { fetch });
    await expect(provider.generate({ ...textRequest, signal: AbortSignal.abort("private") }))
      .rejects.toMatchObject({ code: "cancelled", retryable: false });
    expect(fetch).not.toHaveBeenCalled();
  });
});
