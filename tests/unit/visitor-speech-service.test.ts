import { createHash } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const state = vi.hoisted(() => ({ rpc: vi.fn(), reuse: vi.fn(), synthesize: vi.fn(), upload: vi.fn(), signed: vi.fn(), record: vi.fn() }));
vi.mock("../../src/lib/api/db", () => ({ rpc: state.rpc }));
vi.mock("../../src/lib/supabase/worker", () => ({ createWorkerSupabase: () => ({ storage: { from: () => ({
  upload: state.upload, createSignedUrl: state.signed,
}) } }) }));
vi.mock("../../src/lib/storage/public-media", async original => ({
  ...await original<typeof import("../../src/lib/storage/public-media")>(), readPublicMedia: state.reuse,
}));
vi.mock("../../src/lib/ai/runtime", () => ({ createConfiguredSpeechProvider: () => ({ synthesize: state.synthesize }) }));
vi.mock("../../src/lib/ai/stores/publications", () => ({ createPublicationStore: () => ({}) }));
vi.mock("../../src/lib/ai/stores/visitor", () => ({ createSpeechSourceStore: () => ({}),
  createVisitorStore: () => ({ recordExecution: state.record }) }));
vi.mock("../../src/lib/ai/harness", () => ({ speakVerifiedReply: (_input: unknown,
  deps: { speech: { synthesize: (value: unknown) => Promise<unknown> } }) => deps.speech.synthesize({ text: "Answer" }) }));
import { speakVisitorAnswer } from "../../src/lib/ai/visitor-speech-service";
import { ApiError } from "../../src/lib/api/errors";

const input = { requestId: "dbe48811-59a8-4348-84c9-460687880e34", answerId: "dbe48811-59a8-4348-84c9-460687880e35" };
const session = "a".repeat(64);
const id = "dbe48811-59a8-4348-84c9-460687880e36";
const publication = { exhibitionId: id, artworkId: id, publicationId: id, version: 1 };
const reply = { ...input, answer: "Answer", outcome: "answered", publication, contextSequence: 1,
  inputMode: "text", outputMode: "voice", citations: [id], source: "generated", mock: true };
const audio = new Uint8Array([0xff, 0xfb, 0x10, 0xc4]);
const hash = (value: string | Uint8Array) => createHash("sha256").update(value).digest("hex");
const saved = { storageKey: `requests/${id}.mp3`, contentHash: hash(audio), byteSize: audio.length,
  contentType: "audio/mpeg", textHash: hash(reply.answer), publication, mock: true };
const claim = { id, claimed: true, status: "running", failureCode: null, result: null, mock: true,
  expiresAt: "2026-11-15T00:00:00Z" };
