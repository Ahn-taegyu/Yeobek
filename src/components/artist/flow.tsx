"use client";

import { useCallback } from "react";
import { requestApi } from "@/lib/client";
import { prepareFaq } from "./review";
import { ArtistLink, Header, Loading, useArtistLoad } from "./ui";
import styles from "./flow.module.css";

const root = (id: string) => `/artist/exhibitions/${id}`;

function useLatestBatch(id: string) {
  const load = useCallback(async (signal: AbortSignal) =>
    (await requestApi("getLatestTrainingBatch", { params: { id }, signal })).data, [id]);
  return useArtistLoad(load);
}

function NeedsTraining({ id }: { id: string }) {
  return <section className="artist-workflow yeobek-appear">
    <p>먼저 여운 학습을 마쳐주세요.</p>
    <ArtistLink className="artist-action" href={`${root(id)}/learning`}>여운 학습시키기</ArtistLink>
  </section>;
}

/** Figma 118: everything that checks what training produced, then retraining or finishing. */
export function VerificationHub({ id }: { id: string }) {
  const latest = useLatestBatch(id);
  if (latest.data === undefined) return <Loading {...latest} />;
  if (latest.data?.status !== "completed") return <><Header title="검토" back={`${root(id)}/learning`} /><NeedsTraining id={id} /></>;
  const succeeded = latest.data.targets.filter(target => target.status === "succeeded");
  const hasNarration = succeeded.some(target => target.kind === "narration");
  return <section className={`${styles.hub} yeobek-appear`}>
    <h1>어떤 내용을 검토할까요?</h1>
    <nav className={styles.main} aria-label="검토할 내용">
      {hasNarration && <ArtistLink href={`${root(id)}/verification/narration`}>작품 기본 소개 검토하기</ArtistLink>}
      <ArtistLink href={`${root(id)}/preview`}>여운 답변 미리보기</ArtistLink>
      <ArtistLink href={`${root(id)}/faq`} prepare={() => prepareFaq(id)}>관람객 예상 질문 보기</ArtistLink>
    </nav>
    <nav className={styles.sub} aria-label="학습 마무리">
      <ArtistLink href={`${root(id)}/learning?next=review`}>수정한 내용으로 다시 학습하기</ArtistLink>
      <ArtistLink href={`${root(id)}/publication`}
        prepare={() => import("./publication").then(({ preparePublication }) => preparePublication(id))}>학습 마무리하기</ArtistLink>
    </nav>
  </section>;
}
