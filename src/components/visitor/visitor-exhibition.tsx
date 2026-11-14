"use client";

import Image from "next/image";
import { transitionScreen } from "@/components/ui/motion";
import { brand } from "@/components/ui/brand";
import { useCallback, useEffect, useEffectEvent, useRef, useState, type FormEvent } from "react";
import { ApiClientError, requestApi } from "@/lib/client";
import { AI_LIMITS, codepoints } from "@/lib/contracts/chat";
import type { ChatRequestInput } from "@/lib/contracts/chat";
import { useRecording } from "./use-recording";
import styles from "./visitor.module.css";

type Exhibition = Awaited<ReturnType<typeof loadExhibition>>;
type Artwork = Exhibition["artworks"][number];
type Reply = Awaited<ReturnType<typeof askQuestion>>;
type Turn = { question: string; reply: Reply; artwork?: Artwork };

async function loadExhibition(id: string, signal: AbortSignal) {
  return (await requestApi("getPublicExhibition", { params: { id }, signal })).data;
}

async function askQuestion(body: ChatRequestInput, signal: AbortSignal) {
  return (await requestApi("chat", { body, signal })).data;
}

function unavailable(error: unknown) {
  return error instanceof ApiClientError && (error.status === 404 || error.code === "INVALID_INPUT");
}

function message(error: unknown) {
  if (error instanceof ApiClientError && error.code === "REQUEST_IN_PROGRESS") {
    return "답변을 준비하고 있어요. 잠시 후 다시 눌러주세요.";
  }
  return error instanceof ApiClientError ? error.message : "요청을 완료하지 못했어요. 다시 시도해주세요.";
}

function responseMayBePending(error: unknown) {
  return error instanceof ApiClientError && ["NETWORK_ERROR", "REQUEST_IN_PROGRESS"].includes(error.code);
}

function ArtImage({ artwork, className, decorative = false }: { artwork: Artwork; className?: string; decorative?: boolean }) {
  const [failed, setFailed] = useState(false);
  return artwork.image && !failed
    ? <Image unoptimized className={className} src={`/api/media/${artwork.image.id}?kind=image`} width={352} height={180}
        alt={decorative ? "" : artwork.title} onError={() => setFailed(true)} />
    : <span className={className} aria-hidden="true">{artwork.number}</span>;
}

function OptionalImage({ id, kind, className, alt }: { id: string; kind: "poster" | "image"; className: string; alt: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) return null;
  return <Image unoptimized className={className} src={`/api/media/${id}?kind=${kind}`}
    width={kind === "poster" ? 233 : 352} height={kind === "poster" ? 392 : 180}
    alt={alt} onError={() => setFailed(true)} />;
}

export function VisitorExhibition({ exhibitionId, initialArtworkId }: {
  exhibitionId: string;
  initialArtworkId?: string;
}) {
  const [load, setLoad] = useState<
    | { status: "loading" | "unavailable" | "error" }
    | { status: "ready"; exhibition: Exhibition }
  >({ status: "loading" });
  const [attempt, setAttempt] = useState(0);
  const [showWorks, setShowWorks] = useState(false);
  const markUnavailable = useCallback(() => setLoad({ status: "unavailable" }), []);
  useEffect(() => {
    const controller = new AbortController();
    void loadExhibition(exhibitionId, controller.signal).then(exhibition => {
      if (!controller.signal.aborted) setLoad({ status: "ready", exhibition });
    }).catch(error => {
      if (!controller.signal.aborted) setLoad({ status: unavailable(error) ? "unavailable" : "error" });
    });
    return () => controller.abort();
  }, [exhibitionId, attempt]);

  function retry() {
    setLoad({ status: "loading" });
    setAttempt(previous => previous + 1);
  }

  if (load.status === "error") return <section data-visitor className={styles.state}>
    <h1>전시를 불러오지 못했어요</h1><p role="alert">연결을 확인한 뒤 다시 시도해주세요.</p>
    <button className={styles.primary} onClick={retry}>다시 시도</button>
  </section>;
  if (load.status === "unavailable" || (load.status === "ready" && load.exhibition.artworks.length === 0)) {
    return <section data-visitor className={styles.state}>
      <h1>현재 이용할 수 없는 전시예요</h1><p>전시장 안내를 확인해주세요.</p>
      <button className={styles.primary} onClick={retry}>공개 상태 다시 확인</button>
    </section>;
  }
  if (load.status !== "ready") {
    return <section data-visitor className={styles.state} role="status">전시를 불러오는 중이에요.</section>;
  }

  const artworkUnavailable = initialArtworkId && !load.exhibition.artworks.some(work => work.id === initialArtworkId);
  if (artworkUnavailable && !showWorks) return <section data-visitor className={styles.state}>
    <h1>이 작품은 현재 안내할 수 없어요</h1>
    <button className={styles.primary} onClick={() => transitionScreen(() => setShowWorks(true))}>공개 작품 목록 보기</button>
  </section>;
  return <Visit exhibition={load.exhibition} initialArtworkId={artworkUnavailable ? undefined : initialArtworkId}
    showWorks={showWorks} onUnavailable={markUnavailable} />;
}

