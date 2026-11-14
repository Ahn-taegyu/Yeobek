import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));

import { ApiError } from "@/lib/api/errors";
import type { NarrationResult } from "@/lib/ai/narration";
import { assertIndependentJudge, resolveAiRoute } from "@/lib/ai/routing";
import { createConfiguredSpeechProvider, createConfiguredTextProvider, createConfiguredTranscriptionProvider,
  createArtistKnowledgeRuntime, createDocentRuntime, createNarrationRuntime } from "@/lib/ai/runtime";
import { createMockSpeechProvider } from "@/lib/ai/providers/mock";
import { answerJsonSchema } from "@/lib/ai/contracts";
import { ids, syntheticPublication, syntheticRequest } from "../fixtures/ai";

afterEach(() => vi.unstubAllEnvs());
const key = "synthetic-test-key";
const liner = { LINER_API_KEY: key };
const textRequest = { system: "test system", input: "{}", schema: answerJsonSchema };
const completion = (content: string) => Response.json({
  choices: [{ finish_reason: "stop", message: { role: "assistant", content, reasoning_content: "ignored" } }],
  usage: { prompt_tokens: 9, completion_tokens: 5, total_tokens: 14 },
});
const notConfigured = expect.objectContaining({ code: "not_configured" });

describe("AI capability routes", () => {
  it("uses one docent model for drafts and all QA consumers and rejects stale conflicting aliases", () => {
    for (const env of [{}, { AI_ROUTE_DOCENT: "liner:google/gemini-3.8-flash" },
      { AI_ROUTE_QA: "liner:openai/gpt-6-luna" }, { AI_ROUTE_DRAFT: "liner:openai/gpt-6-luna" },
      { LINER_DRAFT_MODEL: "openai/gpt-6-luna" }]) {
      expect(resolveAiRoute("draft", env)).toEqual(resolveAiRoute("qa", env));
    }
    for (const capability of ["qa", "draft"] as const) {
      expect(() => resolveAiRoute(capability, { AI_ROUTE_DRAFT: "liner:openai/gpt-6.1-sol", AI_ROUTE_QA: "liner:openai/gpt-6-luna" })).toThrow(notConfigured);
      expect(() => resolveAiRoute(capability, { AI_ROUTE_DOCENT: "liner:google/gemini-3.8-flash", AI_ROUTE_QA: "liner:openai/gpt-6-luna" })).toThrow(notConfigured);
    }
    expect(() => assertIndependentJudge({ AI_ROUTE_DOCENT: "liner:google/gemini-3.8-flash",
      AI_ROUTE_JUDGE: "liner:google/gemini-3.7-flash" })).toThrow(notConfigured);
  });
  it("defaults to partner routes and requires a catalog model and voice for speech", () => {
    for (const route of ["draft", "organize", "automation", "judge", "qa", "stt"] as const) {
      expect(resolveAiRoute(route, {}).provider).toBe("liner");
    }
    expect(() => createConfiguredSpeechProvider(undefined, liner)).toThrow(notConfigured);
    expect(() => createConfiguredSpeechProvider(undefined, { ...liner, AI_ROUTE_TTS: "liner:fixture/speech" })).toThrow(notConfigured);
    expect(() => resolveAiRoute("qa", { AI_ROUTE_QA: "typecast:fixture" })).toThrow(notConfigured);
    expect(() => resolveAiRoute("automation", { AI_ROUTE_AUTOMATION: "openai:fixture" })).toThrow(notConfigured);
    expect(() => resolveAiRoute("qa", { AI_ROUTE_QA: "liner" })).toThrow(notConfigured);
    expect(resolveAiRoute("qa", { AI_ROUTE_QA: "liner:fixture/model:free" }).model).toBe("fixture/model:free");
  });

  it("requires separate upstream families for draft and judge across different gateways", () => {
    expect(() => assertIndependentJudge({})).not.toThrow();
    expect(() => assertIndependentJudge({ AI_ROUTE_JUDGE: "openai:gpt-6-luna" })).toThrow(notConfigured);
    expect(() => assertIndependentJudge({ AI_ROUTE_JUDGE: "liner:liner-mark" })).toThrow(notConfigured);
    expect(() => assertIndependentJudge({ AI_ROUTE_JUDGE: "liner:google/opaque" })).toThrow(notConfigured);
    expect(() => assertIndependentJudge({ AI_ROUTE_JUDGE: "exaone:k-exaone_v2.5" })).not.toThrow();
  });

  it("routes the same QA request to Liner or EXAONE and parses each response", async () => {
    const linerFetch = vi.fn<typeof fetch>().mockResolvedValueOnce(completion('{"answer":"ok"}'));
    const exaoneFetch = vi.fn<typeof fetch>().mockResolvedValueOnce(completion(' \n{"answer":"ok"}'));
    expect((await createConfiguredTextProvider("qa", { fetch: linerFetch }, liner).generate(textRequest)).trace.provider).toBe("liner");
    const provider = createConfiguredTextProvider("qa", { fetch: exaoneFetch },
      { AI_ROUTE_QA: "exaone:k-exaone_v2.5", EXAONE_API_KEY: key });
    expect(await provider.generate(textRequest)).toEqual({ output: { answer: "ok" },
      trace: { provider: "exaone", model: "k-exaone_v2.5", usage: { inputTokens: 9, outputTokens: 5, totalTokens: 14 } } });
    expect(exaoneFetch.mock.calls[0][0]).toBe("https://api.exaone.ai/v1/chat/completions");
    const request = JSON.parse(String(exaoneFetch.mock.calls[0][1]?.body));
    expect(request).toMatchObject({ model: "k-exaone_v2.5", max_tokens: 4096, reasoning_effort: "low", stream: false });
    expect(request).not.toHaveProperty("response_format");
    expect(request.messages[0].content).toContain(JSON.stringify(textRequest.schema.definition));
    exaoneFetch.mockResolvedValueOnce(completion("unstructured text"));
    await expect(provider.generate(textRequest)).rejects.toMatchObject({ code: "invalid_response" });
  });

  it("uses documented Liner audio formats and returns bounded response types", async () => {
    const transcribeFetch = vi.fn<typeof fetch>().mockResolvedValueOnce(Response.json({ text: " 테스트 " }));
    const transcription = createConfiguredTranscriptionProvider({ fetch: transcribeFetch }, liner);
    const recording = new Blob([new Uint8Array([1, 2])]);
    expect(await transcription.transcribe({ audio: recording, filename: "private.webm", language: "ko" }))
      .toMatchObject({ text: "테스트", trace: { provider: "liner" } });
    const [transcribeUrl, transcribeInit] = transcribeFetch.mock.calls[0];
    const form = transcribeInit?.body as FormData;
    expect(transcribeUrl).toBe("https://platform.liner.com/api/v1/audio/transcriptions");
    expect(transcribeInit?.headers).toEqual({ Authorization: `Bearer ${key}` });
    expect(form.get("file")).toMatchObject({ name: "recording.webm", type: "audio/webm" });
    expect(Object.fromEntries(form)).toMatchObject({ model: "openai/whisper-1", language: "ko", response_format: "json" });
    await expect(transcription.transcribe({ audio: recording, filename: "private.mp4" })).rejects.toMatchObject({ code: "invalid_input" });
    expect(transcribeFetch).toHaveBeenCalledTimes(1);

    const bytes = Uint8Array.from([0xff, 0xfb, 0x10, 0xc4]);
    const speakFetch = vi.fn<typeof fetch>().mockResolvedValueOnce(new Response(bytes, { headers: { "Content-Type": "audio/mpeg" } }));
    const speech = createConfiguredSpeechProvider({ fetch: speakFetch },
      { ...liner, AI_ROUTE_TTS: "liner:fixture/speech", LINER_TTS_VOICE: "fixture-voice" });
    expect(await speech.synthesize({ text: "시험" })).toMatchObject({ audio: bytes, contentType: "audio/mpeg", trace: { provider: "liner" } });
    const [speakUrl, speakInit] = speakFetch.mock.calls[0];
    expect(speakUrl).toBe("https://platform.liner.com/api/v1/audio/speech");
    expect(JSON.parse(String(speakInit?.body))).toEqual({ model: "fixture/speech", voice: "fixture-voice", input: "시험", response_format: "mp3" });
    speakFetch.mockResolvedValueOnce(new Response(bytes, { headers: { "Content-Type": "audio/pcm" } }));
    await expect(speech.synthesize({ text: "시험" })).rejects.toMatchObject({ code: "invalid_response" });
  });

  it("rejects mock mode and direct mock construction in production", async () => {
    vi.stubEnv("AI_PROVIDER_MODE", "mock");
    vi.stubEnv("NODE_ENV", "production");
    expect(() => resolveAiRoute("qa")).toThrow(notConfigured);
    expect(() => createMockSpeechProvider()).toThrow(notConfigured);
    expect(() => createConfiguredSpeechProvider(undefined, { AI_PROVIDER_MODE: "mock", NODE_ENV: "test" })).toThrow(notConfigured);
    const runtime = createNarrationRuntime(ids.owner, { loadOwnedContext: async () => null });
    expect(await runtime.draft({ documentId: ids.other, expectedRevision: 1, strategy: "single" }))
      .toMatchObject({ status: "abstained", failure: { code: "SERVER_CONFIGURATION_ERROR", routing: "operator" } });
  });

  it("replays before reading malformed provider or feature configuration", async () => {
    vi.stubEnv("AI_PROVIDER_MODE", "unknown");
    vi.stubEnv("FEATURE_FOLLOW_UP_QUESTIONS", "unknown");
    const replay = new Error("stored job replay");
    const reserve = vi.fn(async () => { throw replay; });
    const complete = vi.fn();
    const loadOwnedContext = vi.fn();
    const runtime = createNarrationRuntime(ids.owner, { loadOwnedContext }, { reserve, complete });
    await expect(runtime.draft({ documentId: ids.other, expectedRevision: 1, strategy: "single" })).rejects.toBe(replay);
    expect(reserve).toHaveBeenCalledOnce();
    expect(loadOwnedContext).not.toHaveBeenCalled();
    expect(complete).not.toHaveBeenCalled();
  });

  it("preserves a transient post-reservation RPC failure in the job completion", async () => {
    vi.stubEnv("AI_PROVIDER_MODE", "mock");
    vi.stubEnv("NODE_ENV", "test");
    const failure = new ApiError(503, "SERVICE_UNAVAILABLE", "transient store error");
    const loadOwnedContext = vi.fn(async () => { throw failure; });
    const reserve = vi.fn(async () => {});
    const complete = vi.fn<(result: NarrationResult) => Promise<void>>(async () => {});
    const runtime = createNarrationRuntime(ids.owner, { loadOwnedContext }, { reserve, complete });
    expect(await runtime.draft({ documentId: ids.other, expectedRevision: 1, strategy: "single" }))
      .toMatchObject({ status: "abstained", mock: true });
    expect(complete).toHaveBeenCalledOnce();
    expect(complete.mock.calls[0][0]).toMatchObject({
      failure: { status: 503, code: "SERVICE_UNAVAILABLE", routing: "operator", retryable: true },
    });
  });

  it("uses the injected mock environment consistently and validates recording input", async () => {
    const env = { AI_PROVIDER_MODE: "mock", NODE_ENV: "test" };
    const text = createConfiguredTextProvider("qa", undefined, env);
    expect(await text.generate(textRequest)).toMatchObject({ output: { outcome: "insufficient_evidence" }, trace: { mock: true } });
    const stt = createConfiguredTranscriptionProvider(undefined, env);
    const audio = new Blob(["audio"]);
    expect(await stt.transcribe({ audio, filename: "fixture.webm", language: "ko" })).toMatchObject({ trace: { mock: true } });
    await expect(stt.transcribe({ audio, filename: "fixture.txt" })).rejects.toMatchObject({ code: "invalid_input" });
    await expect(stt.transcribe({ audio: new Blob([new Uint8Array(3 * 1024 * 1024 + 1)]), filename: "fixture.webm" }))
      .rejects.toMatchObject({ code: "invalid_input" });
  });

  it("runs grounded chat and narration through their validators in mock mode without a network call", async () => {
    vi.stubEnv("AI_PROVIDER_MODE", "mock");
    vi.stubEnv("NODE_ENV", "test");
    const publication = syntheticPublication();
    const recordUsage = vi.fn();
    const runtime = createDocentRuntime({ load: async () => publication, isCurrent: async () => true },
      { loadAnswer: async () => null }, undefined, recordUsage);
    const grounded = await runtime.answer(syntheticRequest());
    expect(grounded).toMatchObject({ outcome: "answered", mock: true, citations: [ids.evidence], answer: publication.evidence[0].body });
    // The answer and its single evidence review are both recorded.
    expect(recordUsage).toHaveBeenCalledTimes(2);
    for (const [usage] of recordUsage.mock.calls) expect(usage).toMatchObject({ provider: "mock", mock: true });
    expect(grounded).not.toHaveProperty("usage");
    await runtime.answer(syntheticRequest({ intent: "narration" }));
    expect(recordUsage).toHaveBeenCalledTimes(2); // Stored narration does not claim a model call.
    expect(await runtime.answer(syntheticRequest({ question: "보관 장소는 어디인가요?" })))
      .toMatchObject({ outcome: "insufficient_evidence", mock: true, citations: [] });

    const source = { id: ids.evidence, ownerId: ids.owner, artistId: ids.other, subjectType: "artwork", subjectId: ids.artwork,
      exhibitionId: ids.exhibition, revision: 1, text: publication.evidence[0].body,
      ref: { kind: "direct", sectionId: "description" } };
    const context = { documentId: ids.other, ownerId: ids.owner, artistId: ids.other, subjectType: "artwork", subjectId: ids.artwork,
      exhibitionId: ids.exhibition, revision: 1, sections: [], sourceRefs: [], sources: [source] };
    const author = createNarrationRuntime(ids.owner, { loadOwnedContext: async () => context });
    expect(await author.draft({ documentId: ids.other, expectedRevision: 1, strategy: "single" }))
      .toMatchObject({ status: "selected", mock: true, selected: { citations: [ids.evidence] },
        metrics: { calls: [{ trace: { mock: true } }, { trace: { mock: true } }] } });
    const organize = createArtistKnowledgeRuntime(ids.owner, { loadOwnedContext: async () => context,
      storeProposal: async () => {}, loadOwnedProposal: async () => null, commitOwnedProposal: async () => ({ documentRevision: 2 }) });
    expect(await organize.propose({ documentId: ids.other, expectedRevision: 1 })).toMatchObject({
      mock: true, proposal: { sections: [{ id: "description", body: source.text }] },
    });
    expect(await createConfiguredSpeechProvider().synthesize({ text: grounded.answer }))
      .toMatchObject({ contentType: "audio/mpeg", trace: { mock: true } });
  });
});
