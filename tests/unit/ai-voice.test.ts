import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { speechIdentity } from "../../src/lib/ai/voice";

describe("speech configuration identity", () => {
  const liner = { NODE_ENV: "test", AI_ROUTE_TTS: "liner:voice-model", LINER_TTS_VOICE: "korean-voice" };
  it("pins all voice choices but excludes credentials and unrelated model routing", () => {
    const selected = speechIdentity(liner);
    expect(speechIdentity({ ...liner, LINER_API_KEY: "private-value", AI_ROUTE_QA: "openai:another-model" })).toEqual(selected);
    expect(JSON.stringify(selected)).not.toContain("private-value");
    for (const change of [{ LINER_TTS_VOICE: "another-voice" }, { AI_ROUTE_TTS: "liner:another-model" },
      { AI_ROUTE_TTS: "openai:voice-model", OPENAI_TTS_VOICE: "korean-voice" }]) {
      expect(speechIdentity({ ...liner, ...change }).fingerprint).not.toBe(selected.fingerprint);
    }
  });
  it("uses effective fallback values, rejects unknown voice, and separates mock from live", () => {
    const fallback = { NODE_ENV: "test", AI_ROUTE_TTS: "openai:tts-model" };
    expect(speechIdentity(fallback)).toEqual(speechIdentity({ ...fallback, OPENAI_TTS_VOICE: "coral" }));
    expect(() => speechIdentity({ NODE_ENV: "test", AI_ROUTE_TTS: "liner:voice-model" })).toThrow();
    const mock = speechIdentity({ NODE_ENV: "development", AI_PROVIDER_MODE: "mock" });
    expect(mock.mock).toBe(true);
    expect(mock.fingerprint).not.toBe(speechIdentity(fallback).fingerprint);
    expect(() => speechIdentity({ NODE_ENV: "production", AI_PROVIDER_MODE: "mock" })).toThrow();
  });
});
