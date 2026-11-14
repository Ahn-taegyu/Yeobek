"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { requestApi } from "@/lib/client";
import { AI_LIMITS } from "@/lib/contracts/chat";
import { section } from "@/lib/contracts/requests";
import type { PreviewAnswer, QaRewriteJob } from "@/lib/contracts/qa";
import { errorMessage, Field, Header, Loading, PrivateImage, useArtistLoad } from "./ui";

type Batch = Awaited<ReturnType<typeof requestApi<"getTrainingBatch">>>["data"];
type QaItem = Awaited<ReturnType<typeof requestApi<"listQaItems">>>["data"][number];
type Evidence = Awaited<ReturnType<typeof requestApi<"approveEvidence">>>["data"];
const statuses = { queued: "대기 중", running: "학습 중", succeeded: "완료", abstained: "자료 확인 필요", failed: "실패", cancelled: "취소됨" };
const root = (id: string) => `/artist/exhibitions/${id}`;

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
  const targetIds = useRef(new Map<string, string>());
  useEffect(() => () => operation.current?.abort(), []);

  async function run() {
    if (!result.data || operation.current) return;
    const controller = new AbortController();
    operation.current = controller;
    setBusy(true);
    setError("");
    try {
      creationId.current ??= crypto.randomUUID();
      let next = batch
        ? (await requestApi("getTrainingBatch", { params: { id: batch.id }, signal: controller.signal })).data
        : (await requestApi("createTrainingBatch", { params: { id },
          body: { requestId: creationId.current, expectedRevision: result.data.exhibition.revision }, signal: controller.signal })).data;
      setBatch(next);
      for (const target of next.targets) {
        if (target.status !== "queued") continue;
        const requestId = targetIds.current.get(target.id) ?? crypto.randomUUID();
        targetIds.current.set(target.id, requestId);
        const { data } = await requestApi("runTrainingTarget", {
          params: { id: next.id, targetId: target.id }, signal: controller.signal,
          body: { requestId, expectedAttempt: target.attempt ?? 0 },
        });
        next = data;
        setBatch(next);
      }
    } catch (error) {
      if (!controller.signal.aborted) setError(errorMessage(error));
    } finally {
      operation.current = null;
      if (!controller.signal.aborted) setBusy(false);
    }
  }

  const completed = batch?.targets.filter(item => item.status !== "queued" && item.status !== "running").length ?? 0;
  return <>
    <Header title="여운 학습시키기" back={root(id)} />
    {!result.data ? <Loading {...result} /> : <section className="artist-learning">
      <h2>{busy || batch?.status === "running" ? "여운이 정보를 학습하고 있어요" : "여운 학습시키기"}</h2>
      <p>{batch?.artistName} {result.data.exhibition.title}</p>
      {result.data.works.length ? <>
        {batch && <>
          <p role="status">처리한 작업 {completed} / {batch.targets.length}</p>
          <progress aria-label="학습 진행" max={batch.targets.length || 1} value={completed} />
          <ul>{batch.targets.map(target => <li key={target.id}>
            {target.targetName} · {target.kind === "narration" ? "해설" : "예상 질문"} · {statuses[target.status]}
            {target.resultCode && target.status !== "succeeded" ? ` (${target.resultCode})` : ""}
          </li>)}</ul>
        </>}
        {batch?.status !== "completed" && <button className="artist-action" disabled={busy} onClick={() => void run()}>
          {busy ? "학습 중…" : batch ? "진행 확인 및 이어서 실행" : "학습 시작"}
        </button>}
        <Link className="artist-action secondary" href={`${root(id)}/faq`}>자주하는 질문</Link>
      </> : <p>먼저 작품을 등록해주세요.</p>}
      {error && <p className="error" role="alert">{error}</p>}
    </section>}
  </>;
}

