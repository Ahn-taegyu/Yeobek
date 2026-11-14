import { isValidElement, type ReactElement, type ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import LearningPage from "@/app/artist/exhibitions/[id]/learning/page";
import { Learning } from "@/components/artist/review";
import { VerificationLinks, type TrainingBatch } from "@/components/artist/verification-links";
vi.mock("server-only", () => ({}));
vi.mock("@/components/artist/review", () => ({ Learning: () => null }));
afterEach(() => vi.unstubAllEnvs());

const id = "00000000-0000-4000-8000-000000000001";
const target = (kind: "narration" | "expected_qa", status: "succeeded" | "failed") => ({
  id: crypto.randomUUID(), kind, scope: kind === "narration" ? "artwork" as const : "exhibition" as const,
  artworkId: kind === "narration" ? crypto.randomUUID() : null, targetName: kind, jobId: crypto.randomUUID(),
  status, attempt: 1, resultCode: null,
});
const batch = (status: "queued" | "running" | "completed", targets = [target("narration", "succeeded"), target("expected_qa", "succeeded")]) =>
  ({ id: crypto.randomUUID(), exhibitionId: id, exhibitionName: "전시", artistName: "작가", status, targets }) as NonNullable<TrainingBatch>;
function links(value: NonNullable<TrainingBatch>) {
  const nav = VerificationLinks({ id, batch: value }) as ReactElement<{ children: ReactNode[] }> | null;
  if (!nav) return null;
  return nav.props.children.filter(isValidElement).map(child => {
    const props = (child as ReactElement<{ href: string; children: ReactNode }>).props;
    return [String(props.href), [props.children].flat().join("").trim()];
  });
}

describe("training → interview → review order", () => {
  it("hides every review link until the latest training batch has completed", () => {
    expect(links(batch("queued"))).toBeNull();
    expect(links(batch("running"))).toBeNull();
  });
  it("opens narration review, FAQ and the trained preview after training", () => {
    const value = batch("completed");
    expect(links(value)).toEqual([
      [`/artist/exhibitions/${id}/review?batch=${value.id}`, "기본 해설 검토"],
      [`/artist/exhibitions/${id}/faq`, "자주하는 질문"],
      [`/artist/exhibitions/${id}/preview`, "학습된 여운 체험하기"],
    ]);
  });
  it("keeps only the results that training actually produced", () => {
    expect(links(batch("completed", [target("narration", "failed"), target("expected_qa", "succeeded")]))).toEqual([
      [`/artist/exhibitions/${id}/faq`, "생성된 질문 보기"],
      [`/artist/exhibitions/${id}/preview`, "학습된 여운 체험하기"],
    ]);
  });
  it("passes the interview flag to the training screen", async () => {
    for (const flag of ["true", "false"]) {
      vi.stubEnv("FEATURE_ARTWORK_INTERVIEW", flag);
      const page = await LearningPage({ params: Promise.resolve({ id }) });
      expect(page.type).toBe(Learning);
      expect(page.props).toEqual({ id, interviewEnabled: flag === "true" });
    }
  });
});
