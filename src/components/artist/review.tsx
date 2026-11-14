"use client";

import Link from "next/link";
import Image from "next/image";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { ApiClientError, requestApi } from "@/lib/client";
import { AI_LIMITS } from "@/lib/contracts/chat";

import type { PreviewAnswer, QaRewriteJob } from "@/lib/contracts/qa";
import { errorMessage, Field, Header, Loading, PrivateImage, useArtistLoad } from "./ui";

type Batch = Awaited<ReturnType<typeof requestApi<"getTrainingBatch">>>["data"];
type Target = Batch["targets"][number];
type QaItem = Awaited<ReturnType<typeof requestApi<"listQaItems">>>["data"][number];

const statuses = { queued: "대기 중", running: "학습 중", succeeded: "완료", abstained: "자료 확인 필요", failed: "실패", cancelled: "취소됨" };
const root = (id: string) => `/artist/exhibitions/${id}`;

function canRunTarget(target: Target) {
  return target.status === "queued" || target.attempt !== null && target.resultCode !== "JOB_EXPIRED" &&
    (target.status === "failed" || target.status === "cancelled");
}

function latestVisibleQaItems(items: QaItem[]) {
  const latest = new Map<string, QaItem>();
  for (const item of items) {
    const previous = latest.get(item.id);
    if (!previous || item.version > previous.version) latest.set(item.id, item);
  }
  return [...latest.values()].filter(item => item.state !== "withdrawn");
}

function useReviewData(id: string) {
  return useArtistLoad(useCallback(async (signal: AbortSignal) => {
    const params = { id };
    const [exhibition, artworks] = await Promise.all([
      requestApi("getExhibition", { params, signal }), requestApi("listArtworks", { params, signal }),
    ]);
    return { exhibition: exhibition.data, works: artworks.data.items };
  }, [id]));
}

