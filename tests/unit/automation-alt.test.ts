import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { createAltAdapter } from "@/lib/automation/adapters/alt";
import { AutomationError } from "@/lib/automation/errors";

const apiKey = "fake-alt-test-key";
const noteId = "note_fixture";
const noteUrl = "https://public-api.altalt.io/v1/notes/" + noteId;
const note = {
  id: noteId,
  revision: 7,
  status: "ended",
  transcript_status: "ready",
  channel_id: "channel_fixture",
  title: "제목",
  summary_status: "pending",
  updated_at: "2026-11-14T00:00:00Z",
};
const transcript = {
  note_id: noteId,
  revision: 7,
  text: "종이로 작업했습니다.",
  segments: [
    { start_ms: 0, end_ms: 600, text: "종이로", speaker: "화자 1" },
    { start_ms: 600, end_ms: 1200, text: "작업했습니다.", speaker: null },
    { start_ms: 1200, end_ms: 1300, text: "" },
  ],
};
const json = (value: unknown, status = 200) => Response.json(value, { status });

afterEach(() => vi.useRealTimers());

describe("Alt transcript adapter", () => {
  it("reads one transcript between same-revision note checks and preserves transcript contents", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(json(note))
      .mockResolvedValueOnce(json(transcript))
      .mockResolvedValueOnce(json(note));
    const adapter = createAltAdapter({ apiKey }, { fetch });

    await expect(adapter.read(noteId)).resolves.toEqual({
      noteId,
      revision: 7,
      text: transcript.text,
      segments: [
        { startMs: 0, endMs: 600, text: "종이로", speaker: "화자 1" },
        { startMs: 600, endMs: 1200, text: "작업했습니다.", speaker: null },
        { startMs: 1200, endMs: 1300, text: "" },
      ],
      mock: false,
    });
    expect(fetch.mock.calls.map(([url]) => url)).toEqual([noteUrl, noteUrl + "/transcript", noteUrl]);
    for (const [, init] of fetch.mock.calls) {
      expect(init).toMatchObject({ method: "GET", redirect: "error", cache: "no-store",
        headers: { Authorization: "Bearer " + apiKey, Accept: "application/json" }, signal: expect.any(AbortSignal) });
      expect(init?.body).toBeUndefined();
    }
  });

  it.each(["", ".", "../note", "a/b", "https://example.invalid", "note?query=1", "note%2fextra"])(
    "rejects an invalid note ID before making any request: %s", async (id) => {
      const fetch = vi.fn<typeof globalThis.fetch>();
      await expect(createAltAdapter({ apiKey }, { fetch }).read(id)).rejects.toMatchObject({ code: "invalid_input" });
      expect(fetch).not.toHaveBeenCalled();
    },
  );

  it("rejects empty credentials and invalid timeout overrides", () => {
    expect(() => createAltAdapter({ apiKey: " " })).toThrow(expect.objectContaining({ code: "not_configured" }));
    expect(() => createAltAdapter({ apiKey }, { timeoutMs: 15_001 })).toThrow(expect.objectContaining({ code: "invalid_input" }));
  });

  it.each([
    ["pending", { status: "pending" }, "not_ready"],
    ["processing", { transcript_status: "pending" }, "not_ready"],
    ["deleted", { status: "deleted" }, "not_found"],
    ["wrong ID", { id: "note_other" }, "invalid_response"],
  ] as const)("does not fetch the transcript if note metadata is %s", async (_label, update, code) => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValueOnce(json({ ...note, ...update }));
    await expect(createAltAdapter({ apiKey }, { fetch }).read(noteId)).rejects.toMatchObject({ code });
    expect(fetch).toHaveBeenCalledOnce();
  });

  it.each([["transcript_not_ready", "not_ready"], ["not_found", "not_found"]] as const)(
    "distinguishes a transcript 404 with code %s without leaking its body", async (upstream, code) => {
      const fetch = vi.fn<typeof globalThis.fetch>()
        .mockResolvedValueOnce(json(note))
        .mockResolvedValueOnce(json({ error: { code: upstream, message: apiKey + " private note text" } }, 404));
      await expect(createAltAdapter({ apiKey }, { fetch }).read(noteId)).rejects.toMatchObject({ code, message: code });
      expect(fetch).toHaveBeenCalledTimes(2);
    },
  );

  it.each([[401, "rejected"], [403, "rejected"], [429, "rate_limited"], [503, "unavailable"]] as const)(
    "maps HTTP %i without leaking the body or retrying", async (status, code) => {
      const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValueOnce(json({ privateText: apiKey }, status));
      await expect(createAltAdapter({ apiKey }, { fetch }).read(noteId)).rejects.toMatchObject({ code, message: code });
      expect(fetch).toHaveBeenCalledOnce();
    },
  );

  it("rejects a mismatched transcript revision and does not retry", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(json(note))
      .mockResolvedValueOnce(json({ ...transcript, revision: 8 }));
    await expect(createAltAdapter({ apiKey }, { fetch }).read(noteId)).rejects.toMatchObject({ code: "stale_source" });
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it.each([
    ["revision changed", { revision: 8 }, 200, "stale_source"],
    ["channel changed", { channel_id: "channel_other" }, 200, "stale_source"],
    ["status changed", { transcript_status: "empty" }, 200, "stale_source"],
    ["access lost", { error: { code: "not_found" } }, 404, "not_found"],
  ] as const)("does not release the transcript if %s during the fetch", async (_label, update, status, code) => {
    const fetch = vi.fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(json(note))
      .mockResolvedValueOnce(json(transcript))
      .mockResolvedValueOnce(json({ ...note, ...update }, status));
    await expect(createAltAdapter({ apiKey }, { fetch }).read(noteId)).rejects.toMatchObject({ code });
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it("rejects invalid segment timing without exposing transcript text", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValueOnce(json(note)).mockResolvedValueOnce(json({
      ...transcript,
      segments: [{ start_ms: 3, end_ms: 1, text: "private text" }],
    }));
    await expect(createAltAdapter({ apiKey }, { fetch }).read(noteId))
      .rejects.toMatchObject({ code: "invalid_response", message: "invalid_response" });
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it.each([undefined, "4", String(1024 * 1024 + 1)])("caps JSON bytes with content-length %s", async (declared) => {
    const cancel = vi.fn();
    const body = new ReadableStream<Uint8Array>({
      start(controller) { controller.enqueue(new Uint8Array(1024 * 1024 + 1)); },
      cancel,
    });
    const headers: Record<string, string> = { "content-type": "application/json" };
    if (declared) headers["content-length"] = declared;
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValueOnce(new Response(body, { headers }));
    await expect(createAltAdapter({ apiKey }, { fetch }).read(noteId)).rejects.toMatchObject({ code: "invalid_response" });
    expect(cancel).toHaveBeenCalledOnce();
  });

  it("bounds a stalled body read by the timeout and cancels its stream", async () => {
    vi.useFakeTimers();
    const cancel = vi.fn();
    const stalled = new Response(new ReadableStream({ cancel }), { headers: { "content-type": "application/json" } });
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValueOnce(json(note)).mockResolvedValueOnce(stalled);
    const result = expect(createAltAdapter({ apiKey }, { fetch }).read(noteId)).rejects.toMatchObject({ code: "timeout" });
    await vi.advanceTimersByTimeAsync(15_000);
    await result;
    expect(cancel).toHaveBeenCalledOnce();
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("cancels an unresponsive fetch and never dispatches an already cancelled request", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(() => new Promise(() => {}));
    const controller = new AbortController();
    const adapter = createAltAdapter({ apiKey }, { fetch });
    const result = adapter.read(noteId, controller.signal);
    controller.abort("private reason");
    await expect(result).rejects.toMatchObject({ code: "cancelled", message: "cancelled" });
    await expect(adapter.read(noteId, controller.signal)).rejects.toMatchObject({ code: "cancelled" });
    expect(fetch).toHaveBeenCalledOnce();
  });

  it("suppresses the original transport error", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockRejectedValueOnce(new Error(apiKey));
    const error = await createAltAdapter({ apiKey }, { fetch }).read(noteId).catch((reason: unknown) => reason);
    expect(error).toBeInstanceOf(AutomationError);
    expect(error).toMatchObject({ code: "unavailable", message: "unavailable" });
    expect(error).not.toHaveProperty("cause");
  });
});
