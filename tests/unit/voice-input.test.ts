import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { readTranscription } from "../../src/lib/api/multipart";
import { speechRequest, transcribeResponse } from "../../src/lib/contracts/voice";
import { MAX_RECORDING_BYTES } from "../../src/lib/ai/providers/recording";

const id = "550E8400-E29B-41D4-A716-446655440000";
const wav = new TextEncoder().encode("RIFF0000WAVE");
const formWith = (file: Blob, filename: string) => {
  const form = new FormData();
  form.set("requestId", id);
  form.set("exhibitionId", id);
  form.set("file", file, filename);
  return form;
};
const request = (body: FormData) => new Request("http://localhost/api/transcribe", { method: "POST", body });

describe("visitor voice contracts", () => {
  it("normalizes browser MP4 audio to the M4A filename accepted by both transcription adapters", async () => {
    const bytes = new Uint8Array(32);
    bytes.set(new TextEncoder().encode("ftypM4A "), 4);
    const result = await readTranscription(request(formWith(new Blob([bytes], { type: "audio/mp4" }), "recording.mp4")));
    expect(result.filename).toBe("recording.m4a");
    expect(result.file.type).toBe("audio/mp4");
  });
  it("normalizes identifiers and uses a fixed filename with canonical MIME", async () => {
    const result = await readTranscription(request(formWith(new Blob([wav], { type: "audio/wav" }), "personal-name.WAV")));
    expect(result).toMatchObject({ requestId: id.toLowerCase(), exhibitionId: id.toLowerCase(), filename: "recording.wav" });
    expect(result.file.name).toBe("recording.wav");
    expect(result.file.type).toBe("audio/wav");
    expect(new Uint8Array(await result.file.arrayBuffer())).toEqual(wav);
    expect(speechRequest.parse({ requestId: id, answerId: id }).answerId).toBe(id.toLowerCase());
    expect(transcribeResponse.safeParse({ requestId: id, transcript: "😀".repeat(501), mock: true, overLimit: true }).success).toBe(true);
  });

  it.each([
    ["empty", new Uint8Array(), "audio/wav", "clip.wav"],
    ["incorrect magic", new TextEncoder().encode("not a recording"), "audio/wav", "clip.wav"],
    ["incorrect MIME", wav, "audio/webm", "clip.wav"],
    ["incorrect extension", wav, "audio/wav", "clip.pdf"],
  ])("rejects %s", async (_label, data, mime, filename) => {
    await expect(readTranscription(request(formWith(new Blob([data], { type: mime }), filename)))).rejects.toBeDefined();
  });

  it("rejects duplicate and unexpected fields", async () => {
    const form = formWith(new Blob([wav], { type: "audio/wav" }), "clip.wav");
    form.append("requestId", id);
    await expect(readTranscription(request(form))).rejects.toMatchObject({ status: 400 });
    form.set("requestId", id);
    form.append("sessionId", id);
    await expect(readTranscription(request(form))).rejects.toBeDefined();
  });

  it("rejects malformed multipart and other content types", async () => {
    await expect(readTranscription(new Request("http://localhost", { method: "POST", body: "{" })))
      .rejects.toMatchObject({ status: 415 });
    await expect(readTranscription(new Request("http://localhost", { method: "POST", body: "invalid",
      headers: { "Content-Type": "multipart/form-data; boundary=sample" } }))).rejects.toMatchObject({ status: 400 });
  });

  it("bounds the streamed envelope and the file independently", async () => {
    const recording = (size: number) => new Blob([new Uint8Array(size)], { type: "audio/wav" });
    await expect(readTranscription(request(formWith(recording(MAX_RECORDING_BYTES + 1), "clip.wav"))))
      .rejects.toMatchObject({ status: 413 });
    const bytes = new Uint8Array(MAX_RECORDING_BYTES + 16 * 1024 + 1);
    const stream = new ReadableStream({ start(controller) { controller.enqueue(bytes); } });
    const init = { method: "POST", body: stream, duplex: "half",
      headers: { "Content-Type": "multipart/form-data; boundary=sample" } };
    await expect(readTranscription(new Request("http://localhost", init)))
      .rejects.toMatchObject({ status: 413 });
  });

  it("cancels an outstanding body read when the request is aborted", async () => {
    const controller = new AbortController();
    const cancel = vi.fn();
    const stream = new ReadableStream({ pull() { return new Promise(() => {}); }, cancel });
    const init = { method: "POST", body: stream, duplex: "half", signal: controller.signal,
      headers: { "Content-Type": "multipart/form-data; boundary=sample" } };
    const pending = readTranscription(new Request("http://localhost", init));
    controller.abort();
    await expect(pending).rejects.toMatchObject({ status: 499, code: "REQUEST_CANCELLED" });
    expect(cancel).toHaveBeenCalledOnce();
  });
});