export function Learning({ id }: { id: string }) {
  const result = useReviewData(id);
  const [batch, setBatch] = useState<Batch | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const operation = useRef<AbortController | null>(null);
  const creationId = useRef<string | null>(null);
  const targetRequests = useRef(new Map<string, { requestId: string; expectedAttempt: number }>());
  useEffect(() => () => operation.current?.abort(), []);

  async function run() {
    if (!result.data || operation.current) return;
    const controller = new AbortController();
    operation.current = controller;
    setBusy(true);
    setError("");
    try {
      const restart = batch?.status === "completed" &&
        batch.targets.some(target => target.resultCode === "JOB_EXPIRED");
      if (restart) {
        creationId.current = null;
        targetRequests.current.clear();
        setBatch(null);
      }
      creationId.current ??= crypto.randomUUID();
      let next = batch && !restart
        ? (await requestApi("getTrainingBatch", { params: { id: batch.id }, signal: controller.signal })).data
        : (await requestApi("createTrainingBatch", { params: { id },
          body: { requestId: creationId.current, expectedRevision: result.data.exhibition.revision }, signal: controller.signal })).data;
      setBatch(next);
      const runningTarget = next.targets.find(target => target.status === "running");
      const targetIds = next.targets.map(target => target.id).filter(id => id !== runningTarget?.id);
      if (runningTarget) targetIds.unshift(runningTarget.id);
      for (const targetId of targetIds) {
        const target = next.targets.find(item => item.id === targetId);
        if (!target) continue;
        const expectedAttempt = target.attempt ?? 0;
        const pending = targetRequests.current.get(target.id);
        const running = next.targets.find(item => item.status === "running");
        if (running && running.id !== target.id) break;
        // Running work can only replay its original claim, whose input preceded the stored attempt.
        const replay = pending && pending.expectedAttempt ===
          (target.status === "running" ? expectedAttempt - 1 : expectedAttempt);
        if (!canRunTarget(target) && !(target.status === "running" && replay)) continue;
        const body = replay ? pending : { requestId: crypto.randomUUID(), expectedAttempt };
        targetRequests.current.set(target.id, body);
        next = (await requestApi("runTrainingTarget", {
          params: { id: next.id, targetId: target.id }, signal: controller.signal, body,
        })).data;
        if (next.targets.find(item => item.id === target.id)?.status !== "running") {
          targetRequests.current.delete(target.id);
        }
        setBatch(next);
      }
    } catch (error) {
      if (controller.signal.aborted) return;
      if (error instanceof ApiClientError && error.code === "REVISION_CONFLICT") {
        creationId.current = null;
        targetRequests.current.clear();
        setBatch(null);
        result.retry();
        setError("전시 내용이 바뀌었어요. 최신 내용으로 다시 학습시켜 주세요.");
      } else {
        setError(errorMessage(error));
      }
    } finally {
      operation.current = null;
      if (!controller.signal.aborted) setBusy(false);
    }
  }

  const completed = batch?.targets.filter(item => item.status === "succeeded").length ?? 0;
  const running = batch?.targets.some(item => item.status === "running");
  const needsMaterial = batch?.targets.some(item => item.status === "abstained");
  const expired = batch?.targets.some(item => item.resultCode === "JOB_EXPIRED");
  const incomplete = batch?.status === "completed" && completed !== batch.targets.length;
  const hasQuestions = batch?.targets.some(item => item.kind === "expected_qa" && item.status === "succeeded");
  const hasNarration = batch?.targets.some(item => item.kind === "narration" && item.status === "succeeded");
  return <>
    {!result.data ? <Loading {...result} /> : <section className="artist-learning yeobek-appear">
      <div className="artist-learning-names">
        {batch?.artistName && <span>{batch.artistName}</span>}
        <strong>{result.data.exhibition.title}</strong>
        {result.data.works.slice(0, 3).map(work => <span key={work.id}>{work.title}</span>)}
      </div>
      <div className="artist-learning-art" aria-hidden="true">
        {result.data.works.flatMap(work => work.imageMaterialId ? [work.imageMaterialId] : []).slice(0, 3).map(id =>
          <PrivateImage key={id} materialId={id} alt="" className="artist-learning-image" />)}
        <Image className="artist-learning-shadow" src="/yeobek/learning-shadow.svg" width={418} height={83} alt="" unoptimized />
        <Image className="artist-learning-shadow-inner" src="/yeobek/learning-shadow-inner.svg" width={158} height={39} alt="" unoptimized />
        <Image className="artist-learning-lens" src="/yeobek/learning-lens.svg" width={137} height={137} alt="" unoptimized />
      </div>
      <h2 role="status">{busy || running ? "여운이 정보를 학습하고 있어요" : "여운 학습시키기"}</h2>
      {result.data.works.length ? <>
        {batch && <progress aria-label="학습 진행" max={batch.targets.length || 1} value={completed} />}
        {(!batch || running || expired || batch.targets.some(canRunTarget)) && <button className="artist-action" disabled={busy} onClick={() => void run()}>
          {busy ? "학습 중…" : running ? "진행 확인" : batch ? "다시 시도" : "여운 학습시키기"}
        </button>}
        {incomplete && <p role="status">{needsMaterial ? "학습을 마치지 못했어요. 전시 자료를 확인해주세요." : "일부 학습을 마치지 못했어요. 다시 시도해주세요."}</p>}
        {batch && hasNarration && <Link className="artist-action" href={`${root(id)}/review?batch=${batch.id}`}>
          기본 해설 검토
        </Link>}
        {batch?.status === "completed" && (!incomplete || hasQuestions) &&
          <Link className={`artist-action${incomplete ? " secondary" : ""}`} href={`${root(id)}/faq`}>
            {incomplete ? "생성된 질문 보기" : "자주하는 질문"}
          </Link>}
      </> : <p>먼저 작품을 등록해주세요.</p>}
      {error && <p className="error" role="alert">{error}</p>}
    </section>}
  </>;
}

