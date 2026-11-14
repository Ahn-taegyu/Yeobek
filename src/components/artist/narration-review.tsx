"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { ApiClientError, requestApi } from "@/lib/client";
import type { AiJob } from "@/lib/contracts/jobs";
import { sectionById } from "@/lib/contracts/knowledge-sections";
import { AI_LIMITS, DEFAULT_POLICIES } from "@/lib/policy";
import { errorMessage, Field, Header, Loading, useArtistLoad, type Document } from "./ui";

type Review = Awaited<ReturnType<typeof requestApi<"reviewArtwork">>>["data"];
type Evidence = Review["evidence"][number];
type Pin = NonNullable<Review["approval"]>["citations"][number];
type EvidenceInput = Pick<Evidence, "scope" | "body" | "sourceLabel" | "source">;

export function NarrationReview({ id, batchId, initialArtworkId }: { id: string; batchId?: string; initialArtworkId?: string }) {
  const load = useCallback(async (signal: AbortSignal) => {
    const params = { id };
    return (await requestApi("listArtworks", { params, signal })).data.items;
  }, [id]);
  const loadBatch = useCallback(async (signal: AbortSignal) => {
    if (!batchId) return null;
    const { data } = await requestApi("getTrainingBatch", { params: { id: batchId }, signal });
    return data.exhibitionId === id ? data : null;
  }, [batchId, id]);
  const result = useArtistLoad(load);
  const batch = useArtistLoad(loadBatch);
  const [artworkId, setArtworkId] = useState(initialArtworkId);
  const work = result.data?.find(item => item.id === artworkId) ?? result.data?.[0];
  const trainingJobId = batch.data?.targets.find(target => target.artworkId === work?.id &&
    target.kind === "narration" && target.status === "succeeded")?.jobId;
  const root = `/artist/exhibitions/${id}`;

  return <>
    <Header title="기본 해설 검토" back={root} />
    {!result.data ? <Loading {...result} /> : <div className="artist-workflow yeobek-appear">
      {work ? <>
        <Field label="작품"><select aria-label="작품" value={work.id} onChange={event => setArtworkId(event.target.value)}>
          {result.data.map(item => <option key={item.id} value={item.id}>
            {item.draftNumber ?? item.number}. {item.draftTitle || item.title || "제목 미입력"}
          </option>)}
        </select></Field>
        {batchId && batch.data === undefined && !batch.error && <Loading {...batch} />}
        {batch.error && <p role="status">학습 결과를 불러오지 못했어요. 이 화면에서 새 초안을 만들 수 있어요.</p>}
        {(!batchId || batch.data !== undefined || batch.error) && <ArtworkReview key={`${work.id}:${trainingJobId ?? ""}`}
          exhibitionId={id} artworkId={work.id} trainingJobId={trainingJobId ?? undefined} />}
      </> : <p>먼저 작품을 등록해주세요.</p>}
      <Link className="artist-action" href={`${root}/publication`}>게시 준비 확인</Link>
    </div>}
  </>;
}

async function loadSources(exhibitionId: string, signal: AbortSignal) {
  const [exhibition, profile] = await Promise.all([
    requestApi("getExhibition", { params: { id: exhibitionId }, signal }), requestApi("getProfile", { signal }),
  ]);
  return [exhibition.data.document, profile.data.document];
}

function ArtworkReview({ exhibitionId, artworkId, trainingJobId }: {
  exhibitionId: string; artworkId: string; trainingJobId?: string;
}) {
  const load = useCallback(async (signal: AbortSignal) => {
    const [review, documents] = await Promise.all([
      requestApi("reviewArtwork", { params: { id: artworkId }, signal }), loadSources(exhibitionId, signal),
    ]);
    return { review: review.data, documents };
  }, [artworkId, exhibitionId]);
  const loadJob = useCallback(async (signal: AbortSignal) => {
    if (!trainingJobId) return null;
    const { data } = await requestApi("getJob", { params: { id: trainingJobId }, signal });
    return data.kind === "narration" && data.artworkId === artworkId ? data : null;
  }, [trainingJobId, artworkId]);
  const review = useArtistLoad(load);
  const initialJob = useArtistLoad(loadJob);
  if (!review.data) return <Loading {...review} />;
  if (trainingJobId && initialJob.data === undefined && !initialJob.error) return <Loading {...initialJob} />;
  return <ArtworkDraft initial={review.data.review} initialJob={initialJob.data ?? null} initialDocuments={review.data.documents}
    initialNotice={initialJob.error ? "학습한 초안을 불러오지 못했어요. 새 초안을 만들 수 있어요." : ""} />;
}