const ready = { ...claim, claimed: false, status: "succeeded", result: saved };
const binary = () => new Response(audio, { headers: { "Content-Type": "audio/mpeg" } });

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("AI_PROVIDER_MODE", "mock");
  state.upload.mockResolvedValue({ error: null });
  state.signed.mockResolvedValue({ data: { signedUrl: "https://storage.invalid/internal" } });
  state.synthesize.mockResolvedValue({ audio, contentType: "audio/mpeg", trace: { provider: "mock", model: "mock", mock: true },
    textHash: hash(reply.answer) });
  vi.stubGlobal("fetch", vi.fn().mockImplementation(async () => binary()));
  state.rpc.mockImplementation(async (worker, name, args) => {
    switch (name) {
      case "load_visitor_answer": return reply;
      case "reserve_visitor_voice": return claim;
      case "complete_visitor_voice": return args.p_failure_code
        ? { ...claim, status: "failed", claimed: false, failureCode: args.p_failure_code } : ready;
      case "load_visitor_voice": return saved;
      default: throw new Error(name);
    }
  });
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe("visitor speech", () => {
  it("records one provider call and serves bytes after checking the saved response twice", async () => {
    const response = await speakVisitorAnswer(input, session);
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(audio);
    expect(state.synthesize).toHaveBeenCalledOnce();
    expect(state.upload).toHaveBeenCalledWith(saved.storageKey, audio, { upsert: false, contentType: "audio/mpeg" });
    expect(state.rpc.mock.calls.filter(([, name]) => name === "load_visitor_voice")).toHaveLength(2);
    expect(state.record).toHaveBeenCalledWith(id, expect.arrayContaining([expect.objectContaining({ id: "voice.complete" })]),
      [expect.objectContaining({ provider: "mock" })], expect.any(Number));
  });

  it("returns the ready cache without provider spend or another write", async () => {
    state.rpc.mockImplementation(async (_worker, name) => name === "load_visitor_answer" ? reply : name === "reserve_visitor_voice" ? ready : saved);
    expect((await speakVisitorAnswer(input, session)).headers.get("content-type")).toBe("audio/mpeg");
    expect(state.synthesize).not.toHaveBeenCalled();
    expect(state.upload).not.toHaveBeenCalled();
  });

  it("reuses existing approved audio without reserving a synthesis request", async () => {
    state.rpc.mockResolvedValue({ ...reply, source: "approved_narration" });
    state.reuse.mockImplementation(async () => binary());
    expect((await speakVisitorAnswer(input, session)).headers.get("content-type")).toBe("audio/mpeg");
    expect(state.rpc.mock.calls.map(([, name]) => name)).toEqual(["load_visitor_answer", "load_visitor_answer"]);
    expect(state.synthesize).not.toHaveBeenCalled();
  });

  it("reuses live approved audio without a configured voice", async () => {
    vi.stubEnv("AI_PROVIDER_MODE", "live");
    vi.stubEnv("AI_TTS_PROVIDER", "typecast");
    vi.stubEnv("TYPECAST_VOICE_ID", "");
    state.rpc.mockResolvedValue({ ...reply, source: "approved_narration", mock: false });
    state.reuse.mockImplementation(async () => binary());
    expect((await speakVisitorAnswer(input, session)).headers.get("content-type")).toBe("audio/mpeg");
    expect(state.rpc.mock.calls.map(([, name]) => name)).toEqual(["load_visitor_answer", "load_visitor_answer"]);
    expect(state.synthesize).not.toHaveBeenCalled();
  });

  it("does not fall back to synthesis when the answer expires during approved audio reuse", async () => {
    state.rpc.mockResolvedValueOnce({ ...reply, source: "approved_narration" }).mockResolvedValueOnce(null);
    state.reuse.mockImplementation(async () => binary());
    await expect(speakVisitorAnswer(input, session)).rejects.toMatchObject({ status: 404 });
    expect(state.rpc.mock.calls.map(([, name]) => name)).toEqual(["load_visitor_answer", "load_visitor_answer"]);
  });

  it("cannot synthesize for an absent or foreign answer", async () => {
    state.rpc.mockResolvedValue(null);
    await expect(speakVisitorAnswer(input, session)).rejects.toMatchObject({ status: 404 });
    expect(state.synthesize).not.toHaveBeenCalled();
  });
  it("does not synthesize when an approved audio file exists but fails delivery or integrity checks", async () => {
    state.rpc.mockResolvedValue({ ...reply, source: "approved_narration" });
    state.reuse.mockRejectedValue(new ApiError(404, "NOT_FOUND", "invalid cached bytes"));
    await expect(speakVisitorAnswer(input, session)).rejects.toMatchObject({ status: 404 });
    expect(state.rpc.mock.calls.map(([, name]) => name)).toEqual(["load_visitor_answer"]);
    expect(state.synthesize).not.toHaveBeenCalled();
  });

  it("rejects an answer unpublished during delivery", async () => {
    state.rpc.mockImplementation(async (_worker, name) => name === "load_visitor_answer" ? reply : name === "reserve_visitor_voice" ? ready : saved);
    vi.stubGlobal("fetch", vi.fn().mockImplementation(async () => {
      state.rpc.mockResolvedValue(null);
      return binary();
    }));
    await expect(speakVisitorAnswer(input, session)).rejects.toMatchObject({ status: 404 });
  });

  it("settles provider failures without exposing provider error content", async () => {
    state.synthesize.mockRejectedValue(new ApiError(503, "PROVIDER_UNAVAILABLE", "failed"));
    await expect(speakVisitorAnswer(input, session)).rejects.toMatchObject({ status: 503, code: "PROVIDER_UNAVAILABLE" });
    expect(state.rpc).toHaveBeenCalledWith(expect.anything(), "complete_visitor_voice",
      expect.objectContaining({ p_id: id, p_failure_code: "PROVIDER_UNAVAILABLE", p_result: null }));
    expect(state.upload).not.toHaveBeenCalled();
  });
});
