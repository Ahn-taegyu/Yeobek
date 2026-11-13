import { afterEach, expect, it, vi } from "vitest";
import { z } from "zod";
vi.mock("server-only", () => ({}));
import { withVoiceDeadline } from "../../src/lib/api/voice-deadline";
import { readJson } from "../../src/lib/api/http";
import { readTranscription } from "../../src/lib/api/multipart";

afterEach(() => vi.useRealTimers());
it.each(["json", "multipart"])("the 60 second voice budget includes a stalled %s upload", async kind => {
  vi.useFakeTimers();
  const cancel = vi.fn();
  const body = new ReadableStream({ pull() { return new Promise(() => {}); }, cancel });
  const init = { method: "POST", body, duplex: "half", headers: {
    "Content-Type": kind === "json" ? "application/json" : "multipart/form-data; boundary=test",
  } };
  const pending = withVoiceDeadline(new Request("http://localhost", init), async bounded => {
    if (kind === "json") return readJson(bounded, z.object({}));
    return readTranscription(bounded);
  });
  const assertion = expect(pending).rejects.toMatchObject({ status: 504, code: "REQUEST_TIMEOUT" });
  await vi.advanceTimersByTimeAsync(60_000);
  await assertion;
  expect(cancel).toHaveBeenCalledOnce();
});