function ArtworkDraft({ initial, initialJob, initialDocuments, initialNotice }: {
  initial: Review; initialJob: AiJob | null; initialDocuments: Document[]; initialNotice: string;
}) {
  const [review, setReview] = useState(initial);
  const [otherDocuments, setOtherDocuments] = useState(initialDocuments);
  const [job, setJob] = useState(initialJob);
  const [staleJobId, setStaleJobId] = useState<string>();
  const [draft, setDraft] = useState(initial.artwork.narrationDraft ?? "");
  const [pins, setPins] = useState<Pin[]>(initial.approval?.citations ?? []);
  const [needsReload, setNeedsReload] = useState(false);
  const [needsComparison, setNeedsComparison] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState(initialNotice);
  const [error, setError] = useState("");
  const operation = useRef<AbortController | null>(null);
  const generation = useRef<{ fingerprint: string; requestId: string } | null>(null);
  useEffect(() => () => operation.current?.abort(), []);

  const { artwork } = review;
  const documents = [artwork.document, ...otherDocuments];
  const params = { id: artwork.id };
  const saved = artwork.narrationDraft ?? "";
  const dirty = draft !== saved;
  const candidate = job?.status === "succeeded" ? job.result?.selected.answer : undefined;
  const candidateCurrent = job?.id !== staleJobId && job?.expectedRevision === artwork.revision &&
    job.expectedDocumentRevision === artwork.document.revision;
  const activeEvidence = review.evidence.filter(item => {
    const { source } = item;
    return item.state !== "withdrawn" && (source.kind !== "document" || documents.some(document =>
      document.id === source.sourceDocumentId && document.revision === source.sourceRevision));
  });
  const selected = activeEvidence.filter(item => item.state === "approved" && pins.some(pin =>
    pin.id === item.id && pin.version === item.version));

  async function refresh(signal: AbortSignal, localDraft = draft, previousSaved = saved, refreshSources = false) {
    const [{ data }, latestDocuments] = await Promise.all([
      requestApi("reviewArtwork", { params, signal }), refreshSources ? loadSources(artwork.exhibitionId, signal) : otherDocuments,
    ]);
    const latestSaved = data.artwork.narrationDraft ?? "";
    setReview(data);
    setOtherDocuments(latestDocuments);
    setNeedsReload(false);
    if (localDraft === previousSaved) setDraft(latestSaved);
    setNeedsComparison(localDraft !== previousSaved && localDraft !== latestSaved && (needsComparison || latestSaved !== previousSaved));
  }

  async function act(run: (signal: AbortSignal) => Promise<void>, success = "") {
    if (operation.current) return false;
    const controller = new AbortController();
    operation.current = controller;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await run(controller.signal);
      if (controller.signal.aborted) return false;
      setNotice(success);
      return true;
    } catch (error) {
      if (controller.signal.aborted) return false;
      if (error instanceof ApiClientError && error.status === 401) {
        window.location.replace("/login");
        return false;
      }
      if (error instanceof ApiClientError && ["REVISION_CONFLICT", "SOURCE_REVISION_CONFLICT", "JOB_ATTEMPT_CONFLICT", "SOURCE_UNAVAILABLE"].includes(error.code)) {
        setNeedsReload(true);
        setNeedsComparison(dirty);
      }
      setError(errorMessage(error));
      return false;
    } finally {
      operation.current = null;
      if (!controller.signal.aborted) setBusy(false);
    }
  }

  function reload() {
    void act(signal => refresh(signal, draft, saved, true));
  }

  function generate() {
    void act(async signal => {
      const checking = job?.status === "running";
      const retrying = job && candidateCurrent && (job.status === "failed" || job.status === "cancelled");
      try {
        if (checking) {
          const { data } = await requestApi("getJob", { params: { id: job.id }, signal });
          if (data.kind === "narration") setJob(data);
          return;
        }
        const fingerprint = `${artwork.revision}:${artwork.document.revision}:${job?.id ?? ""}:${job?.attempt ?? 0}`;
        if (generation.current?.fingerprint !== fingerprint) generation.current = { fingerprint, requestId: crypto.randomUUID() };
        const { requestId } = generation.current;
        const { data } = retrying
          ? await requestApi("retryJob", { params: { id: job.id }, body: { requestId, expectedAttempt: job.attempt }, signal })
          : await requestApi("generateNarration", { params, signal, body: {
            requestId, expectedRevision: artwork.revision, expectedDocumentRevision: artwork.document.revision,
          } });
        if (data.kind === "narration") setJob(data);
        generation.current = null;
      } catch (error) {
        if (error instanceof ApiClientError && error.status === 404 && (checking || retrying)) {
          setJob(null);
          throw new ApiClientError(error.status, error.code, "이전 초안의 보관 기간이 지났어요. 새 초안을 만들어주세요.");
        }
        if (error instanceof ApiClientError && error.code === "JOB_ATTEMPT_CONFLICT" && job) {
          const { data } = await requestApi("getJob", { params: { id: job.id }, signal });
          if (data.kind === "narration") setJob(data);
        }
        if (error instanceof ApiClientError && error.code === "REVISION_CONFLICT" && retrying) setStaleJobId(job.id);
        throw error;
      }
    });
  }

  function save(text: string, sourceJobId?: string) {
    void act(async signal => {
      const { data } = await requestApi("saveNarration", { params, signal, body: {
        expectedRevision: artwork.revision, text, sourceJobId,
      } }).catch(error => {
        if (sourceJobId && error instanceof ApiClientError && (error.status === 404 || error.code === "REVISION_CONFLICT")) {
          setStaleJobId(sourceJobId);
        }
        throw error;
      });
      setDraft(data.narrationDraft ?? "");
      setReview(current => ({ ...current, artwork: data, approval: null }));
      setNeedsComparison(false);
      setNeedsReload(true);
      await refresh(signal, data.narrationDraft ?? "", data.narrationDraft ?? "");
    }, "해설 초안을 저장했어요.");
  }

  function approveEvidence(evidence: Evidence) {
    void act(async signal => {
      await requestApi("approveArtwork", { params, signal, body: {
        kind: "evidence", evidenceId: evidence.id, version: evidence.version,
      } });
      setNeedsReload(true);
      await refresh(signal);
    }, "근거를 승인했어요. 해설에 연결할 근거를 선택해주세요.");
  }

  function approveNarration() {
    void act(async signal => {
      await requestApi("approveArtwork", { params, signal, body: {
        kind: "narration", expectedRevision: artwork.revision, citations: selected.map(({ id, version }) => ({ id, version })),
      } });
      setNeedsReload(true);
      await refresh(signal);
    }, "기본 해설을 승인했어요.");
  }

  function addEvidence(input: EvidenceInput) {
    return act(async signal => {
      const { data } = await requestApi("upsertEvidence", { params, signal, body: input });
      setReview(current => ({ ...current, evidence: [...current.evidence, data] }));
      setNeedsReload(true);
      await refresh(signal);
    }, "근거를 저장했어요. 내용을 확인한 뒤 승인해주세요.");
  }

  const blocked = busy || needsReload || needsComparison;
  const approvedSelection = review.approval?.citations.length === selected.length && review.approval.citations.every(pin =>
    selected.some(item => item.id === pin.id && item.version === pin.version));

  return <div className="artist-workflow" aria-busy={busy}>
    <section className="artist-card">
      <h2>해설 초안</h2>
      {candidate && <>
        <p className="artist-workflow-text">{candidate}</p>
        {job?.mock && <p className="artist-note">시연용으로 만든 해설이에요.</p>}
        {!candidateCurrent && candidate !== saved && <p className="artist-note">작품 내용이 바뀌었어요. 새 초안을 만들어주세요.</p>}
        {candidateCurrent && <button className="artist-action secondary" disabled={blocked || dirty}
          onClick={() => save(candidate, job?.id)}>생성한 초안 저장</button>}
      </>}
      {job?.status === "abstained" && <p>해설을 만들 자료가 부족해요. 작품 설명을 보완해주세요.</p>}
      {(job?.status === "failed" || job?.status === "cancelled") && <p>초안을 만들지 못했어요. 다시 시도해주세요.</p>}
      <div className="artist-actions">
        <button className="artist-action secondary" disabled={blocked} onClick={generate}>
          {job?.status === "running" ? "생성 상태 확인" : candidate ? "새 초안 만들기" : "초안 만들기"}
        </button>
      </div>
      <form method="post" onSubmit={event => { event.preventDefault(); if (!blocked && dirty && draft.trim()) save(draft); }} className="artist-workflow">
        <Field label="기본 해설 원고"><textarea aria-label="기본 해설 원고" value={draft} onChange={event => setDraft(event.target.value)}
          disabled={busy} maxLength={AI_LIMITS.narration} /></Field>
        {needsComparison && !needsReload && <div className="artist-workflow">
          <div>현재 저장된 원고<p className="artist-workflow-text">{saved || "저장된 원고가 없어요."}</p></div>
          <div className="artist-actions">
            <button type="button" className="artist-action secondary" onClick={() => setNeedsComparison(false)}>내 수정 계속하기</button>
            <button type="button" className="artist-action secondary" onClick={() => {
              setDraft(saved); setNeedsComparison(false);
            }}>저장된 원고 사용</button>
          </div>
        </div>}
        <button className="artist-action" disabled={blocked || !dirty || !draft.trim()}>원고 저장</button>
      </form>
    </section>

    <section className="artist-card">
      <h2>공개 근거</h2>
      {activeEvidence.length === 0 && <p>해설을 뒷받침하는 자료에서 공개할 문장을 골라주세요.</p>}
      <ul className="artist-workflow-list">{activeEvidence.map(item => {
        const checked = selected.includes(item);
        return <li key={`${item.id}:${item.version}`}>
          <strong>{item.sourceLabel}</strong>
          <p className="artist-workflow-text">{item.body}</p>
          {item.state === "draft" ? <button className="artist-action secondary" disabled={blocked}
            onClick={() => approveEvidence(item)}>근거 승인</button> :
            <label className="artist-workflow-choice"><input type="checkbox" checked={checked} aria-label={`${item.sourceLabel} 근거를 해설에 사용`}
              disabled={blocked || (!checked && selected.length >= AI_LIMITS.evidenceCount)}
              onChange={() => setPins(current => checked ? current.filter(pin => pin.id !== item.id)
                : [...current.filter(pin => pin.id !== item.id), { id: item.id, version: item.version }])} />
              해설에 사용
            </label>}
        </li>;
      })}</ul>
      <EvidenceExcerpt documents={documents} disabled={blocked} onSave={addEvidence} />
    </section>

    <section className="artist-card">
      <h2>해설 승인</h2>
      {review.approval ? <p>저장된 원고가 승인됐어요.</p> : <p>원고를 저장하고 승인한 근거를 선택해주세요.</p>}
      <button className="artist-action" disabled={blocked || dirty || !saved.trim() || !selected.length || approvedSelection}
        onClick={approveNarration}>기본 해설 승인</button>
    </section>
    {notice && <p role="status">{notice}</p>}
    {error && <p className="error" role="alert">{error}</p>}
    {needsReload && <button className="artist-action secondary" disabled={busy} onClick={reload}>최신 내용 불러오기</button>}
  </div>;
}

