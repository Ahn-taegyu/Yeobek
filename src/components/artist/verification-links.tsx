"use client";

import { requestApi } from "@/lib/client";
import { ArtistLink } from "./ui";

export type TrainingBatch = Awaited<ReturnType<typeof requestApi<"getLatestTrainingBatch">>>["data"];

/** Review screens check what training produced, so they open only after a completed batch. */
export function VerificationLinks({ id, batch, prepareFaq }: {
  id: string; batch: NonNullable<TrainingBatch>; prepareFaq?: () => Promise<unknown>;
}) {
  if (batch.status !== "completed") return null;
  const root = `/artist/exhibitions/${id}`;
  const succeeded = batch.targets.filter(target => target.status === "succeeded");
  const incomplete = succeeded.length !== batch.targets.length;
  const hasNarration = succeeded.some(target => target.kind === "narration");
  const hasQuestions = succeeded.some(target => target.kind === "expected_qa");
  return <nav className="artist-actions" aria-label="학습 결과 검증">
    {hasNarration && <ArtistLink className="artist-action" href={`${root}/review?batch=${batch.id}`}
      prepare={() => import("./narration-review").then(({ prepareNarrationReview }) => prepareNarrationReview(id,
        batch.targets.find(target => target.kind === "narration" && target.status === "succeeded")?.artworkId ?? undefined))}>
      기본 해설 검토
    </ArtistLink>}
    {(!incomplete || hasQuestions) && <ArtistLink className="artist-action secondary" href={`${root}/faq`} prepare={prepareFaq}>
      {incomplete ? "생성된 질문 보기" : "자주하는 질문"}
    </ArtistLink>}
    <ArtistLink className="artist-action secondary" href={`${root}/preview`}>학습된 여운 체험하기</ArtistLink>
  </nav>;
}
