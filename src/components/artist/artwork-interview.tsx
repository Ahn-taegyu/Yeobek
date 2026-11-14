"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { ApiClientError, requestApi } from "@/lib/client";
import { boundedText, codepoints } from "@/lib/contracts/chat";
import { interviewMaxAnswer, interviewMaxQuestions, type Interview, type WriteInterviewAnswer } from "@/lib/contracts/interview";

const answerText = boundedText(interviewMaxAnswer);
const button = "rounded-md border border-current px-3 py-2 text-sm disabled:opacity-50";

export function ArtworkInterview({ artworkId, initial }: { artworkId: string; initial: Interview }) {
  const [interview, setInterview] = useState(initial);
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [editingApproved, setEditingApproved] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [generationId, setGenerationId] = useState<string | null>(null);
  const locked = useRef(false);

  async function run(action: () => Promise<void>) {
    if (locked.current) return;
    locked.current = true;
    setBusy(true);
    setNotice("");
    setError("");
    try {
      await action();
    } catch (failure) {
      setError(failure instanceof ApiClientError ? failure.message : "요청을 처리하지 못했습니다.");
    } finally {
      locked.current = false;
      setBusy(false);
    }
  }

  function generate() {
    void run(async () => {
      const requestId = generationId ?? crypto.randomUUID();
      setGenerationId(requestId);
      const { data } = await requestApi("generateArtworkInterview", { params: { id: artworkId }, body: { requestId } });
      setInterview(current => ({ ...current, questions: data.questions }));
      if (data.job.status === "running") {
        setNotice("질문을 만드는 중입니다. 잠시 뒤 다시 확인해 주세요.");
        return;
      }
      setGenerationId(null);
      if (data.job.status === "failed" || data.job.status === "cancelled") {
        setError("질문을 만들지 못했습니다. 작품 사진을 확인한 뒤 다시 시도해 주세요.");
      } else {
        setNotice(data.questions.length > interview.questions.length ? "질문을 만들었습니다." : "추가할 질문을 찾지 못했습니다.");
      }
    });
  }

  function update(questionId: string, body: WriteInterviewAnswer) {
    void run(async () => {
      const { data } = await requestApi("updateArtworkInterviewAnswer", { params: { id: artworkId, questionId }, body });
      setInterview(data);
      setEditingApproved(null);
      setEdits(current => {
        const next = { ...current };
        delete next[questionId];
        return next;
      });
      setNotice(body.action === "approve" ? "근거를 승인했습니다. 관람객에게 공개하려면 전시 게시를 완료해 주세요." :
        body.action === "skip" ? "질문을 건너뛰었습니다." : "근거 초안을 저장했습니다.");
    });
  }

  return (
    <main className="mx-auto max-w-2xl space-y-6 px-4 py-8">
      <Link className="text-sm underline underline-offset-4" href={`/artist/exhibitions/${interview.exhibitionId}`}>전시로 돌아가기</Link>
      <div className="space-y-2">
        <p className="text-sm">{interview.artworkTitle}</p>
        <h1 className="text-2xl font-semibold">작품 인터뷰</h1>
        <p className="text-sm">사진과 글 자료를 바탕으로 만든 질문에 글로 답해 주세요. 승인한 답변만 전시를 게시할 때 공개 근거에 포함됩니다.</p>
      </div>
      {!interview.imageReady && <p className="text-sm">질문을 만들려면 작품 사진을 먼저 등록해 주세요.</p>}
      <div className="flex flex-wrap items-center gap-3">
        <button className={button} disabled={busy || !interview.imageReady || interview.questions.length >= interviewMaxQuestions} onClick={generate}>
          {generationId ? "질문 생성 확인" : interview.questions.length ? "질문 더 만들기" : "인터뷰 시작"}
        </button>
        <span className="text-sm">{interview.questions.length} / {interviewMaxQuestions}개</span>
        <button className={button} disabled={busy} onClick={() => void run(async () => {
          const { data } = await requestApi("getArtworkInterview", { params: { id: artworkId } });
          setInterview(data);
        })}>새로 불러오기</button>
      </div>
      <div role="status" className="text-sm">{busy ? "처리 중입니다." : notice}</div>
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      <ol className="space-y-4">
        {interview.questions.map(question => {
          const saved = question.answer ?? "";
          const text = edits[question.id] ?? saved;
          const approved = question.status === "approved";
          const editing = editingApproved === question.id;
          return (
            <li className="space-y-3 rounded-lg border p-4" key={question.id}>
              <label className="block font-medium" htmlFor={question.id}>{question.question}</label>
              <textarea id={question.id} className="block w-full rounded-md border p-2" rows={4}
                readOnly={approved && !editing} disabled={busy} value={text}
                onChange={event => setEdits(current => ({ ...current, [question.id]: event.target.value }))} />
              <p className="text-sm">{approved ? "공개 근거 승인됨" :
                question.status === "skipped" ? "건너뜀" : `${codepoints(text)} / ${interviewMaxAnswer}자`}</p>
              {approved && !editing && <button className={button} disabled={busy}
                onClick={() => setEditingApproved(question.id)}>답변 수정</button>}
              {approved && editing && <p className="text-sm">수정 내용을 저장하면 새 근거 초안이 되며 다시 승인해야 합니다.</p>}
              {(!approved || editing) && <div className="flex flex-wrap gap-2">
                <button className={button} disabled={busy || (!editing && text === saved) || !answerText.safeParse(text.trim()).success}
                  onClick={() => update(question.id, { action: "save", expectedVersion: question.version, answer: text })}>답변 저장</button>
                <button className={button} disabled={busy || question.status === "skipped"}
                  onClick={() => update(question.id, { action: "skip", expectedVersion: question.version })}>건너뛰기</button>
                {question.status === "answered" && <button className={button} disabled={busy || text !== saved}
                  onClick={() => update(question.id, { action: "approve", expectedVersion: question.version })}>공개 근거로 사용</button>}
              </div>}
            </li>
          );
        })}
      </ol>
    </main>
  );
}