export function Faq({ id }: { id: string }) {
  const result = useReviewData(id);
  const [artworkId, setArtworkId] = useState("");
  const load = useCallback(async (signal: AbortSignal) => (await requestApi("listQaItems", {
    params: { id }, query: artworkId ? { artworkId } : {}, signal,
  })).data, [id, artworkId]);
  return <>
    <Header title="자주하는 질문" back={root(id)} />
    {result.data ? <>
      <Field label="질문 범위"><select value={artworkId} onChange={event => setArtworkId(event.target.value)}>
        <option value="">전시 전체</option>
        {result.data.works.map(work => <option key={work.id} value={work.id}>{work.title}</option>)}
      </select></Field>
      <FaqList key={artworkId} load={load} />
      <Link className="artist-action" href={`${root(id)}/preview${artworkId ? `?work=${artworkId}` : ""}`}>여운 답변 미리보기</Link>
    </> : <Loading {...result} />}
  </>;
}

function FaqList({ load }: { load: (signal: AbortSignal) => Promise<QaItem[]> }) {
  const result = useArtistLoad(load);
  if (!result.data) return <Loading {...result} />;
  const items = result.data.filter(item => item.state !== "withdrawn");
  return items.length ? items.map(item => <FaqItem key={item.id} item={item} onChange={result.retry} />) :
    <p>등록된 예상 질문이 없어요.</p>;
}