function EvidenceExcerpt({ documents, disabled, onSave }: {
  documents: Document[]; disabled: boolean;
  onSave: (input: EvidenceInput) => Promise<boolean>;
}) {
  const items = documents.flatMap(document => document.sections.filter(section => section.body.trim()).map(section => ({
    key: `${document.id}:${section.id}`, document, section,
    label: sectionById.get(section.id)?.label ?? "작가 입력 자료",
  })));
  const [sourceKey, setSourceKey] = useState("");
  const [excerpt, setExcerpt] = useState("");
  const source = items.find(item => item.key === sourceKey);
  const body = excerpt.trim();
  const valid = !!body && !!source?.section.body.includes(body);

  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (disabled || !valid || !source) return;
    void onSave({ scope: source.document.subjectType, body, sourceLabel: source.label, source: {
      kind: "document", sourceDocumentId: source.document.id, sourceSectionId: source.section.id, sourceRevision: source.document.revision,
    } }).then(saved => { if (saved) setExcerpt(""); });
  }

  return <details>
    <summary>자료에서 근거 추가</summary>
    {!items.length ? <p>전시나 작품 설명을 먼저 입력해주세요.</p> :
      <form method="post" onSubmit={save} className="artist-workflow">
        <Field label="근거 자료"><select aria-label="근거 자료" value={sourceKey} disabled={disabled} onChange={event => {
          setSourceKey(event.target.value); setExcerpt("");
        }}>
          <option value="">자료 선택</option>
          {items.map(item => <option key={item.key} value={item.key}>{item.label}</option>)}
        </select></Field>
        {source && <>
          <p className="artist-workflow-text">{source.section.body}</p>
          <Field label="공개할 원문 발췌"><textarea aria-label="공개할 원문 발췌" value={excerpt} disabled={disabled} required
            maxLength={DEFAULT_POLICIES.evidence_body_chars} onChange={event => setExcerpt(event.target.value)} /></Field>
          {body && !valid && <p className="artist-note">자료에서 공개할 문장을 그대로 복사해주세요.</p>}
          <button className="artist-action secondary" disabled={disabled || !valid}>근거 저장</button>
        </>}
      </form>}
  </details>;
}
