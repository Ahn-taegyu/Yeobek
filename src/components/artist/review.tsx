"use client";

import Image from "next/image";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { ApiClientError, requestApi } from "@/lib/client";
import { forgetArtistPage, loadArtistPage } from "@/lib/client/artist-navigation";
import { AI_LIMITS } from "@/lib/contracts/chat";

import type { PreviewAnswer, QaRewriteJob } from "@/lib/contracts/qa";
import { ArtistLink, errorMessage, Field, Header, Loading, PrivateImage, useArtistLoad } from "./ui";
import { artworkListKey, exhibitionKey, loadArtworkList, loadExhibitionOverview, overviewKey } from "./navigation-data";

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
  const load = useCallback((signal: AbortSignal) => loadExhibitionOverview(id, signal), [id]);
  return useArtistLoad(load, overviewKey(id), () => {
    forgetArtistPage(exhibitionKey(id));
    forgetArtistPage(artworkListKey(id));
  });
}

export function Learning({ id }: { id: string }) {
  const result = useReviewData(id);
  const loadLatest = useCallback(async (signal: AbortSignal) =>
    (await requestApi("getLatestTrainingBatch", { params: { id }, signal })).data, [id]);
  const latest = useArtistLoad(loadLatest);
  const [updatedBatch, setBatch] = useState<Batch | null>();
  const batch = updatedBatch === undefined ? latest.data : updatedBatch;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const operation = useRef<AbortController | null>(null);
  const creationId = useRef<string | null>(null);
  const targetRequests = useRef(new Map<string, { requestId: string; expectedAttempt: number }>());
  useEffect(() => () => operation.current?.abort(), []);

  async function run(startNew = false) {
    if (!result.data || batch === undefined || operation.current) return;
    const controller = new AbortController();
    operation.current = controller;
    setBusy(true);
    setError("");
    try {
      const restart = startNew || (batch?.status === "completed" &&
        batch.targets.some(target => target.resultCode === "JOB_EXPIRED"));
      if (restart) targetRequests.current.clear();
      let next = batch && !restart
        ? (await requestApi("getTrainingBatch", { params: { id: batch.id }, signal: controller.signal })).data
        : (await requestApi("createTrainingBatch", { params: { id },
          body: { requestId: creationId.current ??= crypto.randomUUID(), expectedRevision: result.data.exhibition.revision },
          signal: controller.signal })).data;
      if (!batch || restart) creationId.current = null;
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
        {batch && <progress aria-label="최근 학습 진행" max={batch.targets.length || 1} value={completed} />}
        {batch === undefined && <Loading {...latest} />}
        {batch !== undefined && (!batch || running || expired || batch.targets.some(canRunTarget)) && <button className="artist-action" disabled={busy} onClick={() => void run()}>
          {busy ? "학습 중…" : running ? "진행 확인" : batch ? "다시 시도" : "여운 학습시키기"}
        </button>}
        {incomplete && <p role="status">{needsMaterial ? "학습을 마치지 못했어요. 전시 자료를 확인해주세요." : "일부 학습을 마치지 못했어요. 다시 시도해주세요."}</p>}
        {batch?.status === "completed" && !expired && <button className="artist-action secondary" disabled={busy}
          onClick={() => void run(true)}>새로 학습시키기</button>}
        {batch && hasNarration && <ArtistLink className="artist-action" href={`${root(id)}/review?batch=${batch.id}`}
          prepare={() => import("./narration-review").then(({ prepareNarrationReview }) => prepareNarrationReview(id, result.data?.works[0]?.id))}>
          기본 해설 검토
        </ArtistLink>}
        {batch?.status === "completed" && (!incomplete || hasQuestions) &&
          <ArtistLink className={`artist-action${incomplete ? " secondary" : ""}`} href={`${root(id)}/faq`}
            prepare={() => loadArtistPage(faqKey(id), signal => loadFaq(id, signal))}>
            {incomplete ? "생성된 질문 보기" : "자주하는 질문"}
          </ArtistLink>}
      </> : <p>먼저 작품을 등록해주세요.</p>}
      {error && <p className="error" role="alert">{error}</p>}
    </section>}
  </>;
}

const faqKey = (id: string) => `faq:${id}`;

async function loadFaq(id: string, signal: AbortSignal) {
  const params = { id };
  const works = await loadArtistPage(artworkListKey(id), signal => loadArtworkList(id, signal), signal);
  const scopes = [{}, ...works.map(work => ({ artworkId: work.id }))];
  const items: QaItem[] = [];
  for (let offset = 0; offset < scopes.length; offset += 5) {
    const lists = await Promise.all(scopes.slice(offset, offset + 5)
      .map(query => requestApi("listQaItems", { params, query, signal })));
    items.push(...lists.flatMap(({ data }) => data));
  }
  return latestVisibleQaItems(items);
}