function Visit({ exhibition: initialExhibition, initialArtworkId, showWorks, onUnavailable }: {
  exhibition: Exhibition;
  initialArtworkId?: string;
  showWorks: boolean;
  onUnavailable: () => void;
}) {
  const [exhibition, setExhibition] = useState(initialExhibition);
  const [retiredAnswers, setRetiredAnswers] = useState<ReadonlySet<string>>(() => new Set());
  const [entered, setEntered] = useState(Boolean(initialArtworkId) || showWorks);
  const [selected, setSelected] = useState(initialArtworkId ?? null);
  const [picker, setPicker] = useState<"row" | "grid" | null>(showWorks ? "grid" : null);
  const [search, setSearch] = useState("");
  const [question, setQuestion] = useState("");
  const [voiceDraft, setVoiceDraft] = useState(false);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [muted, setMuted] = useState(false);
  const [busy, setBusy] = useState<"chat" | "transcribe" | "speech" | null>(null);
  const [error, setError] = useState("");
  const operation = useRef<AbortController | null>(null);
  const pendingChat = useRef<{ key: string; requestId: string } | null>(null);
  const contextSequence = useRef(0);
  const audio = useRef<HTMLAudioElement | null>(null);
  const audioUrl = useRef<string | null>(null);
  const playingAnswer = useRef<string | null>(null);
  const retiredAnswerIds = useRef(new Set<string>());
  const currentTurns = useRef(turns);
  const selectedNow = useRef(selected);
  const mutedNow = useRef(false);
  const transcript = useRef<HTMLDivElement>(null);
  const active = exhibition.artworks.find(work => work.id === selected);

  useEffect(() => () => {
    operation.current?.abort();
    audio.current?.pause();
    if (audioUrl.current) URL.revokeObjectURL(audioUrl.current);
  }, []);

  useEffect(() => {
    selectedNow.current = selected;
  }, [selected]);

  useEffect(() => {
    currentTurns.current = turns;
    transcript.current?.scrollTo({ top: transcript.current.scrollHeight });
  }, [turns]);

  // A paused artwork leaves the public list: drop it exactly like a manual deselection,
  // cancelling its pending answer and narration so nothing late reappears.
  const clearRemovedSelection = useEffectEvent((latest: Exhibition) => {
    if (selectedNow.current && !latest.artworks.some(work => work.id === selectedNow.current)) clearSelection();
  });

  useEffect(() => {
    if (!entered) return;
    const controller = new AbortController();
    let checking = false;

    async function refresh() {
      if (checking || document.hidden) return;
      checking = true;
      try {
        const latest = await loadExhibition(initialExhibition.id, controller.signal);
        if (controller.signal.aborted) return;
        if (!latest.artworks.length) {
          onUnavailable();
          return;
        }
        setExhibition(latest);
        clearRemovedSelection(latest);

        const publishedTurns = currentTurns.current.flatMap(({ reply }) =>
          reply.publication && !retiredAnswerIds.current.has(reply.answerId) ? [{ answerId: reply.answerId, publication: reply.publication }] : []);
        const retired: string[] = [];
        for (let start = 0; start < publishedTurns.length; start += 100) {
          const batch = publishedTurns.slice(start, start + 100);
          const { data } = await requestApi("checkVersions", {
            params: { id: latest.id }, signal: controller.signal,
            body: { publications: batch.map(({ publication: { artworkId, publicationId, version } }) =>
              ({ artworkId, publicationId, version })) },
          });
          for (const { answerId, publication } of batch) {
            if (!data.publications.some(item => item.current && item.artworkId === publication.artworkId &&
              item.publicationId === publication.publicationId && item.version === publication.version)) retired.push(answerId);
          }
        }
        if (!controller.signal.aborted && retired.length) {
          for (const answerId of retired) retiredAnswerIds.current.add(answerId);
          if (playingAnswer.current && retiredAnswerIds.current.has(playingAnswer.current)) stopAudio();
          setRetiredAnswers(new Set(retiredAnswerIds.current));
        }
      } catch (error) {
        if (!controller.signal.aborted && unavailable(error)) onUnavailable();
      } finally {
        checking = false;
      }
    }

    const timer = window.setInterval(() => void refresh(), 10000);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      controller.abort();
      window.clearInterval(timer);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [entered, initialExhibition.id, onUnavailable]);

  async function run(kind: NonNullable<typeof busy>, action: (signal: AbortSignal) => Promise<void>) {
    if (operation.current) return;
    const controller = new AbortController();
    operation.current = controller;
    setBusy(kind);
    setError("");
    try {
      await action(controller.signal);
    } catch (error) {
      if (!controller.signal.aborted) setError(message(error));
    } finally {
      if (operation.current === controller) operation.current = null;
      if (!controller.signal.aborted) setBusy(null);
    }
  }

  function stopAudio() {
    audio.current?.pause();
    audio.current = null;
    playingAnswer.current = null;
    if (audioUrl.current) URL.revokeObjectURL(audioUrl.current);
    audioUrl.current = null;
  }

  async function play(answerId: string, signal: AbortSignal) {
    if (mutedNow.current || retiredAnswerIds.current.has(answerId)) return;
    stopAudio();
    const blob = await requestApi("speech", { body: { requestId: crypto.randomUUID(), answerId }, signal });
    if (signal.aborted || mutedNow.current || retiredAnswerIds.current.has(answerId)) return;
    const url = URL.createObjectURL(blob);
    audioUrl.current = url;
    const player = new Audio(url);
    audio.current = player;
    playingAnswer.current = answerId;
    player.onended = () => { if (audio.current === player) stopAudio(); };
    player.onerror = () => {
      if (audio.current !== player) return;
      stopAudio();
      setError("답변을 재생하지 못했어요. 다시 시도해주세요.");
    };
    try {
      await player.play();
    } catch {
      if (audio.current === player) {
        stopAudio();
        setError("답변을 재생하지 못했어요. 다시 시도해주세요.");
      }
    }
  }

  const recording = useRecording(file => {
    void run("transcribe", async signal => {
      const { data } = await requestApi("transcribe", {
        body: { requestId: crypto.randomUUID(), exhibitionId: exhibition.id, file }, signal,
      });
      setQuestion(data.transcript);
      setVoiceDraft(true);
    });
  }, setError);

  function togglePicker() {
    transitionScreen(() => setPicker(picker ? null : "row"));
  }

  function resetConversationContext() {
    contextSequence.current += 1;
    pendingChat.current = null;
    operation.current?.abort();
    operation.current = null;
    stopAudio();
    setBusy(null);
    setError("");
  }

  function clearSelection() {
    resetConversationContext();
    selectedNow.current = null;
    setSelected(null);
  }

  function select(work: Artwork) {
    const nextId = selected === work.id ? null : work.id;
    if (nextId !== selected) resetConversationContext();
    selectedNow.current = nextId;
    setSelected(nextId);
    if (nextId !== null) setPicker(null);
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = question.trim();
    if (!text || codepoints(text) > AI_LIMITS.question || recording.state !== "idle") return;
    void run("chat", async signal => {
      const input = {
        exhibitionId: exhibition.id, artworkId: active?.id ?? null,
        question: text, contextSequence: contextSequence.current,
        inputMode: voiceDraft ? "voice" : "text", outputMode: mutedNow.current ? "text" : "voice",
      } satisfies Omit<ChatRequestInput, "requestId">;
      const key = JSON.stringify(input);
      const requestId = pendingChat.current?.key === key ? pendingChat.current.requestId : crypto.randomUUID();
      pendingChat.current = { key, requestId };
      const reply = await askQuestion({ ...input, requestId }, signal).catch(error => {
        if (pendingChat.current?.requestId === requestId && !responseMayBePending(error)) pendingChat.current = null;
        throw error;
      });
      if (signal.aborted || reply.contextSequence !== contextSequence.current) return;
      pendingChat.current = null;
      const resolved = exhibition.artworks.find(work => work.id === reply.publication?.artworkId);
      if (resolved) setSelected(resolved.id);
      setTurns(previous => [...previous, {
        question: text, reply, artwork: resolved,
      }]);
      setQuestion("");
      setVoiceDraft(false);
      if (reply.outputMode === "voice") await play(reply.answerId, signal);
    });
  }

  if (!entered) return <section data-visitor className={styles.intro}>
    <div className={styles.brand}>{brand.name}</div>
    {exhibition.poster && <OptionalImage key={exhibition.poster.id} id={exhibition.poster.id} kind="poster"
      className={styles.poster} alt={`${exhibition.title} 포스터`} />}
    <div>
      <h1>{exhibition.title}</h1>
      <p>{exhibition.artistDisplayName}</p>
      {exhibition.place && <p>{exhibition.place}</p>}
      {(exhibition.startDate || exhibition.endDate) &&
        <p>{[[exhibition.startDate, exhibition.startTime], [exhibition.endDate, exhibition.endTime]].filter(([date]) => date).map(parts => parts.filter(Boolean).join(" ")).join(" – ")}</p>}
      {exhibition.introduction && <p className={styles.description}>{exhibition.introduction}</p>}
    </div>
    <button className={styles.primary} onClick={() => transitionScreen(() => setEntered(true))}>여백 채우러 가기</button>
  </section>;

  const shown = exhibition.artworks.filter(work => `${work.number}. ${work.title}`.toLowerCase().includes(search.trim().toLowerCase()));
  const tooLong = codepoints(question.trim()) > AI_LIMITS.question;
  return <section data-visitor className={styles.chat} data-selected={Boolean(active)}>
    <div className={styles.toolbar}>
      <button className={styles.icon} aria-label={muted ? "음소거 해제" : "음소거"} aria-pressed={muted} onClick={() => {
        mutedNow.current = !muted;
        setMuted(!muted);
        if (!muted) stopAudio();
      }}><Image src="/yeobek/visitor-sound.svg" alt="" width={24} height={24} />{muted && <span aria-hidden="true">×</span>}</button>
      {active
        ? <button type="button" className={styles.artworkTitle} aria-expanded={picker !== null}
            onClick={togglePicker}>{active.number}. {active.title}</button>
        : <span className={styles.brand}>{brand.name}</span>}
      <button type="button" className={styles.textButton} aria-expanded={picker !== null}
        onClick={togglePicker}>{picker ? "닫기" : "작품 선택"}</button>
    </div>
    {picker && <section className={styles.picker} aria-label="작품 목록">
      <div className={styles.pickerHeading}><h2>작품 목록</h2>
        <button className={styles.textButton} onClick={() => transitionScreen(() => setPicker(picker === "grid" ? "row" : "grid"))}>
          {picker === "grid" ? "한 줄로 보기" : "전체보기"}
        </button></div>
      {picker === "grid" && <div className={styles.search}><input aria-label="작품 검색" type="search"
        placeholder="작품 검색" value={search} onChange={event => setSearch(event.target.value)} />
        <Image src="/yeobek/visitor-search.svg" alt="" width={24} height={24} /></div>}

      {picker === "grid" && !shown.length && <p>검색 결과가 없어요. 전시장에 있는 작품 중 온라인 안내가 제공되지 않는 작품도 있어요.</p>}
      <ul className={picker === "grid" ? styles.grid : styles.strip}>
        {(picker === "grid" ? shown : exhibition.artworks).map(work => <li key={work.id}>
          <button className={styles.tile} aria-pressed={active?.id === work.id} onClick={() => transitionScreen(() => select(work))}>
            <ArtImage artwork={work} className={styles.thumbnail} decorative />
            <span>{work.number}. {work.title}</span>
          </button>
        </li>)}
      </ul>
    </section>}
    <div className={styles.transcript} ref={transcript} aria-live="polite">
      {!turns.length && <div className={styles.welcome}>
        <h1>{exhibition.title}</h1>
        <p>전시에서 느낀 감동과 기억이 오래도록 남을 수 있도록,<br />작품에 담긴 이야기를 들려드릴게요.</p>
      </div>}
      {turns.map(({ question, reply, artwork }) => <article className={`${styles.turn} yeobek-appear`} key={reply.answerId}>
        <p className={styles.bubble}>{question}</p>
        {retiredAnswers.has(reply.answerId) ? <p>이 답변은 현재 안내할 수 없어요.</p> : <>
          {reply.image === undefined && artwork?.image && <ArtImage key={artwork.image.id} artwork={artwork} className={styles.answerImage} />}
          {reply.image && <OptionalImage key={reply.image.id} id={reply.image.id} kind="image"
            className={styles.answerImage} alt={artwork?.title ?? "작품 이미지"} />}
          <p className={styles.answer}>{reply.answer}</p>
          {reply.notice && <p>{reply.notice}</p>}
          {!muted && <button className={styles.textButton} disabled={busy !== null || recording.state !== "idle"}
            onClick={() => void run("speech", signal => play(reply.answerId, signal))}>답변 듣기</button>}
        </>}
      </article>)}
      {busy === "chat" && <p role="status">답변을 준비하고 있어요.</p>}
    </div>
    <div className={styles.composer}>
      {error && <p role="alert">{error}</p>}
      {tooLong && <p role="alert">질문을 {AI_LIMITS.question}자 이내로 줄여주세요.</p>}
      {voiceDraft && !tooLong && <p role="status">인식된 문장을 확인하고 보내주세요.</p>}
      {busy === "transcribe" && <p role="status">음성을 글로 바꾸고 있어요.</p>}
      <form onSubmit={submit}>
        <input aria-label="질문" placeholder="자유롭게 질문해보세요" value={question}
          onChange={event => setQuestion(event.target.value)} disabled={busy === "chat" || busy === "transcribe"} />
        {question.trim() && <button className={styles.send} type="submit"
          disabled={Boolean(busy) || tooLong || recording.state !== "idle"}>보내기</button>}
        <button className={styles.mic} type="button" disabled={Boolean(busy) || recording.state === "requesting"}
          aria-label={recording.state === "recording" ? "녹음 종료" : "음성 녹음"}
          onClick={() => {
            if (recording.state === "recording") recording.stop();
            else {
              stopAudio();
              setError("");
              void recording.start();
            }
          }}>{recording.state === "recording" ? "■" : <Image src="/yeobek/visitor-wave.svg" alt="" width={24} height={24} />}</button>
      </form>
    </div>
  </section>;
}
