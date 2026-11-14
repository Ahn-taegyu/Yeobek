"use client";

import Image from "next/image";
import { transitionScreen } from "@/components/ui/motion";
import { brand } from "@/components/ui/brand";
import { useEffect, useEffectEvent, useLayoutEffect, useRef, useState, type FormEvent, type ComponentType } from "react";
import { AiStarLogo } from "@/components/ui/ai-star/ai-star-logo";
import { ApiClientError, requestApi } from "@/lib/client";
import { AI_LIMITS, codepoints } from "@/lib/contracts/chat";
import type { ChatRequestInput } from "@/lib/contracts/chat";
import { useRecording } from "./use-recording";
import styles from "./visitor.module.css";
import type { ExperienceArtwork, ExperienceExhibition, ExperienceImageProps, ExperienceReply, ExperienceTransport } from "./experience-types";

type Exhibition = Awaited<ReturnType<typeof loadExhibition>>;
type Artwork = ExperienceArtwork;
type Reply = ExperienceReply;
type Turn = { id: string; question: string; reply: Reply; artwork?: Artwork; reveal?: boolean; isNarration?: boolean };
/** The question being answered: shown as its bubble with the thinking star until the reply lands. */
type Asking = { id: string; question: string; leaving: boolean; isNarration?: boolean };

/** Thinking star fade-out before the answer starts revealing (matches .thinking transition). */
const THINKING_FADE_MS = 280;
/** Delay between answer lines as they fade in top to bottom (matches .revealWord animation). */
const REVEAL_LINE_MS = 110;
const REVEAL_FADE_MS = 420;

const reducedMotion = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

function wait(ms: number, signal: AbortSignal) {
  return new Promise<void>(resolve => {
    if (ms <= 0 || signal.aborted) return resolve();
    const timer = setTimeout(resolve, ms);
    signal.addEventListener("abort", () => { clearTimeout(timer); resolve(); }, { once: true });
  });
}

/**
 * Fades an answer in line by line: words are measured once, grouped by rendered line and staggered;
 * after the reveal the paragraph returns to plain text so it reflows normally.
 */
function RevealLines({ text, className }: { text: string; className?: string }) {
  const ref = useRef<HTMLParagraphElement>(null);
  const [done, setDone] = useState(reducedMotion);
  useLayoutEffect(() => {
    const element = ref.current;
    if (done || !element) return;
    let line = -1;
    let top = -Infinity;
    element.querySelectorAll<HTMLElement>("[data-word]").forEach(word => {
      if (word.offsetTop > top + 2) {
        line += 1;
        top = word.offsetTop;
      }
      word.style.animationDelay = `${line * REVEAL_LINE_MS}ms`;
    });
    const timer = setTimeout(() => setDone(true), Math.max(0, line) * REVEAL_LINE_MS + REVEAL_FADE_MS);
    return () => clearTimeout(timer);
  }, [done]);
  if (done) return <p className={className}>{text}</p>;
  return <p ref={ref} className={className}>
    {text.split(/(\s+)/).map((part, index) => !part || /^\s+$/.test(part)
      ? part
      : <span key={index} data-word className={styles.revealWord}>{part}</span>)}
  </p>;
}

async function loadExhibition(id: string, signal: AbortSignal) {
  return (await requestApi("getPublicExhibition", { params: { id }, signal })).data;
}

const publicTransport: ExperienceTransport = {
  async ask(body, signal) {
    const { data } = await requestApi("chat", { body, signal });
    return { ...data, artworkId: data.publication?.artworkId ?? null };
  },
  async transcribe(body, signal) { return (await requestApi("transcribe", { body, signal })).data; },
  speak(body, signal) { return requestApi("speech", { body, signal }); },
};

