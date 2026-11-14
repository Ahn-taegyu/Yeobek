import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { createDocentHarness } from "../../src/lib/ai/harness";
import { ids, syntheticPublication, syntheticRequest } from "../fixtures/ai";

function setup(number = 18) {
  const publication = { ...syntheticPublication(), number };
  const publications = { load: vi.fn(async () => publication), isCurrent: vi.fn(async () => true) };
  const text = { generate: vi.fn(async () => ({
    output: { answer: "재료는 종이와 수채 물감입니다.", citations: [ids.evidence], outcome: "answered" },
    trace: { provider: "openai" as const, model: "fake" },
  })) };
  return { publication, publications, text, harness: createDocentHarness({ publications, text }) };
}

describe("visitor chat intent and artwork selection", () => {
  it.each([
    ["18", 18], ["01", 1], ["1", 1], ["18번", 18], ["십팔 번", 18],
  ] as const)("opens approved narration for a standalone number: %s", async (question, number) => {
    const s = setup(number);
    const reply = await s.harness.answer(syntheticRequest({ question, artworkId: null }));
    expect(s.publications.load).toHaveBeenCalledWith({ exhibitionId: ids.exhibition, number }, undefined);
    expect(reply).toMatchObject({ source: "approved_narration", answer: s.publication.narration?.text });
    expect(s.text.generate).not.toHaveBeenCalled();
  });

  it.each(["이 작품에 대해 알려줘", "작품 소개해 주세요", "설명 부탁해요", "해설 들려줘"])(
    "reuses the exact approved text for a general request: %s", async question => {
      const s = setup();
      const reply = await s.harness.answer(syntheticRequest({ question }));
      expect(reply).toMatchObject({ source: "approved_narration", answer: s.publication.narration?.text });
      expect(s.text.generate).not.toHaveBeenCalled();
    });

  it.each([
    "천 번을 봐도 좋네요. 재료가 뭔가요?",
    "이 번에 본 작품 재료는?",
    "이번 작품 재료는?",
    "이 작품을 18번 봐도 좋네요. 작가는 누구인가요?",
    "이 작품을 18번 왜 봤나요?",
    "18번 더 봐도 좋겠어요. 작가는 누구인가요?",
    "한지에 18번 덧칠했나요?",
    "이 작품은 18번이나 전시됐나요?",
    "공개 전시 횟수가 총 18번?",
    "2024년 작품 재료는 무엇인가요?",
    "붓질이 번졌나요?",
    "한 번 더 알려줘",
    "제 3번 질문은",
  ])("keeps the current artwork for dates, counts and ordinary text: %s", async question => {
    const s = setup();
    const reply = await s.harness.answer(syntheticRequest({ question }));
    expect(s.publications.load).toHaveBeenCalledWith({ exhibitionId: ids.exhibition, artworkId: ids.artwork }, undefined);
    expect(reply.source).toBe("generated");
  });

  it.each([
    "18번 재료가 뭔가요?",
    "18번 작품의 재료가 뭔가요?",
    "18번의 재료는?",
    "18번에서 쓰인 재료는?",
    "18번은 뭐야?",
    "18번 왜 파란색인가요?",
    "18번 설명해줘. 왜 파란색인가요?",
    "18번 작품 소개해 주세요. 재료는 뭐예요?",
    "18번 작품 해설을 요약해 주세요.",
    "18번 해설을 영어로 번역해 주세요.",
    "18번 설명을 새로 써 주세요.",
  ])("selects the numbered artwork and generates an answer for a specific question: %s", async question => {
    const s = setup();
    const reply = await s.harness.answer(syntheticRequest({ question, artworkId: ids.other }));
    expect(s.publications.load).toHaveBeenCalledWith({ exhibitionId: ids.exhibition, number: 18 }, undefined);
    expect(reply.source).toBe("generated");
    expect(s.text.generate).toHaveBeenCalledOnce();
  });

  it("uses explicit narration intent and the button's artwork ID", async () => {
    const s = setup();
    const reply = await s.harness.answer(syntheticRequest({ question: "들어 보기", intent: "narration" }));
    expect(s.publications.load).toHaveBeenCalledWith({ exhibitionId: ids.exhibition, artworkId: ids.artwork }, undefined);
    expect(reply).toMatchObject({ source: "approved_narration", answer: s.publication.narration?.text });
    expect(s.text.generate).not.toHaveBeenCalled();
  });

  it("uses the supplied artwork number in an explicit narration request", async () => {
    const s = setup(1);
    const reply = await s.harness.answer(syntheticRequest({
      question: "01", intent: "narration", artworkNumber: 1, artworkId: ids.other,
    }));
    expect(s.publications.load).toHaveBeenCalledWith({ exhibitionId: ids.exhibition, number: 1 }, undefined);
    expect(reply.source).toBe("approved_narration");
    expect(s.text.generate).not.toHaveBeenCalled();
  });

  it("uses the supplied number when a question includes a count", async () => {
    const s = setup(7);
    const reply = await s.harness.answer(syntheticRequest({
      question: "천 번을 봐도 좋네요. 재료가 뭔가요?", intent: "question", artworkNumber: 7,
    }));
    expect(s.publications.load).toHaveBeenCalledWith({ exhibitionId: ids.exhibition, number: 7 }, undefined);
    expect(reply.source).toBe("generated");
  });

  it("respects explicit question intent even when the text resembles a basic request", async () => {
    const s = setup();
    const reply = await s.harness.answer(syntheticRequest({
      question: "18번 작품 설명해줘", intent: "question", artworkId: ids.other,
    }));
    expect(s.publications.load).toHaveBeenCalledWith({ exhibitionId: ids.exhibition, number: 18 }, undefined);
    expect(reply.source).toBe("generated");
  });

  it("falls back to text interpretation when intent is omitted", async () => {
    const s = setup();
    const reply = await s.harness.answer(syntheticRequest({ question: "18" }));
    expect(s.publications.load).toHaveBeenCalledWith({ exhibitionId: ids.exhibition, number: 18 }, undefined);
    expect(reply.source).toBe("approved_narration");
  });

  it("rejects the retired auto intent instead of treating it as an explicit question", async () => {
    const s = setup();
    await expect(s.harness.answer({ ...syntheticRequest(), intent: "auto" })).rejects.toMatchObject({ code: "invalid_request" });
    expect(s.publications.load).not.toHaveBeenCalled();
  });

  it.each(["19", "19번 재료는?", "십구 번 작품 설명해줘"])("returns the same fixed clarification for an unavailable numbered work: %s", async question => {
    const s = setup();
    s.publications.load.mockResolvedValue(null as never);
    const reply = await s.harness.answer(syntheticRequest({ question }));
    expect(reply).toMatchObject({ source: "fixed", outcome: "clarify", publication: null });
    expect(reply.answer).toContain("해당 번호의 공개 작품을 찾을 수 없습니다");
    expect(s.text.generate).not.toHaveBeenCalled();
  });

  it.each(["19", "19번 재료는?"])("separates a paused work from a never-published number: %s", async question => {
    const paused = setup();
    const history = vi.fn(async () => true);
    const pausedHarness = createDocentHarness({ publications: { ...paused.publications, wasNumberPublished: history }, text: paused.text });
    paused.publications.load.mockResolvedValue(null as never);
    const pausedReply = await pausedHarness.answer(syntheticRequest({ question }));
    expect(history).toHaveBeenCalledWith(ids.exhibition, 19, undefined);
    expect(pausedReply).toMatchObject({ source: "fixed", outcome: "clarify", publication: null });
    expect(pausedReply.answer).toContain("온라인 안내를 제공하지 않아요");

    const missing = setup();
    const missingHarness = createDocentHarness({ publications: { ...missing.publications, wasNumberPublished: vi.fn(async () => false) }, text: missing.text });
    missing.publications.load.mockResolvedValue(null as never);
    const missingReply = await missingHarness.answer(syntheticRequest({ question }));
    expect(missingReply.answer).toContain("해당 번호의 공개 작품을 찾을 수 없습니다");
    expect(missing.text.generate).not.toHaveBeenCalled();
  });

  it("still rejects an unavailable selected ID without a number", async () => {
    const s = setup(); s.publications.load.mockResolvedValue(null as never);
    await expect(s.harness.answer(syntheticRequest())).rejects.toMatchObject({ code: "publication_unavailable" });
  });

  it.each(["19번 작품 해설", "18번과 19번", "18번보다 19번이 큰가요?", "18/19", "0", "10000"])(
    "clarifies conflicting, multiple or invalid numbers before loading a publication: %s", async question => {
      const s = setup();
      const reply = await s.harness.answer(syntheticRequest({ question, intent: "narration", artworkNumber: 18 }));
      expect(reply).toMatchObject({ outcome: "clarify", publication: null });
      expect(s.publications.load).not.toHaveBeenCalled();
      expect(s.text.generate).not.toHaveBeenCalled();
    });

  it.each(["19번은 언제 그렸나요?", "그런데 19번 언제 그렸나요?"])("clarifies an unclear label before using a previously selected artwork: %s", async question => {
    const s = setup();
    const reply = await s.harness.answer(syntheticRequest({ question }));
    expect(reply).toMatchObject({ outcome: "clarify", publication: null });
    expect(s.publications.load).not.toHaveBeenCalled();
  });
});
