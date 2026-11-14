import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { mentionedArtworks } from "../../src/lib/ai/artwork-mentions";
import { createDocentHarness } from "../../src/lib/ai/harness";
import { ids, syntheticPublication, syntheticRequest } from "../fixtures/ai";
const labels = [{ id: ids.artwork, title: "푸른 달", number: 18 },
  { id: ids.other, title: "달", number: 19 }];

describe("public artwork title mentions", () => {
  it.each(["푸른 달은 어떤 재료인가요?", "작품 ‘푸른 달’의 의미", "푸른 달", "푸른   달에 대해 알려줘"])("matches explicit current title: %s", question => {
    expect(mentionedArtworks(question, labels).matches.map(x => x.id)).toEqual([ids.artwork]);
  });
  it("rejects substrings and requires a cue for a one-character title", () => {
    for (const question of ["푸른 달빛은 무슨 뜻인가요?", "푸른 달이야기는?", "푸른 달가림은?"]) {
      expect(mentionedArtworks(question, labels).matches).toEqual([]);
    }
    expect(mentionedArtworks("달은 어떤 의미인가요?", labels).matches).toEqual([]);
    expect(mentionedArtworks("작품 달은 어떤 의미인가요?", labels).matches).toEqual([labels[1]]);
  });
  it("keeps duplicate titles ambiguous and detects explicitly unknown titles", () => {
    expect(mentionedArtworks("푸른 달은?", [labels[0], { ...labels[1], title: "푸른 달" }]).matches).toHaveLength(2);
    expect(mentionedArtworks("작품 ‘없는 제목’을 알려줘", labels).explicitUnknown).toBe(true);
  });
  it("escapes title metacharacters", () => {
    expect(mentionedArtworks("작품 ‘달 [1]’은?", [{ ...labels[0], title: "달 [1]" }]).matches).toHaveLength(1);
  });
  function setup(entries = labels) {
    const publications = { listLabels: vi.fn(async () => entries), load: vi.fn(async () => ({ ...syntheticPublication(), title: entries[0].title })), isCurrent: vi.fn(async () => true) };
    const text = { generate: vi.fn(async () => ({ output: { answer: "종이와 물감입니다.", citations: [ids.evidence], outcome: "answered" },
      trace: { provider: "openai" as const, model: "fake" } })) };
    return { publications, text, harness: createDocentHarness({ publications, text }) };
  }
  it.each(["푸른 달은 어떤 재료인가요?", "푸른 달이 어떤 의미인가요?", "작품 푸른 바다가 어떤 의미인가요?", "푸른 달로 표현한 것은 무엇인가요?"])("overrides a prior selected work: %s", async question => {
    const s = setup(question.includes("바다") ? [{ ...labels[0], title: "푸른 바다" }, labels[1]] : labels);
    const reply = await s.harness.answer({ ...syntheticRequest(), artworkId: labels[1].id, question });
    expect(s.publications.load).toHaveBeenCalledWith({ exhibitionId: ids.exhibition, artworkId: ids.artwork }, undefined);
    expect(reply.publication?.artworkId).toBe(ids.artwork);
    expect(reply.outcome).toBe("answered");
  });
  it("does not answer a title that changed between label lookup and snapshot load", async () => {
    const s = setup();
    s.publications.load.mockResolvedValue({ ...syntheticPublication(), title: "다른 제목" });
    const reply = await s.harness.answer({ ...syntheticRequest(), question: "푸른 달은 어떤 재료인가요?" });
    expect(reply.outcome).toBe("clarify");
    expect(s.text.generate).not.toHaveBeenCalled();
  });
  it.each(["푸른 달과 작품 ‘달’의 재료는?", "19번 작품 푸른 달의 재료는?", "작품 ‘없는 제목’은 무엇인가요?", "푸른 달과 작품 ‘없는 제목’의 의미는?"])("clarifies ambiguous or inconsistent selection: %s", async question => {
    const s = setup();
    const reply = await s.harness.answer({ ...syntheticRequest(), question });
    expect(reply.outcome).toBe("clarify");
    expect(reply.publication).toBeNull();
    expect(s.publications.load).not.toHaveBeenCalled();
    expect(s.text.generate).not.toHaveBeenCalled();
  });
});
