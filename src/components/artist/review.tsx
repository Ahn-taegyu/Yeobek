"use client";

import Image from "next/image";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { ApiClientError, requestApi } from "@/lib/client";
import { forgetArtistPage, loadArtistPage } from "@/lib/client/artist-navigation";
import { AI_LIMITS } from "@/lib/contracts/chat";
import { AiStarLogo } from "@/components/ui/ai-star/ai-star-logo";

import type { PreviewAnswer, QaRewriteJob } from "@/lib/contracts/qa";
import { ArtistLink, errorMessage, Field, Header, Loading, PrivateImage, useArtistLoad } from "./ui";
import { artworkListKey, exhibitionKey, loadArtworkList, loadExhibitionOverview, overviewKey } from "./navigation-data";
import { FlowSteps } from "./flow-steps";
import listStyles from "./review-list.module.css";
import previewStyles from "./preview.module.css";

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

/** Step 1 ends here: training only. `reflect` comes from the interview screen to retrain with approved answers. */
export function Learning({ id, interviewEnabled = false, reflect = false }: { id: string; interviewEnabled?: boolean; reflect?: boolean }) {
  const result = useReviewData(id);
  const loadLatest = useCallback(async (signal: AbortSignal) =>
    (await requestApi("getLatestTrainingBatch", { params: { id }, signal })).data, [id]);
  const latest = useArtistLoad(loadLatest);
  const [updatedBatch, setBatch] = useState<Batch | null>();
  const batch = updatedBatch === undefined ? latest.data : updatedBatch;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [retrainFrom, setRetrainFrom] = useState<string>();
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
  const done = batch?.status === "completed" && !busy;
  // A reflection retrain counts only once a new batch replaced the one shown on arrival.
  const reflected = !reflect || (retrainFrom !== undefined && batch?.id !== retrainFrom);
  const next = interviewEnabled && !reflect ? "interview" : "verification";
  return <>
    <Header title="여운 학습" back={root(id)} />
    <FlowSteps current={1} interviewEnabled={interviewEnabled} />
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
        {busy || running
          ? <AiStarLogo className="artist-learning-star" state="thinking" size={72}
            label={batch ? `학습 진행 ${completed}/${batch.targets.length}` : "학습 준비 중"} />
          : batch && <progress aria-label="최근 학습 진행" max={batch.targets.length || 1} value={completed} />}
        {batch === undefined && <Loading {...latest} />}
        {batch !== undefined && (!batch || running || expired || batch.targets.some(canRunTarget)) && <button className="artist-action" disabled={busy} onClick={() => void run()}>
          {busy ? "학습 중…" : running ? "진행 확인" : batch ? "다시 시도" : "여운 학습시키기"}
        </button>}
        {incomplete && <p role="status">{needsMaterial ? "학습을 마치지 못했어요. 전시 자료를 확인해주세요." : "일부 학습을 마치지 못했어요. 다시 시도해주세요."}</p>}
        {done && !reflected && <>
          <p>인터뷰 답변과 수정한 내용을 기본 소개와 예상 질문에 반영하려면 다시 학습해야 해요.</p>
          <div className="artist-flow-actions">
            <button className="artist-action" onClick={() => { setRetrainFrom(batch.id); void run(true); }}>수정한 내용으로 다시 학습하기</button>
            <ArtistLink className="artist-action secondary" href={`${root(id)}/verification`}>반영 없이 검토로</ArtistLink>
          </div>
        </>}
        {done && reflected && <div className="artist-actions">
          {!expired && !reflect && <button className="artist-action secondary" onClick={() => void run(true)}>새로 학습시키기</button>}
          <ArtistLink className="artist-action" href={`${root(id)}/${next}`}>{next === "interview" ? "다음: AI 인터뷰" : "다음: 검토"}</ArtistLink>
        </div>}
      </> : <p>먼저 작품을 등록해주세요.</p>}
      {error && <p className="error" role="alert">{error}</p>}
    </section>}
  </>;
}

