import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { KnowledgeError } from "@/lib/ai/artist-knowledge";
import { AI_REQUEST_TIMEOUT_MS } from "@/lib/ai/config";
import { HarnessError } from "@/lib/ai/context";
import { abortable, createDeadline } from "@/lib/ai/deadline";
import { AiError } from "@/lib/ai/errors";
import type { AbstentionReason } from "@/lib/ai/narration";
import { normalizeAiOutcome } from "@/lib/ai/outcome";
import { requestJson } from "@/lib/ai/providers/http";

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("AI deadlines", () => {
  it("bounds a hung operation and cleans up both abort listeners", async () => {
    vi.useFakeTimers();
    const parent = new AbortController();
    const deadline = createDeadline(50, parent.signal);
    const removeChildListener = vi.spyOn(deadline.signal, "removeEventListener");
    const hang = vi.fn(() => new Promise<never>(() => {}));
    const result = expect(abortable(deadline.signal, hang)).rejects.toMatchObject({ code: "timeout" });

    await vi.advanceTimersByTimeAsync(49);
    expect(deadline.signal.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await result;
    parent.abort("late parent reason");

    expect(hang).toHaveBeenCalledExactlyOnceWith(deadline.signal);
    expect(deadline.timedOut()).toBe(true);
    expect(removeChildListener).toHaveBeenCalledWith("abort", expect.any(Function));
    expect(removeChildListener).toHaveBeenCalledTimes(2);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("propagates parent cancellation past a listener that stops event propagation", async () => {
    vi.useFakeTimers();
    const parent = new AbortController();
    parent.signal.addEventListener("abort", event => event.stopImmediatePropagation());
    const deadline = createDeadline(50, parent.signal);
    const hung = abortable(deadline.signal, () => new Promise<never>(() => {}));
    const reason = new Error("caller-only details");

    parent.abort(reason);

    await expect(hung).rejects.toBe(reason);
    expect(deadline.timedOut()).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("preserves parent cancellation, cancels the timer and skips pre-cancelled operations", async () => {
    vi.useFakeTimers();
    const parent = new AbortController();
    const deadline = createDeadline(50, parent.signal);
    const hung = abortable(deadline.signal, () => new Promise<never>(() => {}));
    const reason = new Error("caller-only details");
    parent.abort(reason);

    await expect(hung).rejects.toBe(reason);
    expect(deadline.timedOut()).toBe(false);
    expect(vi.getTimerCount()).toBe(0);

    const operation = vi.fn(async () => "unused");
    const alreadyAborted = createDeadline(50, parent.signal);
    await expect(abortable(alreadyAborted.signal, operation)).rejects.toBe(reason);
    expect(operation).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("removes listeners on successful operations and permits repeated disposal", async () => {
    vi.useFakeTimers();
    const parent = new AbortController();
    const deadline = createDeadline(50, parent.signal);
    const removeListener = vi.spyOn(deadline.signal, "removeEventListener");
    const operation = async () => "ok";

    await expect(abortable(deadline.signal, operation)).resolves.toBe("ok");
    expect(removeListener).toHaveBeenCalledWith("abort", expect.any(Function));
    deadline.dispose();
    deadline.dispose();
    await vi.advanceTimersByTimeAsync(50);
    expect(deadline.signal.aborted).toBe(false);
    parent.abort();

    expect(vi.getTimerCount()).toBe(0);
    expect(deadline.timedOut()).toBe(false);
  });

  it.each([0, -1, 0.5, NaN, Infinity, 2_147_483_648])("rejects invalid duration %s before scheduling", (duration) => {
    vi.useFakeTimers();
    expect(() => createDeadline(duration)).toThrow(expect.objectContaining({ code: "invalid_input" }));
    expect(vi.getTimerCount()).toBe(0);
  });

  it("keeps the provider limit at 30 seconds", async () => {
    vi.useFakeTimers();
    const input = { url: "https://example.invalid", body: "{}", headers: {} };
    const fetch = vi.fn<typeof globalThis.fetch>(() => new Promise<never>(() => {}));

    await expect(requestJson(input, { fetch, timeoutMs: AI_REQUEST_TIMEOUT_MS + 1 })).rejects.toMatchObject({ code: "invalid_input" });
    expect(fetch).not.toHaveBeenCalled();

    const result = expect(requestJson(input, { fetch })).rejects.toMatchObject({ code: "timeout", retryable: false });
    await vi.advanceTimersByTimeAsync(29_999);
    expect(fetch.mock.calls[0][1]?.signal?.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await result;
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("prioritizes provider request cancellation when both signals abort before error handling", async () => {
    vi.useFakeTimers();
    const parent = new AbortController();
    const fetch = vi.fn<typeof globalThis.fetch>((_, options) => {
      options?.signal?.addEventListener("abort", () => parent.abort("private abort reason"), { once: true });
      return new Promise<never>(() => {});
    });
    const input = { url: "https://example.invalid", body: "{}", headers: {}, signal: parent.signal };
    const result = expect(requestJson(input, { fetch, timeoutMs: 50 })).rejects.toMatchObject({
      code: "cancelled",
      retryable: false,
      message: new AiError("cancelled").message,
    });

    expect(parent.signal.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(50);
    await result;
    expect(parent.signal.aborted).toBe(true);
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});

const abstained = (reason: AbstentionReason) => ({ status: "abstained", reason });

describe("normalizeAiOutcome", () => {
  it.each([
    [new HarnessError("invalid_request"), 400, "INVALID_INPUT", false, "author"],
    [new HarnessError("invalid_context"), 500, "INTERNAL_ERROR", true, "operator"],
    [new HarnessError("invalid_output"), 502, "AI_INVALID_OUTPUT", true, "operator"],
    [new HarnessError("publication_unavailable"), 404, "NOT_FOUND", false, "author"],
    [new HarnessError("answer_unavailable"), 404, "NOT_FOUND", false, "author"],
    [new HarnessError("cancelled"), 499, "REQUEST_CANCELLED", false, "none"],
    [new KnowledgeError("invalid_input"), 400, "INVALID_INPUT", false, "author"],
    [new KnowledgeError("unavailable"), 404, "NOT_FOUND", false, "author"],
    [new KnowledgeError("invalid_context"), 500, "INTERNAL_ERROR", true, "operator"],
    [new KnowledgeError("invalid_output"), 502, "AI_INVALID_OUTPUT", true, "operator"],
    [new KnowledgeError("revision_conflict"), 409, "REVISION_CONFLICT", false, "author"],
    [new KnowledgeError("proposal_expired"), 410, "PROPOSAL_EXPIRED", false, "author"],
    [new AiError("not_configured"), 503, "SERVER_CONFIGURATION_ERROR", false, "operator"],
    [new AiError("invalid_input"), 400, "INVALID_INPUT", false, "author"],
    [new AiError("cancelled"), 499, "REQUEST_CANCELLED", false, "none"],
    [new AiError("timeout"), 504, "REQUEST_TIMEOUT", true, "operator"],
    [new AiError("rate_limited"), 429, "RATE_LIMITED", true, "operator"],
    [new AiError("provider_unavailable"), 503, "PROVIDER_UNAVAILABLE", true, "operator"],
    [new AiError("provider_rejected"), 502, "AI_GENERATION_FAILED", true, "operator"],
    [new AiError("network_error"), 503, "PROVIDER_UNAVAILABLE", true, "operator"],
    [new AiError("invalid_response"), 502, "AI_INVALID_OUTPUT", true, "operator"],
    [new AiError("response_too_large"), 502, "AI_INVALID_OUTPUT", true, "operator"],
    [new AiError("refused"), 502, "AI_GENERATION_FAILED", true, "operator"],
    [new AiError("incomplete"), 502, "AI_GENERATION_FAILED", true, "operator"],
    [abstained("invalid_request"), 400, "INVALID_INPUT", false, "author"],
    [abstained("unavailable"), 404, "NOT_FOUND", false, "author"],
    [abstained("invalid_context"), 500, "INTERNAL_ERROR", true, "operator"],
    [abstained("stale_context"), 409, "REVISION_CONFLICT", false, "author"],
    [abstained("insufficient_evidence"), 422, "EVIDENCE_REQUIRED", false, "author"],
    [abstained("clarify"), 422, "CONTEXT_AMBIGUOUS", false, "author"],
    [abstained("generation_failed"), 502, "AI_GENERATION_FAILED", true, "operator"],
    [abstained("invalid_candidate"), 502, "AI_INVALID_OUTPUT", true, "operator"],
    [abstained("judge_failed"), 502, "AI_GENERATION_FAILED", true, "operator"],
    [abstained("below_threshold"), 502, "AI_INVALID_OUTPUT", true, "operator"],
    [abstained("cancelled"), 499, "REQUEST_CANCELLED", false, "none"],
    [abstained("timeout"), 504, "REQUEST_TIMEOUT", true, "operator"],
  ] as const)("normalizes %s to %i %s", (input, status, code, retryable, routing) => {
    expect(normalizeAiOutcome(input)).toEqual({ status, code, retryable, routing });
  });

  it("returns a safe fallback for unknown, inherited and spoofed codes", () => {
    for (const input of [null, new Error("private reason"), { code: "cancelled" },
      { status: "abstained", reason: "toString", message: "private reason" }]) {
      expect(normalizeAiOutcome(input)).toEqual({ status: 500, code: "INTERNAL_ERROR", retryable: true, routing: "operator" });
    }
  });
});