export function Faq({ id }: { id: string }) {
  const load = useCallback((signal: AbortSignal) => loadFaq(id, signal), [id]);
  const result = useArtistLoad(load, faqKey(id), () => forgetArtistPage(artworkListKey(id)));
  const preparePreview = () => loadArtistPage(overviewKey(id), signal => loadExhibitionOverview(id, signal));
  return <div className="artist-faq yeobek-appear">
    <Header title="자주하는 질문" back={root(id)} />
    {result.data ? <>
      {result.data.length ? <ul>{result.data.map(item => {
        const params = new URLSearchParams({ qa: item.id });
        if (item.artworkId) params.set("work", item.artworkId);
        return <li key={item.id}><ArtistLink href={`${root(id)}/preview?${params}`} prepare={preparePreview}>
          <span>{item.question}</span><span aria-hidden="true">›</span>
        </ArtistLink></li>;
      })}</ul> : <p>등록된 예상 질문이 없어요.</p>}
      <ArtistLink className="artist-action" href={`${root(id)}/preview`} prepare={preparePreview}>여운 답변 미리보기</ArtistLink>
    </> : <Loading {...result} />}
  </div>;
}

export function Preview({ id, initialArtworkId, qaId }: { id: string; initialArtworkId?: string; qaId?: string }) {
  return qaId ? <SavedQa id={id} artworkId={initialArtworkId} qaId={qaId} /> :
    <GeneralPreview id={id} initialArtworkId={initialArtworkId} />;
}

