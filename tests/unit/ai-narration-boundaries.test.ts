import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { createDocentHarness, speakVerifiedReply, validateAnswer } from "../../src/lib/ai/harness";
import { validateSpeechText } from "../../src/lib/ai/providers/http";
import { hash, ids, syntheticPublication, syntheticRequest } from "../fixtures/ai";

function setup(text: string) {
  const publication = syntheticPublication();
  publication.narration!.text = text;
  const publications = { load: vi.fn(async () => publication), isCurrent: vi.fn(async () => true) };
  const generator = { generate: vi.fn(async () => ({ output: {
    answer: "종이와 수채 물감입니다.", citations: [ids.evidence], outcome: "answered",
  }, trace: { provider: "openai" as const, model: "fake" } })) };
  const speech = { synthesize: vi.fn(async () => ({ audio: new Uint8Array([1]), contentType: "audio/mpeg",
    trace: { provider: "typecast" as const, model: "fake" } })) };
  return { publication, publications, generator, speech,
    harness: createDocentHarness({ publications, text: generator }) };
}
const speechRequest = { sessionId: ids.session, answerId: ids.request };

describe("approved narration and generated answer boundaries", () => {
  it.each([600, 601, 2000])("preserves %i approved codepoints in text and speech, with no generation", async length => {
    const text = "🌙".repeat(length);
    const s = setup(text);
    const reply = await s.harness.answer(syntheticRequest({ question: "해설 보기" }));
    expect(reply).toMatchObject({ source: "approved_narration", answer: text });
    const audio = await speakVerifiedReply(speechRequest, { ...s, answers: { loadAnswer: async () => reply } });
    expect(s.speech.synthesize).toHaveBeenCalledWith({ text, signal: undefined });
    expect(audio.textHash).toBe(hash(text));
    expect(s.generator.generate).not.toHaveBeenCalled();
    expect(() => validateSpeechText(text)).not.toThrow();
  });
  it.each([601, 2000])("still answers follow-up questions with a %i-codepoint approved narration", async length => {
    const s = setup("가".repeat(length));
    const reply = await s.harness.answer(syntheticRequest({ question: "재료는 무엇인가요?" }));
    expect(reply.source).toBe("generated");
    expect(s.generator.generate).toHaveBeenCalledOnce();
  });
  it("rejects 2001 approved codepoints before generation or speech", async () => {
    const s = setup("🌙".repeat(2001));
    await expect(s.harness.answer(syntheticRequest())).rejects.toMatchObject({ code: "invalid_context" });
    expect(s.generator.generate).not.toHaveBeenCalled();
    expect(() => validateSpeechText(s.publication.narration!.text)).toThrow(expect.objectContaining({ code: "invalid_input" }));
  });
  it("retains the 600-codepoint bound and URL guard for generated answers", () => {
    const answer = { answer: "🌙".repeat(600), citations: [ids.evidence], outcome: "answered" };
    expect(validateAnswer(answer, [ids.evidence])).toEqual(answer);
    for (const text of ["🌙".repeat(601), "https://artist.example"]) {
      expect(() => validateAnswer({ ...answer, answer: text }, [ids.evidence])).toThrow(expect.objectContaining({ code: "invalid_output" }));
    }
  });
  it("preserves a published approved URL in both text and speech", async () => {
    const text = "작가가 승인한 안내입니다. https://artist.example";
    const s = setup(text);
    const reply = await s.harness.answer(syntheticRequest({ question: "해설 보기" }));
    await speakVerifiedReply(speechRequest, { ...s, answers: { loadAnswer: async () => reply } });
    expect(s.speech.synthesize).toHaveBeenCalledWith({ text, signal: undefined });
  });
  it.each(["text", "citations", "version", "publication", "missing", "source", "outcome"])("rejects a saved approved reply with changed %s", async kind => {
    const s = setup("승인된 원문입니다.");
    const reply = await s.harness.answer(syntheticRequest({ question: "해설 보기" }));
    if (kind === "text") reply.answer = "다른 본문입니다.";
    if (kind === "citations") reply.citations = [ids.other];
    if (kind === "version") reply.publication!.version += 1;
    if (kind === "publication") reply.publication!.publicationId = ids.other;
    if (kind === "missing") s.publication.narration = null;
    if (kind === "source") Object.assign(reply, { source: "untrusted" });
    if (kind === "outcome") reply.outcome = "clarify";
    await expect(speakVerifiedReply(speechRequest, { ...s, answers: { loadAnswer: async () => reply } })).rejects.toMatchObject({ code: "invalid_output" });
    expect(s.speech.synthesize).not.toHaveBeenCalled();
  });
  it("does not give a generated saved reply the approved text budget", async () => {
    const s = setup("가".repeat(2000));
    const reply = await s.harness.answer(syntheticRequest());
    reply.answer = "가".repeat(601);
    await expect(speakVerifiedReply(speechRequest, { ...s, answers: { loadAnswer: async () => reply } })).rejects.toMatchObject({ code: "invalid_output" });
    expect(s.speech.synthesize).not.toHaveBeenCalled();
  });
  it("still blocks revoked approved narration after synthesis", async () => {
    const s = setup("가".repeat(2000));
    const reply = await s.harness.answer(syntheticRequest({ question: "해설 보기" }));
    s.publications.isCurrent.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    await expect(speakVerifiedReply(speechRequest, { ...s, answers: { loadAnswer: async () => reply } })).rejects.toMatchObject({ code: "publication_unavailable" });
  });
  it("checks revocation before loading approved text for speech", async () => {
    const s = setup("가".repeat(2000));
    const reply = await s.harness.answer(syntheticRequest({ question: "해설 보기" }));
    s.publications.load.mockClear();
    s.publications.isCurrent.mockResolvedValue(false);
    await expect(speakVerifiedReply(speechRequest, { ...s, answers: { loadAnswer: async () => reply } })).rejects.toMatchObject({ code: "publication_unavailable" });
    expect(s.publications.load).not.toHaveBeenCalled();
    expect(s.speech.synthesize).not.toHaveBeenCalled();
  });
});
