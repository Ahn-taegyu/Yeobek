"use client";

import { useCallback } from "react";
import { requestApi } from "@/lib/client";
import { FlowSteps } from "./flow-steps";
import { loadArtworkList } from "./navigation-data";
import { prepareFaq } from "./review";
import { ArtistLink, Header, Loading, useArtistLoad } from "./ui";
import { VerificationLinks } from "./verification-links";

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

/** Step 2: per-artwork interviews. Approved answers reach narration and Q&A only after another training. */
export function InterviewHub({ id }: { id: string }) {
  const latest = useLatestBatch(id);
  return <>
    <Header title="AI 인터뷰" back={`${root(id)}/learning`} />
    <FlowSteps current={2} interviewEnabled />
    {latest.data === undefined ? <Loading {...latest} /> :
      latest.data?.status !== "completed" ? <NeedsTraining id={id} /> : <Interviews id={id} />}
  </>;
}

function Interviews({ id }: { id: string }) {
  const load = useCallback(async (signal: AbortSignal) => Promise.all((await loadArtworkList(id, signal)).map(async work => {
    const { data } = await requestApi("getArtworkInterview", { params: { id: work.id }, signal });
    return { id: work.id, title: work.draftTitle || work.title, asked: data.questions.length,
      approved: data.questions.filter(question => question.status === "approved").length };
  })), [id]);
  const result = useArtistLoad(load);
  if (!result.data) return <Loading {...result} />;
  const approved = result.data.reduce((sum, work) => sum + work.approved, 0);
  return <section className="artist-workflow yeobek-appear">
    <p>여운이 학습한 자료로 답하지 못한 내용을 작품별로 물어봐요. 승인한 답변은 다시 학습해야 해설과 질문에 반영돼요.</p>
    <ul className="artist-workflow-list">{result.data.map(work => <li key={work.id}>
      <strong>{work.title}</strong>
      <p className="artist-note">{work.asked ? `질문 ${work.asked}개 · 승인 ${work.approved}개` : "아직 인터뷰하지 않았어요"}</p>
      <ArtistLink className="artist-action secondary" href={`${root(id)}/artworks/${work.id}/interview`}>
        {work.asked ? "인터뷰 이어하기" : "인터뷰 시작"}
      </ArtistLink>
    </li>)}</ul>
    <div className="artist-flow-actions">
      {approved > 0 && <ArtistLink className="artist-action" href={`${root(id)}/learning?next=review`}>답변 반영해 다시 학습</ArtistLink>}
      <ArtistLink className={`artist-action${approved > 0 ? " secondary" : ""}`} href={`${root(id)}/verification`}>
        {approved > 0 ? "반영 없이 검토로" : "다음: 검토"}
      </ArtistLink>
    </div>
  </section>;
}

/** Step 3: every screen that checks what training produced, plus publishing. */
export function VerificationHub({ id, interviewEnabled }: { id: string; interviewEnabled: boolean }) {
  const latest = useLatestBatch(id);
  return <>
    <Header title="검토" back={`${root(id)}/${interviewEnabled ? "interview" : "learning"}`} />
    <FlowSteps current={3} interviewEnabled={interviewEnabled} />
    {latest.data === undefined ? <Loading {...latest} /> :
      latest.data?.status !== "completed" ? <NeedsTraining id={id} /> : <section className="artist-workflow yeobek-appear">
        <p>학습 결과를 확인하고 승인한 내용만 게시할 수 있어요.</p>
        <VerificationLinks id={id} batch={latest.data} prepareFaq={() => prepareFaq(id)} />
        <div className="artist-actions">
          <ArtistLink className="artist-action secondary" href={`${root(id)}/publication`}
            prepare={() => import("./publication").then(({ preparePublication }) => preparePublication(id))}>전시 게시 관리</ArtistLink>
        </div>
      </section>}
  </>;
}
