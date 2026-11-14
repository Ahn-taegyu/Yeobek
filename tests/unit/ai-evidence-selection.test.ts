import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { questionTerms, selectEvidence } from "../../src/lib/ai/context";
import { AI_LIMITS } from "../../src/lib/policy";
import { evidenceId, selectionCases, selectionEvidence } from "../fixtures/evidence-selection";

describe("visitor evidence selection", () => {
  it("strips one trailing particle or ending and drops question framing", () => {
    expect(questionTerms("마을은 창밖에서 보였나요?")).toEqual(["마을", "창밖", "보였"]);
    expect(questionTerms("판화도 하셨던 분인가요?")).toEqual(["판화", "하셨던", "분인"]);
    expect(questionTerms("무엇을 어떻게 그렸어요? 1888년")).toEqual(["그렸", "1888"]);
    expect(questionTerms("배는")).toEqual(["배는"]);
  });

  it("keeps the excerpt that answers each fictional question when candidates exceed the count limit", () => {
    expect(selectionEvidence.length).toBeGreaterThan(AI_LIMITS.evidenceCount);
    for (const { question, expected } of selectionCases) {
      const selected = selectEvidence(selectionEvidence, question).map(item => item.id);
      expect(selected, question).toHaveLength(AI_LIMITS.evidenceCount);
      expect(selected.slice(0, 5), question).toContain(evidenceId(expected));
    }
  });

  it("matches common-scope excerpts despite a different particle", () => {
    expect(selectEvidence(selectionEvidence, "판화도 하셨던 분인가요?")[0].id).toBe(evidenceId("E19"));
    expect(selectEvidence(selectionEvidence, "연작은 몇 점이에요?")[0].id).toBe(evidenceId("E15"));
  });

  it("weights the rare asked-about stem above a shared title word, regardless of excerpt length", () => {
    const [base] = selectionEvidence;
    const notice = (i: number) => ({ ...base, id: `notice-${i}`, body: `해바라기 관람 안내 ${i}번입니다.` });
    const direct = { ...base, id: "direct", body: "앞서 그린 해바라기를 다시 그렸습니다. 꽃 머리에는 물감을 덧칠했습니다. 위쪽에는 나무 띠를 덧대 화면을 넓혔습니다." };
    const selected = selectEvidence([notice(1), notice(2), notice(3), direct], "이 해바라기의 화면 윗부분에 덧댄 나무 띠는요?");
    expect(selected[0].id).toBe("direct");
  });

  it("keeps server order and artwork scope first when nothing matches", () => {
    const ordered = selectEvidence(selectionEvidence, "zzz").map(item => item.scope);
    expect(ordered.slice(0, 12).every(scope => scope === "artwork")).toBe(true);
    expect(selectEvidence(selectionEvidence, "zzz")[0].id).toBe(evidenceId("E01"));
  });
});
