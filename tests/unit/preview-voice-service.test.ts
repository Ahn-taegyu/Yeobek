import { afterEach, beforeEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const state = vi.hoisted(() => ({ rpc: vi.fn(), transcribe: vi.fn(), synthesize: vi.fn(), answer: vi.fn(), identity: vi.fn() }));
vi.mock("../../src/lib/api/db", () => ({ rpc: state.rpc }));
vi.mock("../../src/lib/supabase/worker", () => ({ createWorkerSupabase: () => ({}) }));
vi.mock("../../src/lib/ai/runtime", () => ({ createConfiguredTranscriptionProvider: () => ({ transcribe: state.transcribe }), createConfiguredSpeechProvider: () => ({ synthesize: state.synthesize }) }));
vi.mock("../../src/lib/ai/preview-service", () => ({ loadPreviewAnswer: state.answer }));
vi.mock("../../src/lib/ai/voice", () => ({ speechIdentity: state.identity }));
import { speakPreview, transcribePreview } from "../../src/lib/ai/preview-voice-service";
const owner = "dbe48811-59a8-4348-84c9-460687880e36";
const input = { requestId: "dbe48811-59a8-4348-84c9-460687880e37", exhibitionId: "dbe48811-59a8-4348-84c9-460687880e38", filename: "recording.wav", file: new File(["audio"], "recording.wav", { type: "audio/wav" }) };
const answerId = "dbe48811-59a8-4348-84c9-460687880e39";
const reply = { requestId: input.requestId, transcript: "인식 결과", mock: true };
const claim = { id: owner, claimed: true, status: "running", failureCode: null, mock: true };
let reserved: { id: string; claimed: boolean; status: "running" | "succeeded" | "failed"; failureCode: string | null; mock: boolean };
let loaded: unknown;
const calls = (name: string) => state.rpc.mock.calls.filter(([, called]) => called === name);
beforeEach(() => {
  vi.resetAllMocks(); vi.stubEnv("AI_PROVIDER_MODE", "mock"); reserved = claim;
  loaded = { result: reply, audio: null, mock: true };
  state.transcribe.mockResolvedValue({ text: reply.transcript, trace: { mock: true } });
  state.identity.mockReturnValue({ mock: true, fingerprint: "voice" });
  state.synthesize.mockResolvedValue({ audio: Uint8Array.from([73,68,51,0,0,0,0,0,0,0]), contentType: "audio/mpeg", trace: { mock: true } });
  state.answer.mockResolvedValue({ status: "succeeded", exhibitionId: input.exhibitionId, result: { answer: "답변" } });
  state.rpc.mockImplementation(async (_worker, name) => {
    if (name === "reserve_preview_voice") return reserved;
    if (name === "complete_preview_voice") return { status: "succeeded", failureCode: null };
    if (name === "load_preview_voice") return loaded;
    throw new Error(name);
  });
});
afterEach(() => vi.unstubAllEnvs());
it("replays a transcript without another provider call or storing recording bytes", async () => {
  expect(await transcribePreview(owner, input)).toEqual({ ...reply, overLimit: false });
  reserved = { ...claim, claimed: false, status: "succeeded" };
  expect(await transcribePreview(owner, input)).toEqual({ ...reply, overLimit: false });
  expect(state.transcribe).toHaveBeenCalledOnce();
  expect(calls("reserve_preview_voice")[0][2]).toMatchObject({ p_kind: "transcription", p_hash: expect.stringMatching(/^[a-f0-9]{64}$/) });
  expect(calls("complete_preview_voice")[0][2]).toMatchObject({ p_result: reply, p_audio: null });
});
it("settles cancellation after a late reservation without invoking the provider", async () => {
  const controller = new AbortController();
  state.rpc.mockImplementation(async (_worker, name) => { if (name === "reserve_preview_voice") { controller.abort(); return claim; } return {}; });
  await expect(transcribePreview(owner, input, controller.signal)).rejects.toMatchObject({ code: "REQUEST_CANCELLED" });
  expect(state.transcribe).not.toHaveBeenCalled();
  expect(calls("complete_preview_voice")[0][2]).toMatchObject({ p_failure: "REQUEST_CANCELLED", p_audio: null, p_result: null });
});
it("replays failed reservations without provider calls", async () => {
  reserved = { ...claim, claimed: false, status: "failed", failureCode: "REQUEST_TIMEOUT" };
  await expect(transcribePreview(owner, input)).rejects.toMatchObject({ code: "PREVIEW_VOICE_FAILED", status: 504 });
  expect(state.transcribe).not.toHaveBeenCalled();
});
it("returns private speech bytes only after rechecking the answer", async () => {
  loaded = { result: null, audio: Buffer.from([73,68,51,0,0,0,0,0,0,0]).toString("base64"), mock: true };
  const response = await speakPreview({} as never, owner, answerId, input.requestId);
  expect(response.headers.get("Content-Type")).toBe("audio/mpeg");
  expect((await response.arrayBuffer()).byteLength).toBe(10);
  expect(state.answer).toHaveBeenCalledTimes(2);
  expect(calls("complete_preview_voice")[0][2]).toMatchObject({ p_result: null, p_failure: null });
});
it("does not return audio if the source changes before response", async () => {
  loaded = { result: null, audio: Buffer.from([73,68,51,0,0,0,0,0,0,0]).toString("base64"), mock: true };
  state.answer.mockResolvedValueOnce({ status: "succeeded", exhibitionId: input.exhibitionId, result: { answer: "답변" } }).mockResolvedValueOnce({ status: "succeeded", result: { answer: "수정" } });
  await expect(speakPreview({} as never, owner, answerId, input.requestId)).rejects.toMatchObject({ status: 404 });
});

it("does not send mock preview content to a live speech provider", async () => {
  state.identity.mockReturnValue({ mock: false, fingerprint: "live" });
  state.answer.mockResolvedValue({ status: "succeeded", exhibitionId: input.exhibitionId, mock: true, result: { answer: "demo", mock: true } });
  await expect(speakPreview({} as never, owner, answerId, input.requestId)).rejects.toMatchObject({ status: 404 });
  expect(state.synthesize).not.toHaveBeenCalled();
  expect(calls("reserve_preview_voice")).toHaveLength(0);
});
it("normalizes cancellation before reservation and after replay loading", async () => {
  const before = new AbortController(); before.abort();
  await expect(transcribePreview(owner, input, before.signal)).rejects.toMatchObject({ status: 499, code: "REQUEST_CANCELLED" });
  expect(calls("reserve_preview_voice")).toHaveLength(0);
  const after = new AbortController();
  reserved = { ...claim, claimed: false, status: "succeeded" };
  state.rpc.mockImplementation(async (_worker, name) => {
    if (name === "reserve_preview_voice") return reserved;
    if (name === "load_preview_voice") { after.abort(); return loaded; }
    throw new Error(name);
  });
  await expect(transcribePreview(owner, input, after.signal)).rejects.toMatchObject({ status: 499, code: "REQUEST_CANCELLED" });
});
it("marks a completed failure terminal without settling again", async () => {
  state.rpc.mockImplementation(async (_worker, name) => {
    if (name === "reserve_preview_voice") return claim;
    if (name === "complete_preview_voice") return { status: "failed", failureCode: "REQUEST_TIMEOUT" };
    throw new Error(name);
  });
  await expect(transcribePreview(owner, input)).rejects.toMatchObject({ status: 504, code: "PREVIEW_VOICE_FAILED" });
  expect(calls("complete_preview_voice")).toHaveLength(1);
});
it("marks a provider failure terminal only when failure settlement is confirmed", async () => {
  state.transcribe.mockRejectedValue(new Error("provider"));
  state.rpc.mockImplementation(async (_worker, name) => {
    if (name === "reserve_preview_voice") return claim;
    if (name === "complete_preview_voice") return { status: "failed", failureCode: "INTERNAL_ERROR" };
    throw new Error(name);
  });
  await expect(transcribePreview(owner, input)).rejects.toMatchObject({ status: 500, code: "PREVIEW_VOICE_FAILED" });
});
it("keeps an opaque completion error when failure settlement cannot be confirmed", async () => {
  state.rpc.mockImplementation(async (_worker, name) => {
    if (name === "reserve_preview_voice") return claim;
    if (name === "complete_preview_voice") throw new Error("response lost");
    throw new Error(name);
  });
  await expect(transcribePreview(owner, input)).rejects.toMatchObject({ status: 500, code: "INTERNAL_ERROR" });
  expect(calls("complete_preview_voice")).toHaveLength(2);
});
it("does not treat an unexpected successful settlement as a confirmed failure", async () => {
  state.transcribe.mockRejectedValue(new Error("provider"));
  await expect(transcribePreview(owner, input)).rejects.toMatchObject({ status: 500, code: "INTERNAL_ERROR" });
});