import { describe, expect, it, vi } from "vitest";
import { createLinerSpeechProvider } from "@/lib/ai/providers/liner";

vi.mock("server-only", () => ({}));

const gemini = { apiKey: "fixture-key", model: "google/gemini-3.8-flash-lite-tts", voice: "Kore" };
const text = "침실의 벽은 원래 보라색이었습니다.";
const pcmType = "audio/pcm;rate=24000;channels=1";
const maxBytes = 8 * 1024 * 1024;

function pcmResponse(bytes: Uint8Array<ArrayBuffer>, type = pcmType): Response {
  return new Response(bytes, { headers: { "Content-Type": type } });
}

describe("Liner speech", () => {
  it("requests Gemini PCM once and returns 24 kHz mono MPEG Layer III frames", async () => {
    const pcm = new Uint8Array(24_000 * 2);
    const samples = new DataView(pcm.buffer);
    for (let index = 0; index < pcm.length / 2; index++) {
      samples.setInt16(index * 2, 12_000 * Math.sin(2 * Math.PI * index * 440 / 24_000), true);
    }
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(pcmResponse(pcm, 'Audio/PCM; Channels=1; Rate="24000"'));

    const result = await createLinerSpeechProvider(gemini, { fetch }).synthesize({ text });

    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, request] = fetch.mock.calls[0];
    expect(url).toBe("https://platform.liner.com/api/v1/audio/speech");
    expect(JSON.parse(String(request?.body))).toEqual({
      model: gemini.model, voice: gemini.voice, input: text, response_format: "pcm",
    });
    expect(result).toMatchObject({ contentType: "audio/mpeg", trace: { provider: "liner", model: gemini.model } });
    const audio = result.audio;
    expect(audio.length).toBeGreaterThan(8000);
    expect(audio.length).toBeLessThan(9000);
    expect(audio.length % 192).toBe(0);
    for (let offset = 0; offset < audio.length; offset += 192) {
      expect([...audio.subarray(offset, offset + 3)]).toEqual([0xff, 0xf3, 0x84]);
      expect(audio[offset + 3] >>> 6).toBe(3); // Single-channel, MPEG-2 Layer III at 64 kbps.
    }
  });

  it("keeps explicit MP3 requests for other Liner models", async () => {
    const mp3 = new Uint8Array([0xff, 0xf3, 0x84, 0xc4]);
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(pcmResponse(mp3, "audio/mpeg"));
    const provider = createLinerSpeechProvider({ ...gemini, model: "openai/tts-1", voice: "alloy" }, { fetch });
    await expect(provider.synthesize({ text })).resolves.toMatchObject({ audio: mp3, contentType: "audio/mpeg" });
    expect(JSON.parse(String(fetch.mock.calls[0][1]?.body)).response_format).toBe("mp3");
    fetch.mockResolvedValueOnce(pcmResponse(mp3));
    await expect(provider.synthesize({ text })).rejects.toMatchObject({ code: "invalid_response" });
  });

  it.each([
    ["missing parameters", new Uint8Array(2), "audio/pcm"],
    ["another rate", new Uint8Array(2), "audio/pcm;rate=16000;channels=1"],
    ["stereo", new Uint8Array(4), "audio/pcm;rate=24000;channels=2"],
    ["duplicate channel parameter", new Uint8Array(2), "audio/pcm;rate=24000;channels=1;channels=2"],
    ["misleading media type", new Uint8Array([0xff, 0xf3, 0x84, 0xc4]), "audio/mpeg"],
    ["empty audio", new Uint8Array(), pcmType],
    ["partial sample", new Uint8Array(3), pcmType],
  ] as const)("rejects Gemini PCM with %s", async (_label, bytes, contentType) => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(pcmResponse(bytes, contentType));
    await expect(createLinerSpeechProvider(gemini, { fetch }).synthesize({ text }))
      .rejects.toMatchObject({ code: "invalid_response" });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("rejects an oversized PCM stream before encoding it", async () => {
    const response = new Response(new ReadableStream({
      start(controller) { controller.enqueue(new Uint8Array(maxBytes + 2)); },
    }), { headers: { "Content-Type": pcmType } });
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(response);
    await expect(createLinerSpeechProvider(gemini, { fetch }).synthesize({ text }))
      .rejects.toMatchObject({ code: "response_too_large" });
  });

  it("honors cancellation while converting a complete response", async () => {
    const abort = new AbortController();
    const fetch = vi.fn<typeof globalThis.fetch>().mockImplementationOnce(async () => {
      setImmediate(() => abort.abort());
      return pcmResponse(new Uint8Array(48_000));
    });
    await expect(createLinerSpeechProvider(gemini, { fetch }).synthesize({ text, signal: abort.signal }))
      .rejects.toMatchObject({ code: "cancelled" });
  });
});
