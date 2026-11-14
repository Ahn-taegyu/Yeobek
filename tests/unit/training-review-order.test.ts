import { isValidElement, type ReactElement, type ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import InterviewPage from "@/app/artist/exhibitions/[id]/interview/page";
import LearningPage from "@/app/artist/exhibitions/[id]/learning/page";
import VerificationPage from "@/app/artist/exhibitions/[id]/verification/page";
import { ExhibitionInterviewChat } from "@/components/artist/exhibition-interview";
import { VerificationHub } from "@/components/artist/flow";
import { Learning } from "@/components/artist/review";
import { VerificationLinks, type TrainingBatch } from "@/components/artist/verification-links";
vi.mock("server-only", () => ({}));
vi.mock("@/components/artist/review", () => ({ Learning: () => null }));
vi.mock("@/components/artist/flow", () => ({ VerificationHub: () => null }));
vi.mock("@/components/artist/exhibition-interview", () => ({ ExhibitionInterviewChat: () => null }));
const redirect = vi.hoisted(() => vi.fn((url: string) => { throw new Error(`redirect:${url}`); }));
vi.mock("next/navigation", () => ({ redirect }));
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

describe("separate information/training, interview and review screens", () => {
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
  it("keeps training as its own screen and retrains with edits from review", async () => {
    const learning = (next?: string) => LearningPage({ params: Promise.resolve({ id }), searchParams: Promise.resolve({ next }) });
    vi.stubEnv("FEATURE_ARTWORK_INTERVIEW", "true");
    expect((await learning()).type).toBe(Learning);
    expect((await learning()).props).toEqual({ id, interviewEnabled: true, reflect: false });
    expect((await learning("review")).props).toEqual({ id, interviewEnabled: true, reflect: true });
    vi.stubEnv("FEATURE_ARTWORK_INTERVIEW", "false");
    expect((await learning("review")).props).toEqual({ id, interviewEnabled: false, reflect: true });
  });
  it("opens the interview screen only with the flag, otherwise goes straight to review", async () => {
    vi.stubEnv("FEATURE_ARTWORK_INTERVIEW", "true");
    const page = await InterviewPage({ params: Promise.resolve({ id }) });
    expect(page.type).toBe(ExhibitionInterviewChat);
    expect(page.props).toEqual({ id, voice: false });
    vi.stubEnv("FEATURE_ARTWORK_INTERVIEW", "false");
    await expect(InterviewPage({ params: Promise.resolve({ id }) })).rejects.toThrow(`redirect:/artist/exhibitions/${id}/verification`);
  });
  it("renders review as its own screen", async () => {
    const page = await VerificationPage({ params: Promise.resolve({ id }) });
    expect(page.type).toBe(VerificationHub);
    expect(page.props).toEqual({ id });
  });
});