export function Faq({ id }: { id: string }) {
  const load = useCallback(async (signal: AbortSignal) => {
    const params = { id };
    const { data } = await requestApi("listArtworks", { params, signal });
    const scopes = [{}, ...data.items.map(work => ({ artworkId: work.id }))];
    const items: QaItem[] = [];
    for (let offset = 0; offset < scopes.length; offset += 5) {
      const lists = await Promise.all(scopes.slice(offset, offset + 5)
        .map(query => requestApi("listQaItems", { params, query, signal })));
      items.push(...lists.flatMap(({ data }) => data));
    }
    return latestVisibleQaItems(items);
  }, [id]);
  const result = useArtistLoad(load);
  return <div className="artist-faq yeobek-appear">
    <Header title="자주하는 질문" back={root(id)} />
    {result.data ? <>
      {result.data.length ? <ul>{result.data.map(item => {
        const params = new URLSearchParams({ qa: item.id });
        if (item.artworkId) params.set("work", item.artworkId);
        return <li key={item.id}><Link href={`${root(id)}/preview?${params}`}>
          <span>{item.question}</span><span aria-hidden="true">›</span>
        </Link></li>;
      })}</ul> : <p>등록된 예상 질문이 없어요.</p>}
      <Link className="artist-action" href={`${root(id)}/preview`}>여운 답변 미리보기</Link>
    </> : <Loading {...result} />}
  </div>;
}

export function Preview({ id, initialArtworkId, qaId }: { id: string; initialArtworkId?: string; qaId?: string }) {
  const result = useReviewData(id);
  const artworkId = initialArtworkId ?? "";
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState<PreviewAnswer | null>(null);

  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const pending = useRef<{ question: string; artworkId: string; requestId: string } | null>(null);

  async function act(fn: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    setError("");
    try { await fn(); } catch (error) { setError(errorMessage(error)); }
    finally { setBusy(false); }
  }

  function ask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = question.trim();
    if (!text) return;
    void act(async () => {
      if (pending.current?.question !== text || pending.current.artworkId !== artworkId) {
        pending.current = { question: text, artworkId, requestId: crypto.randomUUID() };
      }
      const { data } = await requestApi("previewChat", {
        params: { id }, body: { question: text, artworkId: artworkId || null, requestId: pending.current.requestId },
      });
      if (data.status === "running") {
        setError("답변을 준비 중이에요. 잠시 후 같은 질문으로 확인해주세요.");
        return;
      }
      setAnswer(data);

      setEditing(false);
      setQuestion("");
      pending.current = null;
    });
  }

  function evaluate(value: "accurate" | "needs_revision") {
    if (!answer) return;
    void act(async () => {
      await requestApi("evaluatePreviewAnswer", {
        params: { id: answer.id }, body: { rating: value, requestId: crypto.randomUUID() },
      });

      setEditing(value === "needs_revision");
    });
  }

  const loadCandidate = useCallback(async (signal: AbortSignal) => {
    if (!qaId) return null;
    const { data } = await requestApi("listQaItems", {
      params: { id }, query: artworkId ? { artworkId } : {}, signal,
    });
    return latestVisibleQaItems(data).find(item => item.id === qaId) ?? null;
  }, [id, artworkId, qaId]);
  const candidate = useArtistLoad(loadCandidate);
  const firstQuestion = candidate.data?.question;
  const work = result.data?.works.find(item => item.id === (answer?.artworkId ?? artworkId));
  return <>
    <Header title="AI 답변 미리보기" back={`${root(id)}/faq`} />
    {!result.data ? <Loading {...result} /> : <>
      {!answer && candidate.data && <section className="artist-preview yeobek-appear">
        <p className="artist-question">{candidate.data.question}</p>
        {work?.imageMaterialId && <PrivateImage materialId={work.imageMaterialId} alt={work.title} className="artist-preview-image" />}
        <p>{candidate.data.answer}</p>
      </section>}
      {answer && <section className="artist-preview yeobek-appear" aria-live="polite">
        <p className="artist-question">{answer.question}</p>
        {work?.imageMaterialId && <PrivateImage key={work.imageMaterialId} materialId={work.imageMaterialId} alt={work.title} className="artist-preview-image" />}
        {answer.result ? <>
          <p>{answer.result.answer}</p>

          <p>이 답변이 정확한가요?</p>
          <div className="artist-actions">
            <button className="artist-action" disabled={busy} onClick={() => evaluate("accurate")}>정확해요</button>
            <button className="artist-action secondary" disabled={busy} onClick={() => evaluate("needs_revision")}>수정이 필요해요</button>
          </div>

        </> : <p>답변을 만들지 못했어요. 다른 질문을 입력해주세요.</p>}
      </section>}
      <form onSubmit={ask} aria-busy={busy}>
        <Field label="질문"><input value={question} onChange={event => setQuestion(event.target.value)}
          placeholder={firstQuestion ?? "자유롭게 질문해보세요"} maxLength={AI_LIMITS.question} disabled={busy} required /></Field>
        <button className="artist-action" disabled={busy}>{busy ? "처리 중…" : "보내기"}</button>
      </form>
      {error && <p className="error" role="alert">{error}</p>}
      {editing && answer?.result && <Rewrite key={answer.id} answer={answer} onClose={() => setEditing(false)} />}
    </>}
  </>;
}