const faqKey = (id: string) => `faq:${id}`;
export const prepareFaq = (id: string) => loadArtistPage(faqKey(id), signal => loadFaq(id, signal));

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

/** Figma 119: expected visitor questions as an accordion; saving approves reviewed drafts that cite approved evidence. */
export function Faq({ id }: { id: string }) {
  const load = useCallback((signal: AbortSignal) => loadFaq(id, signal), [id]);
  const result = useArtistLoad(load, faqKey(id), () => forgetArtistPage(artworkListKey(id)));
  const preparePreview = () => loadArtistPage(overviewKey(id), signal => loadExhibitionOverview(id, signal));
  const [open, setOpen] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const drafts = result.data?.filter(item => item.state === "draft") ?? [];
  const ready = drafts.filter(item => item.citations.every(citation => citation.evidenceId));
  async function save() {
    if (busy || !ready.length) return;
    setBusy(true); setError(""); setNotice("");
    try {
      for (const item of ready) await requestApi("approveQaItem", { params: { id: item.id }, body: { expectedVersion: item.version,
        evidencePins: [...new Map(item.citations.map(c => [c.evidenceId!, { id: c.evidenceId!, version: c.version }])).values()] } });
      forgetArtistPage(faqKey(id)); result.retry();
      setNotice(drafts.length > ready.length ? `${ready.length}개를 저장했어요. 근거 확인이 필요한 질문은 질문별로 검토해 주세요.` : "수정 내용을 저장했어요.");
    } catch (cause) { setError(errorMessage(cause)); }
    finally { setBusy(false); }
  }
  return <div className={listStyles.screen}>
    <Header title="관람객 예상 질문" back={`${root(id)}/verification`} />
    {!result.data ? <Loading {...result} /> : !result.data.length ? <p className="artist-note">등록된 예상 질문이 없어요.</p> :
      <ul className={`${listStyles.list} ${listStyles.qa}`}>{result.data.map(item => {
        const expanded = open === item.id;
        const params = new URLSearchParams({ qa: item.id });
        if (item.artworkId) params.set("work", item.artworkId);
        return <li key={item.id} className={listStyles.item}>
          <button type="button" aria-expanded={expanded} onClick={() => setOpen(expanded ? null : item.id)}>
            <span>{item.question}{item.state === "draft" && <span className={listStyles.badge}>검토 중</span>}</span>
            <Image className={listStyles.chevron} src="/yeobek/review-chevron.svg" alt="" width={19} height={19} />
          </button>
          {expanded && <div className={listStyles.body}>
            <p>{item.answer}</p>
            <div className={listStyles.actions}>
              <ArtistLink href={`${root(id)}/preview?${params}`} prepare={preparePreview}>답변 수정하기</ArtistLink>
            </div>
          </div>}
        </li>;
      })}</ul>}
    <div className={listStyles.footer}>
      {notice && <p role="status">{notice}</p>}
      {error && <p className="error" role="alert">{error}</p>}
      <button className={listStyles.save} disabled={busy || !ready.length} onClick={() => void save()}>{busy ? "저장 중…" : "수정 내용 저장하기"}</button>
    </div>
  </div>;
}

