"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { AiStarLogo } from "@/components/ui/ai-star/ai-star-logo";
import { brand } from "@/components/ui/brand";
import { useRecording } from "@/components/visitor/use-recording";
import visitor from "@/components/visitor/visitor.module.css";
import { ApiClientError, requestApi } from "@/lib/client";
import { exhibitionInterviewMaxAnswer, type ExhibitionInterview } from "@/lib/contracts/exhibition-interview";
import { errorMessage, Loading, useArtistLoad } from "./ui";
import styles from "./exhibition-interview.module.css";

const root = (id: string) => `/artist/exhibitions/${id}`;

/** Read questions aloud with the device's own speech engine when sound is on (no server cost). */
function speak(text: string) {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = "ko-KR";
  window.speechSynthesis.speak(utterance);
}

/**
 * Figma 114/115. One chat interview per exhibition: 10 questions are prepared first, 5 answers are required,
 * then the artist chooses to continue (the next 5 are prepared ahead) or to move on to review.
 */
export function ExhibitionInterviewChat({ id, voice }: { id: string; voice: boolean }) {
  const router = useRouter();
  const initial = useArtistLoad(useCallback(async (signal: AbortSignal) =>
    (await requestApi("getExhibitionInterview", { params: { id }, signal })).data, [id]));
  const [updated, setData] = useState<ExhibitionInterview>();
  const data = updated ?? initial.data;
  const [error, setError] = useState("");
  const [started, setStarted] = useState(false);
  const [busy, setBusy] = useState<"generate" | "answer" | "transcribe" | null>(null);
  const [draft, setDraft] = useState("");
  const [continuedAt, setContinuedAt] = useState<number>();
  const [muted, setMuted] = useState(false);
  const log = useRef<HTMLDivElement>(null);
  const generation = useRef<string | null>(null);
  const spoken = useRef<string | null>(null);

  async function load() {
    try { setData((await requestApi("getExhibitionInterview", { params: { id } })).data); }
    catch (cause) { setError(errorMessage(cause)); }
  }

  const questions = data?.questions ?? [];
  const done = questions.filter(item => item.status !== "pending");
  const current = questions.find(item => item.status === "pending");
  const pending = questions.length - done.length;
  const required = data?.requiredCount ?? 5;
  const batch = data?.batchSize ?? 5;
  const checkpoint = done.length >= required && (done.length - required) % batch === 0 && continuedAt !== done.length;
  const intro = done.length === 0 && !started;

  async function generate() {
    if (generation.current) return;
    generation.current = crypto.randomUUID();
    setBusy(current => current ?? "generate");
    try {
      const { data: result } = await requestApi("generateExhibitionInterview",
        { params: { id }, body: { requestId: generation.current } });
      setData(result.interview);
      if (result.job.status !== "succeeded") setError("질문을 준비하지 못했어요. 잠시 후 다시 시도해주세요.");
    } catch (cause) {
      // A prepared batch already ahead of the artist is not an error for the conversation.
      if (!(cause instanceof ApiClientError && cause.code === "JOB_ATTEMPT_CONFLICT")) setError(errorMessage(cause));
      await load();
    } finally {
      generation.current = null;
      setBusy(current => current === "generate" ? null : current);
    }
  }

  function start() {
    setStarted(true);
    setError("");
    if (!questions.length) void generate();
  }

  function continueInterview() {
    setContinuedAt(done.length);
    setError("");
    // Keep the next batch ready while the artist answers this one.
    if (pending <= batch) void generate();
  }

  async function answer(text: string) {
    if (!current || busy === "answer") return;
    setBusy("answer");
    setError("");
    try {
      const { data: next } = await requestApi("answerExhibitionInterview", { params: { id, questionId: current.id },
        body: { action: "save", expectedVersion: current.version, answer: text } });
      setData(next);
      setDraft("");
    } catch (cause) { setError(errorMessage(cause)); await load(); }
    finally { setBusy(null); }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = draft.trim();
    if (text && text.length <= exhibitionInterviewMaxAnswer) void answer(text);
  }

  const recording = useRecording(file => {
    setBusy("transcribe");
    void requestApi("transcribePreview", { params: { id }, body: { requestId: crypto.randomUUID(), exhibitionId: id, file } })
      .then(({ data: result }) => setDraft(result.transcript))
      .catch(cause => setError(cause instanceof ApiClientError && cause.status === 404
        ? "음성 입력을 사용할 수 없어요. 글로 답해주세요." : errorMessage(cause)))
      .finally(() => setBusy(null));
  }, setError);

  const visible = !intro && !checkpoint ? current : undefined;
  useEffect(() => {
    if (visible && !muted && spoken.current !== visible.id) { spoken.current = visible.id; speak(visible.question); }
  }, [visible, muted]);
  useEffect(() => { log.current?.scrollTo({ top: log.current.scrollHeight }); }, [done.length, visible, checkpoint]);
  useEffect(() => () => { if (typeof window !== "undefined") window.speechSynthesis?.cancel(); }, []);

  return <section data-visitor className={visitor.chat}>
    <div className={`${visitor.toolbar} ${styles.toolbar}`}>
      <button className={visitor.icon} aria-label={muted ? "질문 읽어주기 켜기" : "질문 읽어주기 끄기"} aria-pressed={!muted}
        onClick={() => { if (!muted) window.speechSynthesis?.cancel(); setMuted(!muted); }}>
        <Image src="/yeobek/visitor-toolbar-sound.svg" alt="" width={25} height={25} />{muted && <span aria-hidden="true">×</span>}
      </button>
      <h1 className={visitor.brand}>{brand.name}</h1>
      <span />
    </div>
    {!data ? <div className={styles.intro}><Loading {...initial} /></div>
      : intro ? <>
        <div className={styles.intro}>
          <AiStarLogo state="idle" size={155} label="" />
          <p>{"지금부터 인터뷰를 시작할게요\n먼저 5개의 질문을 통해 작가님의 이야기를 들려주세요\n인터뷰가 끝난 후에도 원하신다면\n이야기를 더 나눌 수 있어요"}</p>
          {error && <p role="alert">{error}</p>}
        </div>
        <button className={styles.start} onClick={start}>인터뷰 시작하기</button>
      </> : <>
        <div className={`${visitor.transcript} ${styles.log}`} ref={log} aria-live="polite">
          {done.map(item => <article key={item.id} className="yeobek-appear">
            <p className={styles.question}>{`${item.seq}. ${item.question}`}</p>
            {item.answer ? <p className={styles.answer}>{item.answer}</p> : <p className={styles.status}>건너뛴 질문이에요.</p>}
          </article>)}
          {visible && <article key={visible.id} className="yeobek-appear"><p className={styles.question}>{`${visible.seq}. ${visible.question}`}</p></article>}
          {!checkpoint && !visible && (busy === "generate" || data.generating) &&
            <AiStarLogo className={styles.thinking} state="thinking" size={64} label="다음 질문을 준비하고 있어요" />}
          {!checkpoint && !visible && busy !== "generate" && !data.generating && !error &&
            <p className={styles.status}>더 준비된 질문이 없어요. 내용을 검토해 주세요.</p>}
          {checkpoint && <div className={styles.choice}>
            <p>추가 인터뷰를 진행할까요?</p>
            <div>
              <button className={styles.more} onClick={continueInterview}>추가 인터뷰 진행하기</button>
              <button className={styles.review} onClick={() => router.push(`${root(id)}/verification`)}>내용 검토하기</button>
            </div>
          </div>}
        </div>
        <div className={visitor.composer}>
          {error && <p role="alert">{error}</p>}
          {busy === "transcribe" && <p role="status">음성을 글로 바꾸고 있어요.</p>}
          <form onSubmit={submit}>
            <input aria-label="답변" placeholder="작가님의 이야기를 들려주세요" value={draft} maxLength={exhibitionInterviewMaxAnswer}
              onChange={event => setDraft(event.target.value)} disabled={!visible || busy === "answer" || busy === "transcribe"} />
            {(voice ? Boolean(draft.trim()) : true) && <button className={voice ? visitor.send : visitor.mic} type="submit"
              disabled={!visible || Boolean(busy) || !draft.trim()} aria-label="답변 보내기">
              {voice ? "보내기" : <Image src="/yeobek/visitor-wave.svg" alt="" width={24} height={24} />}
            </button>}
            {voice && <button className={visitor.mic} type="button" disabled={!visible || Boolean(busy) || recording.state === "requesting"}
              aria-label={recording.state === "recording" ? "녹음 종료" : "음성으로 답하기"}
              onClick={() => { if (recording.state === "recording") recording.stop(); else { setError(""); void recording.start(); } }}>
              {recording.state === "recording" ? "■" : <Image src="/yeobek/visitor-wave.svg" alt="" width={24} height={24} />}
            </button>}
          </form>
        </div>
      </>}
  </section>;
}
