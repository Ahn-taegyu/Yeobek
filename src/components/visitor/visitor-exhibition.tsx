"use client";

import Image from "next/image";
import { transitionScreen } from "@/components/ui/motion";
import { brand } from "@/components/ui/brand";
import { useEffect, useRef, useState, type FormEvent } from "react";
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

export function VisitorExhibition({ exhibitionId, initialArtworkId }: {
  exhibitionId: string;
  initialArtworkId?: string;
}) {
  const [load, setLoad] = useState<{ exhibition?: Exhibition; error?: string; unavailable?: boolean }>({});
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    void loadExhibition(exhibitionId, controller.signal).then(exhibition => {
      if (controller.signal.aborted) return;
      if (initialArtworkId && !exhibition.artworks.some(work => work.id === initialArtworkId)) {
        setLoad({ unavailable: true });
      } else setLoad({ exhibition });
    }).catch(error => {
      if (!controller.signal.aborted) setLoad({ error: message(error), unavailable: unavailable(error) });
    });
    return () => controller.abort();
  }, [exhibitionId, initialArtworkId, attempt]);

  if (load.unavailable) return <section data-visitor className={styles.state}>
    <h1>전시를 볼 수 없어요</h1><p>공개된 전시인지 확인하거나 전시장에서 안내한 주소로 다시 접속해주세요.</p>
  </section>;
  if (load.error) return <section data-visitor className={styles.state}>
    <h1>전시를 불러오지 못했어요</h1><p role="alert">{load.error}</p>
    <button className={styles.primary} onClick={() => { setLoad({}); setAttempt(attempt + 1); }}>다시 시도</button>
  </section>;
  if (!load.exhibition) return <section data-visitor className={styles.state} role="status">전시를 불러오는 중이에요.</section>;
  return <Visit exhibition={load.exhibition} initialArtworkId={initialArtworkId} />;
}

function Visit({ exhibition, initialArtworkId }: { exhibition: Exhibition; initialArtworkId?: string }) {
  const [entered, setEntered] = useState(Boolean(initialArtworkId));
  const [selected, setSelected] = useState(initialArtworkId ?? null);
  const [picker, setPicker] = useState<"row" | "grid" | null>(null);
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
  const mutedNow = useRef(false);
  const transcript = useRef<HTMLDivElement>(null);
  const active = exhibition.artworks.find(work => work.id === selected);

  useEffect(() => () => {
    operation.current?.abort();
    audio.current?.pause();
    if (audioUrl.current) URL.revokeObjectURL(audioUrl.current);
  }, []);

  useEffect(() => {
    transcript.current?.scrollTo({ top: transcript.current.scrollHeight });
  }, [turns]);

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
    if (audioUrl.current) URL.revokeObjectURL(audioUrl.current);
    audioUrl.current = null;
  }

  async function play(answerId: string, signal: AbortSignal) {
    if (mutedNow.current) return;
    stopAudio();
    const blob = await requestApi("speech", { body: { requestId: crypto.randomUUID(), answerId }, signal });
    if (signal.aborted || mutedNow.current) return;
    const url = URL.createObjectURL(blob);
    audioUrl.current = url;
    const player = new Audio(url);
    audio.current = player;
    player.onended = () => { if (audio.current === player) stopAudio(); };
    try {
      await player.play();
    } catch {
      if (audio.current === player) {
        stopAudio();
        throw new Error("Audio playback failed");
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

  function select(work: Artwork) {
    const nextId = work.id;
    if (nextId !== selected) {
      contextSequence.current += 1;
      pendingChat.current = null;
      operation.current?.abort();
      operation.current = null;
      stopAudio();
      setBusy(null);
      setError("");
    }
    setSelected(nextId);
    setPicker(null);
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = question.trim();
    if (!text || codepoints(text) > AI_LIMITS.question || recording.state !== "idle") return;
    void run("chat", async signal => {
      const input = {
        exhibitionId: exhibition.id, artworkId: selected,
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
      setTurns(previous => [...previous, {
        question: text, reply, artwork: exhibition.artworks.find(work => work.id === reply.publication?.artworkId),
      }]);
      setQuestion("");
      setVoiceDraft(false);
      if (reply.outputMode === "voice") await play(reply.answerId, signal);
    });
  }

  if (!entered) return <section data-visitor className={styles.intro}>
    <div className={styles.brand}>{brand.name}</div>
    <span className={styles.poster} aria-hidden="true" />
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
      <span className={styles.brand}>{active ? `${active.number}. ${active.title}` : brand.name}</span>
      <button className={styles.textButton} aria-expanded={picker !== null}
        onClick={() => transitionScreen(() => setPicker(picker ? null : "row"))}>{picker ? "닫기" : "작품 선택"}</button>
    </div>
    {picker && <section className={styles.picker} aria-label="작품 목록">
      <div className={styles.pickerHeading}><h2>작품 목록</h2>
        <button className={styles.textButton} onClick={() => transitionScreen(() => setPicker(picker === "grid" ? "row" : "grid"))}>
          {picker === "grid" ? "한 줄로 보기" : "전체보기"}
        </button></div>
      {picker === "grid" && <div className={styles.search}><input aria-label="작품 검색" type="search"
        placeholder="작품 검색" value={search} onChange={event => setSearch(event.target.value)} />
        <Image src="/yeobek/visitor-search.svg" alt="" width={24} height={24} /></div>}

      {exhibition.artworks.length === 0 && <p>공개된 작품이 아직 없어요.</p>}
      {picker === "grid" && exhibition.artworks.length > 0 && !shown.length && <p>검색 결과가 없어요.</p>}
      <ul className={picker === "grid" ? styles.grid : styles.strip}>
        {(picker === "grid" ? shown : exhibition.artworks).map(work => <li key={work.id}>
          <button className={styles.tile} aria-pressed={selected === work.id} onClick={() => transitionScreen(() => select(work))}>
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
        {artwork?.image && <ArtImage key={artwork.image.id} artwork={artwork} className={styles.answerImage} />}
        <p className={styles.answer}>{reply.answer}</p>
        {reply.notice && <p>{reply.notice}</p>}
        {!muted && <button className={styles.textButton} disabled={busy !== null}
          onClick={() => void run("speech", signal => play(reply.answerId, signal))}>답변 듣기</button>}
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
            else { setError(""); void recording.start(); }
          }}>{recording.state === "recording" ? "■" : <Image src="/yeobek/visitor-wave.svg" alt="" width={24} height={24} />}</button>
      </form>
    </div>
  </section>;
}