export function Preview({ id, initialArtworkId, qaId }: { id: string; initialArtworkId?: string; qaId?: string }) {
  return qaId ? <SavedQa key={`${id}:${initialArtworkId ?? ""}:${qaId}`} id={id} artworkId={initialArtworkId} qaId={qaId} /> :
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
  const [correction, setCorrection] = useState<{ id: string; version: number; approved: boolean }>();
  const pendingCorrection = useRef<{ key: string; requestId: string } | null>(null);
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
  const rewritePins = correction?.approved ? [...pins.slice(0, AI_LIMITS.evidenceCount - 1),
    { id: correction.id, version: correction.version }] : pins;
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
    if (!item || !rewritePins.length || !instruction.trim()) return;
    void act(async () => {
      const key = JSON.stringify([item.id, item.version, instruction.trim(), rewritePins]);
      if (pendingRewrite.current?.key !== key) pendingRewrite.current = { key, requestId: crypto.randomUUID() };
      const { data } = await requestApi("rewriteQa", { body: { targetKind: "qa", targetId: item.id,
        targetVersion: item.version, requestId: pendingRewrite.current.requestId, instruction: instruction.trim(), evidencePins: rewritePins } });
      if (data.status === "succeeded") { pendingRewrite.current = null; setCorrection(undefined); setInstruction(""); setNotice("새 답변 초안을 만들었어요. 검토 후 사용해주세요."); refresh(); }
      else {
        if (data.status !== "running") pendingRewrite.current = null;
        setNotice(data.status === "running" ? "답변을 준비 중이에요. 잠시 후 다시 확인해주세요." : `답변을 만들지 못했어요: ${statuses[data.status]}`);
      }
    });
  }
  function saveCorrection(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!item || correction) return;
    const form = new FormData(event.currentTarget);
    const sourceLabel = String(form.get("sourceLabel") ?? "").trim();
    const sourceBody = String(form.get("sourceBody") ?? "").trim();
    if (!sourceLabel || !sourceBody) return;
    void act(async () => {
      const key = JSON.stringify([item.id, item.version, sourceLabel, sourceBody]);
      if (pendingCorrection.current?.key !== key) pendingCorrection.current = { key, requestId: crypto.randomUUID() };
      const { data } = await requestApi("createQaCorrectionEvidence", { body: { targetKind: "qa", targetId: item.id,
        targetVersion: item.version, requestId: pendingCorrection.current.requestId, sourceLabel, sourceBody } });
      setCorrection({ id: data.id, version: data.version, approved: data.state === "approved" });
    });
  }
  function approveCorrection() {
    if (!correction) return;
    void act(async () => {
      const { data } = await requestApi("approveEvidence", { params: { id: correction.id }, body: { version: correction.version } });
      setCorrection({ id: data.id, version: data.version, approved: data.state === "approved" });
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
      setNotice(action === "approve" ? "답변을 승인했어요. 공개 반영은 게시 과정에서 이루어져요." : "확인한 답변 버전의 사용을 중지했어요.");
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
        <details>
          <summary>새 사실을 근거로 추가</summary>
          {!correction ? <form onSubmit={saveCorrection}>
            <Field label="근거 이름"><input name="sourceLabel" maxLength={100} required disabled={busy} /></Field>
            <Field label="추가할 근거"><textarea name="sourceBody" maxLength={2000} required disabled={busy} /></Field>
            <button className="artist-action secondary" disabled={busy}>근거 초안 저장</button>
          </form> : correction.approved ? <p role="status">승인한 근거를 재작성에 사용할 수 있어요.</p> :
            <button className="artist-action secondary" disabled={busy} onClick={approveCorrection}>추가한 근거 승인</button>}
        </details>
        <form onSubmit={rewrite} aria-busy={busy}>
          <Field label="수정할 내용·추가 정보"><textarea value={instruction} onChange={event => setInstruction(event.target.value)}
            maxLength={2000} required disabled={busy} /></Field>
          <p>새 사실은 근거로 추가해 승인한 뒤 답변에 반영할 수 있어요.</p>
          {result.data.evidenceLoadFailed ? <div role="alert">현재 근거를 불러오지 못했어요.{" "}
            <button type="button" className="artist-action secondary" disabled={busy} onClick={refresh}>다시 확인</button>
          </div> : !rewritePins.length && <p>지금 답변을 수정하려면 근거를 먼저 승인해주세요.</p>}
          <button className="artist-action" disabled={busy || !rewritePins.length}>답변 다시 쓰기</button>
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
  const [rating, setRating] = useState<"accurate" | "needs_revision" | null>(null);
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
      setRating(null);
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

      setRating(value);
      setEditing(value === "needs_revision");
    });
  }

  const work = result.data?.works.find(item => item.id === (answer?.artworkId ?? artworkId));
  return <div className={previewStyles.screen}>
    <Header title="여운 답변 미리보기" back={`${root(id)}/verification`} />
    {!result.data ? <Loading {...result} /> : <>
      <div className={previewStyles.log} aria-live="polite">
        {!answer && <p className={previewStyles.empty}>관람객처럼 질문해 여운의 답변을 확인해 보세요.</p>}
        {answer && <section className={`${previewStyles.turn} yeobek-appear`}>
          <p className={previewStyles.question}>{answer.question}</p>
          {work?.imageMaterialId && <PrivateImage key={work.imageMaterialId} materialId={work.imageMaterialId} alt={work.title} className={previewStyles.image} />}
          {answer.result ? <>
            <p className={previewStyles.answer}>{answer.result.answer}</p>
            <div className={previewStyles.rate}>
              <p>이 답변이 정확한가요?</p>
              <div>
                <button aria-pressed={rating === "accurate"} disabled={busy} onClick={() => evaluate("accurate")}>정확해요</button>
                <button aria-pressed={rating === "needs_revision"} disabled={busy} onClick={() => evaluate("needs_revision")}>수정이 필요해요</button>
              </div>
            </div>
          </> : <p className={previewStyles.answer}>답변을 만들지 못했어요. 다른 질문을 입력해주세요.</p>}
        </section>}
      </div>
      <div className={previewStyles.composer}>
        {error && <p className="error" role="alert">{error}</p>}
        {busy && !error && <p role="status">답변을 준비하고 있어요.</p>}
        <form onSubmit={ask} aria-busy={busy}>
          <input aria-label="질문" value={question} onChange={event => setQuestion(event.target.value)}
            placeholder="자유롭게 질문해보세요" maxLength={AI_LIMITS.question} disabled={busy} required />
          <button className={previewStyles.send} disabled={busy || !question.trim()} aria-label="질문 보내기">
            <Image src="/yeobek/visitor-wave.svg" alt="" width={24} height={24} />
          </button>
        </form>
      </div>
      {editing && answer?.result && <Rewrite key={answer.id} answer={answer} onClose={() => setEditing(false)} />}
    </>}
  </div>;
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

  return <dialog ref={dialog} className={previewStyles.sheet} onCancel={event => { event.preventDefault(); close(); }} aria-labelledby="rewrite-title">
    <div className={previewStyles.sheetHead}>
      <h2 id="rewrite-title">AI 답변 수정</h2>
      <button aria-label="닫기" onClick={close}><Image src="/yeobek/review-close.svg" alt="" width={42} height={42} /></button>
    </div>
    <div className={previewStyles.field}><span>질문</span><p className={previewStyles.box}>{answer.question}</p></div>
    <div className={previewStyles.field}><span>여운 답변</span><p className={previewStyles.box}>{answer.result?.answer}</p></div>
    <form onSubmit={rewrite}>
      <label className={previewStyles.field}><span>수정한 내용</span>
        <textarea name="instruction" maxLength={2000} required disabled={busy} placeholder="어떻게 고치면 좋을지 적어 주세요." /></label>
      {!pins.length && <p role="status">이 답변은 지금 수정할 수 없어요.</p>}
      <button className={previewStyles.saveButton} disabled={busy || !pins.length}>{busy ? "저장 중…" : "수정 내용 저장하기"}</button>
    </form>
    {job && <p role="status">{job.status === "succeeded" ? "수정한 답변을 예상 질문에 저장했어요." : statuses[job.status]}</p>}
    {(error || existing.error) && <p className="error" role="alert">{error || existing.error}</p>}
  </dialog>;
}
