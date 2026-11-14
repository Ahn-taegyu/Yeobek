import "server-only";

import { setImmediate } from "node:timers/promises";
import { Mp3Encoder } from "@breezystack/lamejs";
import { AiError } from "../errors";

const SAMPLE_RATE = 24_000;
const CHANNELS = 1;
const BITRATE_KBPS = 64;
const SAMPLES_PER_BATCH = 1152 * 4;
const BYTES_PER_SAMPLE = 2;

export const linerPcmConversion = {
  acceptsContentType(value: string): boolean {
    const [mediaType, ...parameters] = value.toLowerCase().split(";");
    return mediaType.trim() === "audio/pcm" && parameters.length === 2
      && parameters.some((parameter) => /^\s*rate\s*=\s*(?:24000|"24000")\s*$/.test(parameter))
      && parameters.some((parameter) => /^\s*channels\s*=\s*(?:1|"1")\s*$/.test(parameter));
  },

  async toMp3(pcm: Uint8Array, signal: AbortSignal): Promise<Uint8Array> {
    if (!pcm.length || pcm.length % BYTES_PER_SAMPLE !== 0) throw new AiError("invalid_response");

    // Liner Gemini emits signed 16-bit little-endian samples at 24 kHz, mono.
    const input = new DataView(pcm.buffer, pcm.byteOffset, pcm.byteLength);
    const samples = new Int16Array(SAMPLES_PER_BATCH);
    const chunks: Uint8Array[] = [];
    try {
      const encoder = new Mp3Encoder(CHANNELS, SAMPLE_RATE, BITRATE_KBPS);
      for (let offset = 0; offset < input.byteLength; offset += samples.byteLength) {
        signal.throwIfAborted();
        const count = Math.min(samples.length, (input.byteLength - offset) / BYTES_PER_SAMPLE);
        for (let index = 0; index < count; index++) {
          samples[index] = input.getInt16(offset + index * BYTES_PER_SAMPLE, true);
        }
        chunks.push(encoder.encodeBuffer(samples.subarray(0, count)));
        await setImmediate();
      }
      signal.throwIfAborted();
      chunks.push(encoder.flush());
    } catch (error) {
      if (signal.aborted) throw error;
      throw new AiError("invalid_response");
    }

    const audio = new Uint8Array(chunks.reduce((length, chunk) => length + chunk.length, 0));
    let offset = 0;
    for (const chunk of chunks) {
      // The encoder may return signed bytes. Uint8Array preserves their bits.
      audio.set(chunk, offset);
      offset += chunk.length;
    }
    return audio;
  },
};
