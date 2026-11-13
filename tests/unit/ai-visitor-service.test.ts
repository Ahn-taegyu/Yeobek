import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const state = vi.hoisted(() => ({ reserve: vi.fn(), complete: vi.fn(), load: vi.fn(), recordGap: vi.fn(), recordExecution: vi.fn(), generate: vi.fn() }));
vi.mock("../../src/lib/supabase/worker", () => ({ createWorkerSupabase: () => ({}) }));
vi.mock("../../src/lib/ai/stores/visitor", async original => ({
  ...await original<typeof import("../../src/lib/ai/stores/visitor")>(),
  createVisitorStore: () => state, createSpeechSourceStore: () => ({}),
}));
vi.mock("../../src/lib/ai/stores/publications", async () => {
  const { syntheticPublication } = await import("../fixtures/ai");
  return { createPublicationStore: () => ({ load: async () => syntheticPublication(), isCurrent: async () => true }) };
});
vi.mock("../../src/lib/ai/runtime", async () => {
  const { createDocentHarness } = await import("../../src/lib/ai/harness");
  return { createDocentRuntime: (publications: Parameters<typeof createDocentHarness>[0]["publications"], _answers: unknown,
    visitor: Parameters<typeof createDocentHarness>[0]["visitor"]) => createDocentHarness({ publications, visitor, text: { generate: state.generate } }) };
});
import { answerVisitor } from "../../src/lib/ai/visitor-service";
import { AiError } from "../../src/lib/ai/errors";
import { ApiError } from "../../src/lib/api/errors";
import { ids, syntheticRequest } from "../fixtures/ai";
const session = "a".repeat(64);
const reservation = () => ({ id: ids.request, claimed: true, status: "running", result: null, mock: true, expiresAt: "2026-11-14T00:00:00Z", failureCode: null });
beforeEach(() => {
  vi.resetAllMocks(); vi.stubEnv("AI_PROVIDER_MODE", "mock"); vi.stubEnv("FEATURE_GAPS", "true");
  vi.spyOn(console, "error").mockImplementation(() => {});
  state.reserve.mockResolvedValue(reservation());
  state.complete.mockImplementation(async (_id, result, failureCode) => ({ ...reservation(), claimed: false,
    status: failureCode ? "failed" : "succeeded", result, failureCode }));
  state.recordExecution.mockResolvedValue(undefined); state.recordGap.mockResolvedValue(true);
  state.generate.mockResolvedValue({ output: { answer: "수채 물감입니다.", citations: [ids.evidence], outcome: "answered" } });
  state.load.mockImplementation(async () => state.complete.mock.calls.at(-1)?.[1]);
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });
describe("visitor persisted outcomes", () => {
  it("a telemetry outage does not hide a committed answer", async () => {
    state.recordExecution.mockRejectedValue(new Error("DB unavailable"));
    expect((await answerVisitor(syntheticRequest(), session)).answer).toBe("수채 물감입니다.");
    expect(state.complete).toHaveBeenCalledTimes(1);
  });
  it("a failed gap write still returns the saved answer without a false notice", async () => {
    state.generate.mockResolvedValue({ output: { answer: "uncertain", citations: [], outcome: "insufficient_evidence" } });
    state.recordGap.mockRejectedValue(new Error("DB unavailable"));
    const reply = await answerVisitor(syntheticRequest(), session);
    expect(reply.outcome).toBe("insufficient_evidence"); expect(reply.gapRecorded).toBe(false); expect(reply).not.toHaveProperty("notice");
    expect(state.recordExecution.mock.calls[0][1]).toContainEqual(expect.objectContaining({ id: "gap.record", status: "failed" }));
  });
  it.each([["RATE_LIMITED", 429], ["REQUEST_CANCELLED", 499], ["PROVIDER_UNAVAILABLE", 503], ["AI_INVALID_OUTPUT", 502]])("replays %s without another call", async (code, status) => {
    state.reserve.mockResolvedValue({ ...reservation(), claimed: false, status: "failed", failureCode: code });
    await expect(answerVisitor(syntheticRequest(), session)).rejects.toMatchObject({ code, status });
    expect(state.generate).not.toHaveBeenCalled(); expect(state.complete).not.toHaveBeenCalled();
  });
  it("normalizes in-flight browser cancellation and settles only once", async () => {
    const controller = new AbortController();
    state.generate.mockImplementation(() => { controller.abort(); return new Promise(() => {}); });
    await expect(answerVisitor(syntheticRequest(), session, controller.signal)).rejects.toMatchObject({ code: "REQUEST_CANCELLED", status: 499 });
    expect(state.complete).toHaveBeenCalledExactlyOnceWith(ids.request, null, "REQUEST_CANCELLED");
  });
  it("does not reserve on a pre-cancelled request", async () => {
    await expect(answerVisitor(syntheticRequest(), session, AbortSignal.abort())).rejects.toMatchObject({ code: "REQUEST_CANCELLED", status: 499 });
    expect(state.reserve).not.toHaveBeenCalled();
  });
  it("settles a reservation arriving after the browser has cancelled", async () => {
    let resolve!: (value: ReturnType<typeof reservation>) => void;
    const controller = new AbortController();
    state.reserve.mockImplementation(() => new Promise(r => { resolve = r; controller.abort(); }));
    await expect(answerVisitor(syntheticRequest(), session, controller.signal)).rejects.toMatchObject({ code: "REQUEST_CANCELLED" });
    resolve(reservation());
    await vi.waitFor(() => expect(state.complete).toHaveBeenCalledExactlyOnceWith(ids.request, null, "REQUEST_CANCELLED"));
    expect(state.generate).not.toHaveBeenCalled();
  });
  it("disabling gaps skips the write and omits optional fields", async () => {
    vi.stubEnv("FEATURE_GAPS", "false");
    state.generate.mockResolvedValue({ output: { answer: "unknown", citations: [], outcome: "insufficient_evidence" } });
    const reply = await answerVisitor(syntheticRequest(), session);
    expect(reply).not.toHaveProperty("gapRecorded"); expect(reply).not.toHaveProperty("notice");
    expect(state.recordGap).not.toHaveBeenCalled();
    expect(state.recordExecution.mock.calls[0][1]).toContainEqual(expect.objectContaining({ id: "gap.record", status: "skipped" }));
  });
  it("preserves a provider failure if settlement is temporarily unavailable", async () => {
    state.generate.mockRejectedValue(new AiError("rate_limited"));
    state.complete.mockRejectedValue(new Error("private DB details"));
    await expect(answerVisitor(syntheticRequest(), session)).rejects.toMatchObject({ status: 429, code: "RATE_LIMITED" });
  });
  it("in-progress replies are retryable", () => {
    expect(new ApiError(409, "REQUEST_IN_PROGRESS", "wait").retryable).toBe(true);
  });
});
