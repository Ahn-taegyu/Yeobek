"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { ApiClientError, requestApi } from "@/lib/client";
import { loadArtistPage } from "@/lib/client/artist-navigation";
import { errorMessage, Header, Loading, useArtistLoad } from "./ui";

const blockerMessages: Record<string, string> = {
  EXHIBITION_TITLE_REQUIRED: "전시명을 입력해주세요.",
  EXHIBITION_PERIOD_REQUIRED: "전시 시작일과 종료일을 입력해주세요.",
  EXHIBITION_PERIOD_INVALID: "전시 종료일을 시작일 이후로 설정해주세요.",
  EXHIBITION_START_DATE_REQUIRED: "전시 시작일을 입력해주세요.",
  EXHIBITION_END_DATE_REQUIRED: "전시 종료일을 입력해주세요.",
  EXHIBITION_START_TIME_REQUIRED: "전시 시작 시간을 입력해주세요.",
  EXHIBITION_END_TIME_REQUIRED: "전시 종료 시간을 입력해주세요.",
  EXHIBITION_INVALID_PERIOD: "전시 종료 시각을 시작 시각 이후로 설정해주세요.",
  EXHIBITION_PLACE_REQUIRED: "전시 장소를 입력해주세요.",
  EXHIBITION_AUTHORING_INCOMPLETE: "전시 등록에서 작품 단계까지 진행해주세요.",
  ARTIST_NAME_REQUIRED: "작가 이름을 입력해주세요.",
  ARTWORK_REQUIRED: "작품을 등록하고 게시할 작품을 선택해주세요.",
  TITLE_REQUIRED: "작품 제목을 입력해주세요.",
  NUMBER_CONFLICT: "같은 공개 번호를 쓰는 작품도 함께 게시하거나 번호를 바꿔주세요.",
  IMAGE_UNAVAILABLE: "작품 이미지를 다시 등록해주세요.",
  EVIDENCE_REQUIRED: "공개 가능한 근거를 승인해주세요.",
  EVIDENCE_LIMIT: "승인된 공개 근거가 너무 많아요.",
  NARRATION_APPROVAL_REQUIRED: "기본 해설을 승인해주세요.",
  AUDIO_REQUIRED: "전시 설정에 따라 승인한 해설의 음성이 필요해요.",
  MOCK_NARRATION_NOT_ALLOWED: "시연용 해설을 새 해설로 교체하고 승인해주세요.",
  MOCK_QA_NOT_ALLOWED: "시연용 질문이 포함된 작품을 다시 게시해주세요.",
  REVISION_CONFLICT: "최신 내용을 확인한 후 다시 선택해주세요.",
};

const states = { draft: "게시 전", published: "공개 중", paused: "공개 중지" };
const introLabels = { bio: "작가 소개", introduction: "전시 소개", theme: "전시 주제" } as const;
const introFields = Object.keys(introLabels) as (keyof typeof introLabels)[];

function Blockers({ codes }: { codes: string[] }) {
  if (!codes.length) return null;
  const messages = [...new Set(codes.map(code => blockerMessages[code] ?? "게시 준비 상태를 다시 확인해주세요."))];
  return <ul>{messages.map(message => <li key={message}>{message}</li>)}</ul>;
}

async function loadPublication(id: string, signal: AbortSignal) {
  const params = { id };
  const [exhibition, artworks, checklist] = await Promise.all([
    requestApi("getExhibition", { params, signal }), requestApi("listArtworks", { params, signal }),
    requestApi("getPublicationChecklist", { params, signal }),
  ]);
  const work = artworks.data.items[0];
  const review = work && (await requestApi("reviewArtwork", { params: { id: work.id }, signal })).data;
  return { exhibition: exhibition.data, works: artworks.data.items, checklist: checklist.data,
    intro: review?.exhibitionPublicIntro ?? { bio: null, introduction: null, theme: null },
    introEvidence: review?.evidence ?? [],
  };
}

const publicationKey = (id: string) => `publication:${id}`;

export function preparePublication(id: string) {
  return loadArtistPage(publicationKey(id), signal => loadPublication(id, signal));
}

type PublicationData = Awaited<ReturnType<typeof loadPublication>>;
type Selection = { artworkId: string; expectedRevision: number };

