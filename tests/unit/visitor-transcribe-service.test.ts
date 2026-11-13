import { afterEach, beforeEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const state = vi.hoisted(() => ({ rpc: vi.fn(), transcribe: vi.fn() }));
vi.mock("../../src/lib/api/db", () => ({ rpc: state.rpc }));
vi.mock("../../src/lib/supabase/worker", () => ({ createWorkerSupabase: () => ({}) }));
vi.mock("../../src/lib/ai/runtime", () => ({ createConfiguredTranscriptionProvider: () => ({ transcribe: state.transcribe }) }));
import { ApiError } from "../../src/lib/api/errors";
import { transcribeVisitor } from "../../src/lib/ai/visitor-transcribe-service";

const id = "dbe48811-59a8-4348-84c9-460687880e36";
const input = { requestId: "dbe48811-59a8-4348-84c9-460687880e37", exhibitionId: "dbe48811-59a8-4348-84c9-460687880e38",
  filename: "recording.wav", file: new File(["fixture bytes"], "recording.wav", { type: "audio/wav" }) };
const session = "a".repeat(64);
const reply = { requestId: input.requestId, transcript: "인식 결과", mock: true };
const trace = { provider: "mock", model: "mock-stt", mock: true };
const claim = { id, claimed: true, status: "running", failureCode: null, result: null, mock: true,
  expiresAt: "2026-11-15T00:00:00Z" };
const ready = { ...claim, claimed: false, status: "succeeded", result: reply };
let reserve: () => unknown;
const calls = (name: string) => state.rpc.mock.calls.filter(([, called]) => called === name);

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("AI_PROVIDER_MODE", "mock");
  reserve = () => claim;
  state.transcribe.mockResolvedValue({ text: reply.transcript, trace });
  state.rpc.mockImplementation(async (_worker, name, args) => {
    switch (name) {
      case "reserve_visitor_voice": return reserve();
      case "complete_visitor_voice": return args.p_failure_code
        ? { ...claim, claimed: false, status: "failed", failureCode: args.p_failure_code } : ready;
      case "load_visitor_voice": return reply;
      case "record_visitor_execution": return null;
      default: throw new Error(name);
    }
  });
});
afterEach(() => vi.unstubAllEnvs());

it("hashes the recording for reservation and replays the result without another provider call", async () => {
  expect(await transcribeVisitor(input, session)).toEqual({ ...reply, overLimit: false });
  expect(calls("reserve_visitor_voice")[0][2]).toEqual({ p_session_hash: session, p_exhibition_id: input.exhibitionId,
    p_request_id: input.requestId, p_kind: "transcription", p_mock: true, p_input_hash: expect.stringMatching(/^[0-9a-f]{64}$/) });
  expect(calls("complete_visitor_voice")[0][2]).toMatchObject({ p_result: reply, p_failure_code: null });
  expect(calls("record_visitor_execution")[0][2]).toMatchObject({ p_usage: [trace] });
  reserve = () => ready;
  expect(await transcribeVisitor(input, session)).toEqual({ ...reply, overLimit: false });
  expect(state.transcribe).toHaveBeenCalledOnce();
  expect(calls("complete_visitor_voice")).toHaveLength(1);
});

it.each([
  new ApiError(409, "REQUEST_ID_CONFLICT", "different input"),
  new ApiError(429, "VISITOR_REQUEST_LIMIT", "limited"),
])("does not call the provider or complete a rejected reservation", async failure => {
  reserve = () => { throw failure; };
  await expect(transcribeVisitor(input, session)).rejects.toBe(failure);
  expect(state.transcribe).not.toHaveBeenCalled();
  expect(calls("complete_visitor_voice")).toHaveLength(0);
});

it.each([{ text: "가".repeat(4001), trace }, { text: reply.transcript, trace: { provider: "liner", model: "stt" } }])(
  "settles malformed provider output without persisting transcript text", async output => {
    state.transcribe.mockResolvedValue(output);
    await expect(transcribeVisitor(input, session)).rejects.toMatchObject({ code: "AI_INVALID_OUTPUT" });
    expect(calls("complete_visitor_voice")[0][2]).toMatchObject({ p_result: null, p_failure_code: "AI_INVALID_OUTPUT" });
    expect(calls("record_visitor_execution")[0][2]).toMatchObject({ p_usage: [output.trace] });
  });

it("preserves overlength text for editing instead of truncating or submitting it", async () => {
  const transcript = "가".repeat(501);
  state.transcribe.mockResolvedValue({ text: transcript, trace });
  const original = state.rpc.getMockImplementation()!;
  state.rpc.mockImplementation(async (...args) => args[1] === "load_visitor_voice" ? { ...reply, transcript } : original(...args));
  const result = await transcribeVisitor(input, session);
  expect(result).toEqual({ ...reply, transcript, overLimit: true });
  expect(calls("complete_visitor_voice")[0][2].p_result.transcript).toBe(transcript);
});

it("settles a rejected completion without another model call", async () => {
  const original = state.rpc.getMockImplementation()!;
  state.rpc.mockImplementation(async (...args) => {
    if (args[1] === "complete_visitor_voice" && !args[2].p_failure_code) throw new ApiError(409, "REVISION_CONFLICT", "changed");
    return original(...args);
  });
  await expect(transcribeVisitor(input, session)).rejects.toMatchObject({ code: "REVISION_CONFLICT" });
  expect(calls("complete_visitor_voice")[1][2]).toMatchObject({ p_result: null, p_failure_code: "REVISION_CONFLICT" });
  expect(state.transcribe).toHaveBeenCalledOnce();
});

it("settles a late claim after cancellation without calling the provider", async () => {
  const controller = new AbortController();
  reserve = () => { controller.abort(); return claim; };
  await expect(transcribeVisitor(input, session, controller.signal)).rejects.toMatchObject({ status: 499 });
  expect(state.transcribe).not.toHaveBeenCalled();
  expect(calls("complete_visitor_voice")[0][2]).toMatchObject({ p_result: null, p_failure_code: "REQUEST_CANCELLED" });
});

it("does not wait for a provider that ignores cancellation or store its late result", async () => {
  const controller = new AbortController();
  let release!: (value: unknown) => void;
  state.transcribe.mockImplementation(() => new Promise(resolve => { release = resolve; controller.abort(); }));
  await expect(transcribeVisitor(input, session, controller.signal)).rejects.toMatchObject({ status: 499 });
  release({ text: reply.transcript, trace });
  await Promise.resolve();
  expect(calls("complete_visitor_voice")).toHaveLength(1);
  expect(calls("complete_visitor_voice")[0][2]).toMatchObject({ p_result: null, p_failure_code: "REQUEST_CANCELLED" });
  expect(calls("record_visitor_execution")[0][2]).toMatchObject({ p_usage: [] });
  expect(calls("load_visitor_voice")).toHaveLength(0);
});