function Rewrite({ answer, onClose }: { answer: PreviewAnswer; onClose: () => void }) {


  const [job, setJob] = useState<QaRewriteJob | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const load = useCallback(async (signal: AbortSignal) => {
    if (!answer.artworkId) return [];
    const { data } = await requestApi("reviewArtwork", { params: { id: answer.artworkId }, signal });
    return data.evidence.filter(item => item.state === "approved" && answer.result?.citations.includes(item.id));
  }, [answer]);
  const existing = useArtistLoad(load);

  useEffect(() => {
    const modal = dialog.current;
    modal?.showModal();
    return () => modal?.close();
  }, []);

  async function act(fn: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    setError("");
    try { await fn(); } catch (error) { setError(errorMessage(error)); }
    finally { setBusy(false); }
  }

  function close() {
    const modal = dialog.current;
    if (!modal?.open) return;
    modal.close();
    void Promise.allSettled(modal.getAnimations().map(animation => animation.finished)).then(onClose);
  }

  const target = { targetKind: "preview" as const, targetId: answer.id, targetVersion: null };
  const pins = existing.data ?? [];

  function rewrite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!pins.length) return;
    const instruction = String(new FormData(event.currentTarget).get("instruction")).trim();
    if (!instruction) return;
    void act(async () => {
      const { data } = await requestApi("rewriteQa", { body: {
        ...target, requestId: crypto.randomUUID(), instruction, evidencePins: pins.slice(0, AI_LIMITS.evidenceCount)
          .map(({ id, version }) => ({ id, version })),
      } });
      setJob(data);
    });
  }

  return <dialog ref={dialog} className="artist-sheet" onCancel={event => { event.preventDefault(); close(); }} aria-labelledby="rewrite-title">
    <div className="artist-actions">
      <h2 id="rewrite-title">AI 답변 수정</h2>
      <button className="artist-sheet-close" aria-label="닫기" onClick={close}>×</button>
    </div>
    <dl><dt>질문</dt><dd>{answer.question}</dd><dt>여운 답변</dt><dd>{answer.result?.answer}</dd></dl>
    <form onSubmit={rewrite}>
      <Field label="수정한 내용"><textarea name="instruction" maxLength={2000} required disabled={busy} /></Field>
      {!pins.length && <p>이 답변은 지금 수정할 수 없어요.</p>}
      <button className="artist-action" disabled={busy || !pins.length}>수정 내용 저장하기</button>
    </form>
    {job && <p role="status">{job.status === "succeeded" ? "수정한 내용을 저장했어요." : statuses[job.status]}</p>}
    {(error || existing.error) && <p className="error" role="alert">{error || existing.error}</p>}
  </dialog>;
}