export function Publication({ id }: { id: string }) {
  const load = useCallback((signal: AbortSignal) => loadPublication(id, signal), [id]);
  const result = useArtistLoad(load, publicationKey(id));
  return <>
    <Header title="전시 게시 관리" back={`/artist/exhibitions/${id}`} />
    {result.data ? <PublicationForm initial={result.data} /> : <Loading {...result} />}
  </>;
}

function PublicationForm({ initial }: { initial: PublicationData }) {
  const [data, setData] = useState(initial);
  const [selection, setSelection] = useState<Selection[]>([]);
  const [busy, setBusy] = useState(false);
  const [needsReload, setNeedsReload] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [serverBlockers, setServerBlockers] = useState<Record<string, string[]>>({});
  const [showIntro, setShowIntro] = useState(false);
  const [omittedIntroPins, setOmittedIntroPins] = useState<Partial<Record<keyof typeof introLabels, string>>>({});
  const operation = useRef<AbortController | null>(null);
  const publicationRequest = useRef<{ fingerprint: string; requestId: string } | null>(null);
  useEffect(() => () => operation.current?.abort(), []);

  const { exhibition, works, checklist, intro, introEvidence } = data;
  const id = exhibition.id;
  const root = `/artist/exhibitions/${id}`;
  const hasMismatch = exhibition.revision !== checklist.revision || works.length !== checklist.artworks.length ||
    checklist.artworks.some(item => !works.some(work => work.id === item.artworkId && work.revision === item.revision));
  const selectedIds = new Set(selection.map(item => item.artworkId));
  const blocked = busy || needsReload || hasMismatch;

  async function refresh(signal: AbortSignal) {
    const next = await loadPublication(id, signal);
    setData(next);
    setSelection(current => current.filter(item => next.checklist.artworks.some(work => work.artworkId === item.artworkId &&
      work.revision === item.expectedRevision && work.blockingCodes.every(code => code === "NUMBER_CONFLICT"))));
    setNeedsReload(false);
  }

  async function act(run: (signal: AbortSignal) => Promise<void>) {
    if (operation.current) return;
    const controller = new AbortController();
    operation.current = controller;
    setBusy(true);
    setError("");
    setNotice("");
    setServerBlockers({});
    try {
      await run(controller.signal);
    } catch (error) {
      if (controller.signal.aborted) return;
      if (error instanceof ApiClientError && error.status === 401) {
        window.location.replace("/login");
        return;
      }
      if (error instanceof ApiClientError && ["PUBLICATION_BLOCKED", "REVISION_CONFLICT"].includes(error.code)) {
        publicationRequest.current = null;
        setNeedsReload(true);
        setError(error.message);
        if (error.code === "PUBLICATION_BLOCKED") setServerBlockers(error.fields ?? {});
        else if (introFields.some(field => intro[field])) setShowIntro(true);
        try { await refresh(controller.signal); }
        catch { /* Keep the original blockers and offer a fresh load. */ }
      } else setError(errorMessage(error));
    } finally {
      operation.current = null;
      if (!controller.signal.aborted) setBusy(false);
    }
  }

  function publish() {
    if (blocked || !selection.length || checklist.exhibitionBlockingCodes.length) return;
    void act(async signal => {
      const nextIntro = { ...intro };
      for (const field of introFields) {
        const pin = intro[field];
        if (pin && omittedIntroPins[field] === `${pin.id}:${pin.version}`) nextIntro[field] = null;
      }
      const input = { expectedRevision: checklist.revision, artworks: selection, intro: nextIntro };
      const fingerprint = JSON.stringify(input);
      if (publicationRequest.current?.fingerprint !== fingerprint) {
        publicationRequest.current = { fingerprint, requestId: crypto.randomUUID() };
      }
      const response = await requestApi("changePublication", { params: { id }, signal, body: {
        ...input, action: "publish", requestId: publicationRequest.current.requestId,
      } });
      if ("publications" in response.data) {
        const { revision, state } = response.data;
        setData(current => ({ ...current, exhibition: { ...current.exhibition, revision, state } }));
      }
      publicationRequest.current = null;
      setNotice("선택한 작품을 게시했어요.");
      setSelection([]);
      setNeedsReload(true);
      await refresh(signal);
    });
  }

  function pause() {
    if (blocked || !window.confirm("전시 공개를 중지할까요? 관람객이 전시를 열 수 없어요.")) return;
    void act(async signal => {
      const response = await requestApi("changePublication", { params: { id }, signal, body: {
        action: "pause", expectedRevision: checklist.revision,
      } });
      if ("exhibitionState" in response.data) {
        const { revision, exhibitionState: state } = response.data;
        setData(current => ({ ...current, exhibition: { ...current.exhibition, revision, state } }));
      }
      setNotice("전시 공개를 중지했어요.");
      setNeedsReload(true);
      await refresh(signal);
    });
  }

  return <div className="artist-workflow yeobek-appear" aria-busy={busy}>
    <section className="artist-card">
      <h2>{exhibition.draftTitle || exhibition.title || "전시 준비"}</h2>
      <p>{states[exhibition.state]}</p>
      {exhibition.state === "published" && <div className="artist-actions">
        <Link className="artist-action secondary" href={`/exhibitions/${id}`}>공개 전시 보기</Link>
        <button className="artist-action secondary" disabled={blocked} onClick={pause}>전시 공개 중지</button>
      </div>}
    </section>

    <section className="artist-card">
      <h2>게시 준비</h2>
      <Blockers codes={[...checklist.exhibitionBlockingCodes, ...(serverBlockers.exhibition ?? [])]} />
      {!checklist.exhibitionBlockingCodes.length && !serverBlockers.exhibition?.length && <p>전시 정보가 준비됐어요.</p>}
      <ul className="artist-workflow-list">{works.map(work => {
        const item = checklist.artworks.find(item => item.artworkId === work.id);
        const codes = [...(item?.blockingCodes ?? []), ...(serverBlockers[work.id] ?? [])];
        const checked = selectedIds.has(work.id);
        const title = `${work.draftNumber ?? work.number}. ${work.draftTitle || work.title || "제목 미입력"}`;
        return <li key={work.id}>
          <label className="artist-workflow-choice"><input type="checkbox" checked={checked}
            disabled={blocked || !item || item.blockingCodes.some(code => code !== "NUMBER_CONFLICT") || (!checked && selection.length >= 100)}
            onChange={() => item && setSelection(current => checked ? current.filter(selected => selected.artworkId !== work.id)
              : [...current, { artworkId: work.id, expectedRevision: item.revision }])} />{title}</label>
          <Blockers codes={codes} />
          {!codes.length && <p className="artist-note">게시 준비 완료</p>}
          <Link className="artist-workflow-link" href={`${root}/review?work=${work.id}`} aria-label={`${title} 해설 검토`}>해설 검토</Link>
        </li>;
      })}</ul>
      {!!checklist.exhibitionBlockingCodes.length && <Link className="artist-workflow-link" href={root}>전시 정보 확인</Link>}
      {introFields.some(field => intro[field]) && <details open={showIntro} onToggle={event => setShowIntro(event.currentTarget.open)}>
        <summary>기존 공개 소개</summary>
        <ul className="artist-workflow-list">{introFields.map(field => {
          const pin = intro[field];
          if (!pin) return null;
          const pinKey = `${pin.id}:${pin.version}`;
          const evidence = introEvidence.find(item => item.id === pin.id && item.version === pin.version && item.state === "approved");
          const included = omittedIntroPins[field] !== pinKey;
          return <li key={field}>
            <strong>{introLabels[field]}</strong>
            <p className="artist-workflow-text">{evidence?.body ?? "기존 공개 근거를 확인할 수 없어요."}</p>
            <label className="artist-workflow-choice"><input type="checkbox" checked={included} disabled={blocked}
              onChange={event => {
                const checked = event.target.checked;
                setOmittedIntroPins(current => ({ ...current, [field]: checked ? undefined : pinKey }));
              }} />{introLabels[field]} 계속 공개</label>
          </li>;
        })}</ul>
      </details>}
      <div className="artist-actions">
        <button className="artist-action" onClick={publish} disabled={blocked || !selection.length ||
          !!checklist.exhibitionBlockingCodes.length}>선택한 작품 게시</button>
        <button className="artist-action secondary" disabled={busy} onClick={() => void act(refresh)}>다시 확인</button>
      </div>
    </section>
    {hasMismatch && <p role="status">전시가 변경됐어요. 게시 준비를 다시 확인해주세요.</p>}
    {notice && <p role="status">{notice}</p>}
    {error && <p className="error" role="alert">{error}</p>}
  </div>;
}