function PublicImage({ id, kind, alt, className, fallback, thumbnail = false }: ExperienceImageProps) {
  const [failed, setFailed] = useState(false);
  if (failed) return <span className={className} aria-hidden="true">{fallback}</span>;
  // Request a resized copy: thumbnails are about 90-120px, posters and answer images about 350px wide.
  return <Image unoptimized className={className} src={`/api/media/${id}?kind=${kind}&w=${thumbnail ? 320 : 640}`}
    width={kind === "poster" ? 233 : 352} height={kind === "poster" ? 392 : 180} alt={alt} onError={() => setFailed(true)} />;
}

function unavailable(error: unknown) {
  return error instanceof ApiClientError && (error.status === 404 || error.code === "INVALID_INPUT");
}

class PlaybackError extends Error {}

// 0.05s of 8kHz mono silence. Playing it inside a tap lets mobile browsers play the
// real answer on the same element later, after the speech request has finished.
let silence: string | undefined;
function silentWav() {
  if (silence) return silence;
  const samples = 400, bytes = new Uint8Array(44 + samples), view = new DataView(bytes.buffer);
  const text = (offset: number, value: string) => [...value].forEach((char, index) => view.setUint8(offset + index, char.charCodeAt(0)));
  text(0, "RIFF"); view.setUint32(4, 36 + samples, true); text(8, "WAVE"); text(12, "fmt ");
  view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
  view.setUint32(24, 8000, true); view.setUint32(28, 8000, true); view.setUint16(32, 1, true); view.setUint16(34, 8, true);
  text(36, "data"); view.setUint32(40, samples, true); bytes.fill(128, 44);
  silence = `data:audio/wav;base64,${btoa(String.fromCharCode(...bytes))}`;
  return silence;
}

function setSource(player: HTMLAudioElement, src: string, onEnded?: () => void) {
  player.onended = onEnded ?? null;
  player.src = src;
}

function message(error: unknown) {
  if (error instanceof PlaybackError) return "소리를 재생하지 못했어요. '답변 듣기'를 눌러 다시 들어주세요.";
  if (error instanceof ApiClientError && error.code === "REQUEST_IN_PROGRESS") {
    return "답변을 준비하고 있어요. 잠시 후 다시 눌러주세요.";
  }
  return error instanceof ApiClientError ? error.message : "요청을 완료하지 못했어요. 다시 시도해주세요.";
}

function responseMayBePending(error: unknown) {
  return error instanceof ApiClientError && ["NETWORK_ERROR", "REQUEST_IN_PROGRESS"].includes(error.code);
}

function ArtImage({ artwork, className, decorative = false, thumbnail = false, grid = false, ImageComponent }: {
  artwork: Artwork; className?: string; decorative?: boolean; thumbnail?: boolean; grid?: boolean; ImageComponent: ComponentType<ExperienceImageProps>;
}) {
  const [failed, setFailed] = useState(false);
  const [fallbackFailed, setFallbackFailed] = useState(false);
  if (thumbnail) return <span className={styles.pickerImage} onErrorCapture={() => setFailed(true)}>
    {artwork.image?.id?.trim() && !failed
      ? <ImageComponent key={artwork.image.id} id={artwork.image.id} kind="image" className={className} alt="" thumbnail />
      : !fallbackFailed && <span className={`${className} ${styles.fallbackImage} ${grid ? styles.gridFallback : ""}`}>
        <Image src={grid ? "/yeobek/artwork-default.png" : "/yeobek/visitor-fallback.png"}
          width={grid ? 332 : 320} height={grid ? 186 : 320} alt="" onError={() => setFallbackFailed(true)} />
      </span>}
  </span>;
  return artwork.image?.id
    ? <ImageComponent key={artwork.image.id} id={artwork.image.id} kind="image" className={className} fallback={String(artwork.number)}
      alt={decorative ? "" : artwork.title} thumbnail={thumbnail} />
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
  return <ExhibitionExperience exhibition={load.exhibition} initialArtworkId={initialArtworkId}
    transport={publicTransport} ImageComponent={PublicImage} />;
}