function FaqItem({ item, onChange }: { item: QaItem; onChange: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function approve() {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const pins = [];
      for (const citation of item.citations) {
        const sectionId = section.shape.id.safeParse(citation.sectionId);
        const source = citation.evidenceId ? null : citation.sourceDocumentId && sectionId.success
          ? { kind: "document" as const, sourceDocumentId: citation.sourceDocumentId,
            sourceSectionId: sectionId.data, sourceRevision: citation.version }
          : null;
        if (!source) {
          if (!citation.evidenceId) throw new Error("Missing citation");
          pins.push({ id: citation.evidenceId, version: citation.version });
          continue;
        }
        const fields = { sourceLabel: citation.sourceLabel.slice(0, 100), body: citation.body, source };
        const created = citation.scope === "artwork" && item.artworkId
          ? await requestApi("upsertEvidence", { params: { id: item.artworkId }, body: { ...fields, scope: "artwork" } })
          : await requestApi("upsertExhibitionEvidence", { params: { id: item.exhibitionId },
            body: { ...fields, scope: citation.scope } });
        const { data } = await requestApi("approveEvidence", {
          params: { id: created.data.id }, body: { version: created.data.version },
        });
        pins.push({ id: data.id, version: data.version });
      }
      await requestApi("approveQaItem", { params: { id: item.id },
        body: { expectedVersion: item.version, evidencePins: pins } });
      onChange();
    } catch (error) {
      setError(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  return <details>
    <summary>{item.question}</summary>
    <p>{item.answer}</p>
    <h3>답변 근거</h3>
    <ul>{item.citations.map(citation => <li key={citation.id}>
      <strong>{citation.sourceLabel}</strong><p>{citation.body}</p>
    </li>)}</ul>
    {item.state === "draft" && <button className="artist-action" disabled={busy} onClick={() => void approve()}>
      {busy ? "승인 중…" : "근거와 답변 승인하기"}
    </button>}
    {item.state === "approved" && <p>승인됨</p>}
    {error && <p className="error" role="alert">{error}</p>}
  </details>;
}

export function Preview({ id, initialArtworkId }: { id: string; initialArtworkId?: string }) {
  const result = useReviewData(id);
  const [artworkId, setArtworkId] = useState(initialArtworkId ?? "");
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState<PreviewAnswer | null>(null);
  const [rating, setRating] = useState("");
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
      setRating("");
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

  const work = result.data?.works.find(item => item.id === answer?.artworkId);
  return <>
    <Header title="AI 답변 미리보기" back={`${root(id)}/faq`} />
    {!result.data ? <Loading {...result} /> : <>
      <Field label="질문 범위"><select value={artworkId} disabled={busy} onChange={event => setArtworkId(event.target.value)}>
        <option value="">전시 전체</option>
        {result.data.works.map(work => <option key={work.id} value={work.id}>{work.title}</option>)}
      </select></Field>
      {answer && <section className="artist-preview" aria-live="polite">
        <p className="artist-question">{answer.question}</p>
        {work?.imageMaterialId && <PrivateImage key={work.imageMaterialId} materialId={work.imageMaterialId} alt={work.title} className="artist-preview-image" />}
        {answer.result ? <>
          <p>{answer.result.answer}</p>
          {answer.mock && <p className="artist-note">시연용 답변</p>}
          <p>이 답변이 정확한가요?</p>
          <div className="artist-actions">
            <button className="artist-action" disabled={busy} onClick={() => evaluate("accurate")}>정확해요</button>
            <button className="artist-action secondary" disabled={busy} onClick={() => evaluate("needs_revision")}>수정이 필요해요</button>
          </div>
          {rating && <p role="status">평가를 기록했어요.</p>}
        </> : <p>답변을 만들지 못했어요. 작품 자료와 질문 범위를 확인해주세요.</p>}
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
  const [evidence, setEvidence] = useState<Evidence[]>([]);
  const [draft, setDraft] = useState<Evidence | null>(null);
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

  const target = { targetKind: "preview" as const, targetId: answer.id, targetVersion: null };
  const pins = [...(existing.data ?? []), ...evidence];

  function saveCorrection(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    void act(async () => {
      const { data } = await requestApi("createQaCorrectionEvidence", { body: {
        ...target, requestId: crypto.randomUUID(), sourceLabel: String(form.get("sourceLabel")),
        sourceBody: String(form.get("sourceBody")),
      } });
      setDraft(data);
    });
  }

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

  return <dialog ref={dialog} className="artist-sheet" onCancel={onClose} aria-labelledby="rewrite-title">
    <div className="artist-actions">
      <h2 id="rewrite-title">AI 답변 수정</h2>
      <button className="artist-action secondary" onClick={onClose}>닫기</button>
    </div>
    <dl><dt>질문</dt><dd>{answer.question}</dd><dt>여운 답변</dt><dd>{answer.result?.answer}</dd></dl>
    <form onSubmit={rewrite}>
      <Field label="수정한 내용"><textarea name="instruction" maxLength={2000} required disabled={busy} /></Field>
      {!pins.length && <p>수정에 사용할 근거를 아래에서 저장하고 승인해주세요.</p>}
      <button className="artist-action" disabled={busy || !pins.length}>수정 내용 저장하기</button>
    </form>
    {job && <p role="status">{job.status === "succeeded" ? "새 답변 초안을 만들었어요. 자주하는 질문에서 확인할 수 있어요." : statuses[job.status]}</p>}
    <details>
      <summary>정정 근거 추가</summary>
      <form onSubmit={saveCorrection}>
        <Field label="근거 이름"><input name="sourceLabel" maxLength={100} required disabled={busy} /></Field>
        <Field label="근거 내용"><textarea name="sourceBody" maxLength={2000} required disabled={busy} /></Field>
        <button className="artist-action secondary" disabled={busy || Boolean(draft)}>근거 초안 저장</button>
      </form>
      {draft && <section>
        <h3>{draft.sourceLabel}</h3><p>{draft.body}</p>
        <button className="artist-action" disabled={busy} onClick={() => void act(async () => {
          const { data } = await requestApi("approveEvidence", { params: { id: draft.id }, body: { version: draft.version } });
          setEvidence(items => [...items, data]);
          setDraft(null);
        })}>이 근거 승인하기</button>
      </section>}
    </details>
    {(error || existing.error) && <p className="error" role="alert">{error || existing.error}</p>}
  </dialog>;
}
