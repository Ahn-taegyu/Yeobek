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
    expect(mentionedArtworks("푸른 달빛은 무슨 뜻인가요?", labels).matches).toEqual([]);
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
    const publications = { listLabels: vi.fn(async () => entries), load: vi.fn(async () => syntheticPublication()), isCurrent: vi.fn(async () => true) };
    const text = { generate: vi.fn(async () => ({ output: { answer: "종이와 물감입니다.", citations: [ids.evidence], outcome: "answered" },
      trace: { provider: "openai" as const, model: "fake" } })) };
    return { publications, text, harness: createDocentHarness({ publications, text }) };
  }
  it("overrides a prior selected work and returns the new selection reference", async () => {
    const s = setup();
    const reply = await s.harness.answer({ ...syntheticRequest(), artworkId: labels[1].id, question: "푸른 달은 어떤 재료인가요?" });
    expect(s.publications.load).toHaveBeenCalledWith({ exhibitionId: ids.exhibition, artworkId: ids.artwork }, undefined);
    expect(reply.publication?.artworkId).toBe(ids.artwork);
    expect(reply.outcome).toBe("answered");
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