export function ExhibitionExperience({ exhibition, initialArtworkId, transport, ImageComponent, initiallyMuted = false,
  emptyArtworkMessage = "공개된 작품이 아직 없어요." }: {
  exhibition: ExperienceExhibition; initialArtworkId?: string; transport: ExperienceTransport;
  ImageComponent: ComponentType<ExperienceImageProps>; initiallyMuted?: boolean; emptyArtworkMessage?: string;
}) {
  const [entered, setEntered] = useState(Boolean(initialArtworkId));
  const [selected, setSelected] = useState(initialArtworkId ?? null);
  const [picker, setPicker] = useState<"row" | "grid" | null>(null);
  const [search, setSearch] = useState("");
  const [question, setQuestion] = useState("");
  const [voiceDraft, setVoiceDraft] = useState(false);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [asking, setAsking] = useState<Asking | null>(null);
  const [muted, setMuted] = useState(initiallyMuted);
  const [busy, setBusy] = useState<"chat" | "transcribe" | "speech" | null>(null);
  const [error, setError] = useState("");
  const operation = useRef<AbortController | null>(null);
  const pendingChat = useRef<{ key: string; requestId: string } | null>(null);
  const introduced = useRef(new Set<string>());
  const contextSequence = useRef(0);
  const audio = useRef<HTMLAudioElement | null>(null);
  const audioUrl = useRef<string | null>(null);
  const mutedNow = useRef(initiallyMuted);
  const transcript = useRef<HTMLDivElement>(null);
  const active = exhibition.artworks.find(work => work.id === selected);

  useEffect(() => () => {
    operation.current?.abort();
    audio.current?.pause();
    if (audioUrl.current) URL.revokeObjectURL(audioUrl.current);
  }, []);

  useEffect(() => {
    transcript.current?.scrollTo({ top: transcript.current.scrollHeight });
  }, [turns, asking?.id]);

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
    if (audioUrl.current) URL.revokeObjectURL(audioUrl.current);
    audioUrl.current = null;
  }

  /** Call synchronously from a tap. One element is reused so a later, asynchronous play() is still allowed. */
  function unlockAudio() {
    if (mutedNow.current) return;
    const player = audio.current ?? new Audio();
    audio.current = player;
    if (audioUrl.current) return;
    setSource(player, silentWav());
    void player.play().catch(() => {});
  }

  async function play(answerId: string, signal: AbortSignal) {
    if (mutedNow.current) return;
    stopAudio();
    const blob = await transport.speak({ requestId: crypto.randomUUID(), answerId }, signal);
    if (signal.aborted || mutedNow.current) return;
    const url = URL.createObjectURL(blob);
    audioUrl.current = url;
    const player = audio.current ?? new Audio();
    audio.current = player;
    setSource(player, url, () => { if (audioUrl.current === url) stopAudio(); });
    try {
      await player.play();
    } catch {
      if (audioUrl.current === url) {
        stopAudio();
        if (!signal.aborted) throw new PlaybackError("Audio playback failed");
      }
    }
  }

  const recording = useRecording(file => {
    void run("transcribe", async signal => {
      const data = await transport.transcribe({ requestId: crypto.randomUUID(), exhibitionId: exhibition.id, file }, signal);
      if (signal.aborted) return;
      setQuestion(data.transcript);
      setVoiceDraft(true);
    });
  }, setError);

  function select(work: Artwork) {
    const nextId = work.id === selected ? null : work.id;
    const changed = nextId !== selected;
    if (changed) {
      contextSequence.current += 1;
      pendingChat.current = null;
      operation.current?.abort();
      operation.current = null;
      stopAudio();
      setBusy(null);
      setAsking(null);
      setError("");
    }
    setSelected(nextId);
    if (nextId !== null) setPicker(null);
    // Picking a different artwork immediately shows its approved introduction.
    if (changed && nextId && !introduced.current.has(nextId)) send(`${work.number}. ${work.title}`, { artworkId: nextId, intent: "narration", fromDraft: false });
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = question.trim();
    if (!text || codepoints(text) > AI_LIMITS.question || recording.state !== "idle") return;
    unlockAudio();
    send(text, { artworkId: selected, fromDraft: true });
  }

  function send(text: string, { artworkId, intent, fromDraft }: { artworkId: string | null; intent?: "narration"; fromDraft: boolean }) {
    if (operation.current) return;
    const turnId = crypto.randomUUID();
    setAsking({ id: turnId, question: text, leaving: false, isNarration: intent === "narration" });
    void run("chat", async signal => {
      try {
        await ask(signal);
      } finally {
        setAsking(current => current?.id === turnId ? null : current);
      }
    });

    async function ask(signal: AbortSignal) {
      const input = {
        exhibitionId: exhibition.id, artworkId, question: text, ...(intent ? { intent } : {}),
        contextSequence: contextSequence.current,
        inputMode: fromDraft && voiceDraft ? "voice" : "text", outputMode: mutedNow.current ? "text" : "voice",
      } satisfies Omit<ChatRequestInput, "requestId">;
      const key = JSON.stringify(input);
      const requestId = pendingChat.current?.key === key ? pendingChat.current.requestId : crypto.randomUUID();
      pendingChat.current = { key, requestId };
      const reply = await transport.ask({ ...input, requestId }, signal).catch(error => {
        if (pendingChat.current?.requestId === requestId && !responseMayBePending(error)) pendingChat.current = null;
        throw error;
      });
      if (signal.aborted || reply.contextSequence !== contextSequence.current) return;
      pendingChat.current = null;
      // Let the thinking star fade out under the bubble before the answer starts to appear.
      setAsking(current => current?.id === turnId ? { ...current, leaving: true } : current);
      await wait(reducedMotion() ? 0 : THINKING_FADE_MS, signal);
      if (signal.aborted) return;
      if (intent === "narration" && artworkId) introduced.current.add(artworkId);
      const resolved = exhibition.artworks.find(work => work.id === reply.artworkId);
      if (resolved) setSelected(resolved.id);
      setTurns(previous => [...previous, {
        id: turnId, question: text, reply, artwork: resolved, reveal: true, isNarration: intent === "narration",
      }]);
      setAsking(null);
      if (fromDraft) {
        setQuestion("");
        setVoiceDraft(false);
      }
      if (reply.outputMode === "voice" && reply.canSpeak !== false) await play(reply.answerId, signal);
    }
  }

  const introduceDirectArtwork = useEffectEvent(() => {
    const work = exhibition.artworks.find(item => item.id === initialArtworkId);
    if (work && !introduced.current.has(work.id)) {
      send(`${work.number}. ${work.title}`, { artworkId: work.id, intent: "narration", fromDraft: false });
    }
  });

  useEffect(() => {
    if (!initialArtworkId) return;
    const timer = window.setTimeout(() => introduceDirectArtwork(), 0);
    return () => window.clearTimeout(timer);
  }, [initialArtworkId]);

  if (!entered) return <section data-visitor className={styles.intro}>
    <div className={styles.brand}>{brand.name}</div>
    {exhibition.poster && <ImageComponent className={styles.poster}
      id={exhibition.poster.id} kind="poster" alt={`${exhibition.title} 포스터`} />}
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
    {!picker && <div className={styles.toolbar}>
      <button className={styles.icon} aria-label={muted ? "음소거 해제" : "음소거"} aria-pressed={muted} onClick={() => {
        mutedNow.current = !muted;
        setMuted(!muted);
        if (!muted) stopAudio();
        else unlockAudio();
      }}><Image src="/yeobek/visitor-toolbar-sound.svg" alt="" width={25} height={25} />{muted && <span aria-hidden="true">×</span>}</button>
      <span className={active ? styles.artworkTitle : styles.brand}>{active ? `${active.number}. ${active.title}` : brand.name}</span>
      <button className={styles.textButton} aria-expanded={picker !== null}
        onClick={() => transitionScreen(() => setPicker(picker ? null : "row"))}>{picker ? "닫기" : "작품 선택"}</button>
    </div>}
    {picker && <section className={`${styles.picker} ${picker === "grid" ? styles.fullPicker : ""}`} aria-label="작품 목록">
      <div className={styles.pickerHeading}><h2>{picker === "row"
        ? <button type="button" className={styles.pickerTitle} onClick={() => setPicker(null)} aria-label="작품 목록 닫기">작품 목록 <Image src="/yeobek/visitor-more.svg" alt="" width={15} height={15} /></button>
        : "작품 목록"}</h2>
        <button className={styles.textButton} onClick={() => transitionScreen(() => setPicker(picker === "grid" ? null : "grid"))}>
          {picker === "grid" ? "닫기" : "전체 보기"}
        </button></div>
      {picker === "grid" && <div className={styles.search}><input aria-label="작품 검색" type="search"
        placeholder="작품 검색" value={search} onChange={event => setSearch(event.target.value)} />
        <Image src="/yeobek/visitor-picker-search.svg" alt="" width={26} height={26} /></div>}

      {exhibition.artworks.length === 0 && <p>{emptyArtworkMessage}</p>}
      {picker === "grid" && exhibition.artworks.length > 0 && !shown.length && <p>검색 결과가 없어요.</p>}
      <ul className={picker === "grid" ? styles.grid : styles.strip}>
        {(picker === "grid" ? shown : exhibition.artworks).map(work => <li key={work.id}>
          <button className={styles.tile} aria-pressed={selected === work.id} onClick={() => { unlockAudio(); transitionScreen(() => select(work)); }}>
            <ArtImage key={work.image?.id ?? work.id} ImageComponent={ImageComponent} artwork={work} className={styles.thumbnail} decorative thumbnail grid={picker === "grid"} />
            <span className={picker === "grid" ? styles.visuallyHidden : styles.tileName} title={`${work.number}. ${work.title}`}>{work.number}. {work.title}</span>
          </button>
        </li>)}
      </ul>
    </section>}
    <div className={styles.transcript} ref={transcript} aria-live="polite" inert={picker === "grid"}>
      {!turns.length && !asking && <div className={styles.welcome}>
        <h1 className={styles.visuallyHidden}>{exhibition.title}</h1>
        <div className={styles.welcomeMark}><AiStarLogo state="idle" size={118} label="" /></div>
        <p>전시에서 느낀 감동과 기억이 오래도록 남을 수 있도록,<br />작품에 담긴 이야기를 들려드릴게요.</p>
      </div>}
      {/* One keyed list: the pending article becomes the answered turn in place, so the bubble never re-mounts. */}
      {[...turns.map(({ id, question, reply, artwork, reveal, isNarration }) => <article className={`${styles.turn} yeobek-appear`} key={id}>
        {!isNarration && <p className={styles.bubble}>{question}</p>}
        {reply.image === undefined && artwork?.image && <ArtImage ImageComponent={ImageComponent} key={artwork.image.id} artwork={artwork}
          className={`${styles.answerImage}${reveal ? ` ${styles.revealBlock}` : ""}`} />}
        {reply.image && <ImageComponent className={`${styles.answerImage}${reveal ? ` ${styles.revealBlock}` : ""}`}
          id={reply.image.id} kind="image" alt={artwork?.title ?? "작품 이미지"} />}
        {reveal ? <RevealLines className={styles.answer} text={reply.answer} /> : <p className={styles.answer}>{reply.answer}</p>}
        {reply.notice && <p>{reply.notice}</p>}
        {!muted && reply.canSpeak !== false && <button className={styles.textButton} disabled={busy !== null}
          onClick={() => { unlockAudio(); void run("speech", signal => play(reply.answerId, signal)); }}>답변 듣기</button>}
      </article>), ...(asking ? [<article className={`${styles.turn} yeobek-appear`} key={asking.id}>
        {!asking.isNarration && <p className={styles.bubble}>{asking.question}</p>}
        <AiStarLogo className={`${styles.thinking}${asking.leaving ? ` ${styles.thinkingDone}` : ""}`}
          state="thinking" size={64} label="" />
        <p className="sr-only" role="status">답변을 준비하고 있어요.</p>
      </article>] : [])]}
    </div>
    <div className={styles.composer} inert={picker === "grid"}>
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