function SavedQa({ id, artworkId, qaId }: { id: string; artworkId?: string; qaId: string }) {
  const load = useCallback(async (signal: AbortSignal) => {
    const { data } = await requestApi("listQaItems", { params: { id }, query: artworkId ? { artworkId } : {}, signal });
    const item = latestVisibleQaItems(data).find(value => value.id === qaId) ?? null;
    const approvedVersions = data.filter(value => value.id === qaId && value.state === "approved")
      .map(value => value.version);
    if (!item || item.citations.every(c => c.evidenceId)) return { item, evidence: [], approvedVersions };
    // The artwork review endpoint also returns exhibition and artist evidence.
    // For exhibition questions, use a work only to read those shared scopes.
    try {
      const reviewId = item.artworkId ?? (await loadArtworkList(id, signal))[0]?.id;
      if (!reviewId) return { item, evidence: [], approvedVersions };
      const review = await requestApi("reviewArtwork", { params: { id: reviewId }, signal });
      return { item, approvedVersions, evidence: review.data.evidence.filter(e => e.state === "approved" &&
        (item.artworkId !== null || e.artworkId === null)) };
    } catch (error) {
      if (signal.aborted || error instanceof ApiClientError && error.status === 401) throw error;
      return { item, evidence: [], approvedVersions, evidenceLoadFailed: true };
    }
  }, [id, artworkId, qaId]);
  const result = useArtistLoad(load);
  const [instruction, setInstruction] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const pendingRewrite = useRef<{ key: string; requestId: string } | null>(null);
  const item = result.data?.item;
  const evidence = result.data?.evidence ?? [];
  const matches = item?.citations.map(c => {
    const direct = c.evidenceId ? { id: c.evidenceId, version: c.version } : undefined;
    const matching = evidence.find(e => e.contentHash === c.bodyHash && e.scope === c.scope &&
      (c.evidenceId === e.id && c.version === e.version || e.source.kind === "document" &&
       c.sourceDocumentId === e.source.sourceDocumentId && c.sectionId === e.source.sourceSectionId &&
       c.version === e.source.sourceRevision));
    return matching ? { id: matching.id, version: matching.version } : direct;
  }) ?? [];
  const pins = [...new Map(matches.flatMap(pin => pin ? [[pin.id, pin] as const] : [])).values()];
  const completePins = !!item && matches.every(Boolean) && pins.length === item.citations.length;

  async function act(fn: () => Promise<void>) {
    if (busy) return;
    setBusy(true); setError(""); setNotice("");
    try { await fn(); } catch (error) { setError(errorMessage(error)); }
    finally { setBusy(false); }
  }
  function refresh() { forgetArtistPage(faqKey(id)); result.retry(); }
  function rewrite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!item || !pins.length || !instruction.trim()) return;
    void act(async () => {
      const key = JSON.stringify([item.id, item.version, instruction.trim(), pins]);
      if (pendingRewrite.current?.key !== key) pendingRewrite.current = { key, requestId: crypto.randomUUID() };
      const { data } = await requestApi("rewriteQa", { body: { targetKind: "qa", targetId: item.id,
        targetVersion: item.version, requestId: pendingRewrite.current.requestId, instruction: instruction.trim(), evidencePins: pins } });
      if (data.status === "succeeded") { pendingRewrite.current = null; setInstruction(""); setNotice("새 답변 초안을 만들었어요. 검토 후 사용해주세요."); refresh(); }
      else {
        if (data.status !== "running") pendingRewrite.current = null;
        setNotice(data.status === "running" ? "답변을 준비 중이에요. 잠시 후 다시 확인해주세요." : `답변을 만들지 못했어요: ${statuses[data.status]}`);
      }
    });
  }
  function decide(action: "approve" | "withdraw") {
    if (!item) return;
    void act(async () => {
      if (action === "approve") await requestApi("approveQaItem", { params: { id: item.id }, body: { expectedVersion: item.version, evidencePins: pins } });
      else {
        const versions = new Set([...(result.data?.approvedVersions ?? []), item.version]);
        // Withdraw older approved answers first so a failed request leaves the current item available to retry.
        for (const version of versions) {
          await requestApi("withdrawQaItem", { params: { id: item.id }, body: { expectedVersion: version } });
        }
      }
      setNotice(action === "approve" ? "답변을 승인했어요. 공개 반영은 게시 과정에서 이루어져요." : "답변 사용을 중지했어요.");
      refresh();
    });
  }
  return <>
    <Header title="예상 질문 검토" back={`${root(id)}/faq`} />
    {!result.data ? <Loading {...result} /> : !item ? <p>질문을 찾을 수 없거나 사용이 중지되었어요.</p> :
      <section className="artist-preview yeobek-appear">
        <p className="artist-question">{item.question}</p><p>{item.answer}</p>
        <p>상태: {item.state === "approved" ? "사용 승인" : "검토 중"} · 버전 {item.version}</p>
        <ul className="artist-workflow-list">{item.citations.map((citation, index) =>
          <li key={citation.id}>
            <strong>{citation.sourceLabel}</strong>
            <p className="artist-note">{matches[index] ? "연결된 근거 · 현재 승인 상태 확인 필요" : "승인 근거 확인 필요"}</p>
            <details><summary>근거 보기</summary><p className="artist-workflow-text">{citation.body}</p></details>
          </li>)}</ul>
        <form onSubmit={rewrite} aria-busy={busy}>
          <Field label="수정할 내용·추가 정보"><textarea value={instruction} onChange={event => setInstruction(event.target.value)}
            maxLength={2000} required disabled={busy} /></Field>
          <p>새 사실은 근거로 추가해 승인한 뒤 답변에 반영할 수 있어요.</p>
          {result.data.evidenceLoadFailed ? <div role="alert">현재 근거를 불러오지 못했어요.{" "}
            <button type="button" className="artist-action secondary" disabled={busy} onClick={refresh}>다시 확인</button>
          </div> : !pins.length && <p>지금 답변을 수정하려면 인용 근거를 먼저 승인해주세요.</p>}
          <button className="artist-action" disabled={busy || !pins.length}>답변 다시 쓰기</button>
        </form>
        {!completePins && <p>답변의 모든 인용 근거를 승인하고 최신 상태로 확인해야 사용할 수 있어요.</p>}
        {!!result.data.approvedVersions.length && <p>사용 중지하면 이전에 승인된 답변도 사용을 중지해요.</p>}
        <div className="artist-actions">
          <button className="artist-action" disabled={busy || item.state !== "draft" || !completePins} onClick={() => decide("approve")}>이 답변 사용</button>
          <button className="artist-action secondary" disabled={busy} onClick={() => decide("withdraw")}>사용 중지</button>
        </div>
      </section>}
    {notice && <p role="status">{notice}</p>}{error && <p className="error" role="alert">{error}</p>}
  </>;
}

function GeneralPreview({ id, initialArtworkId }: { id: string; initialArtworkId?: string }) {
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

  const work = result.data?.works.find(item => item.id === (answer?.artworkId ?? artworkId));
  return <>
    <Header title="AI 답변 미리보기" back={`${root(id)}/faq`} />
    {!result.data ? <Loading {...result} /> : <>
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
          placeholder="자유롭게 질문해보세요" maxLength={AI_LIMITS.question} disabled={busy} required /></Field>
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
