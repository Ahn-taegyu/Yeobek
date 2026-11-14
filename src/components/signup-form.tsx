"use client";

import Image from "next/image";
import Link from "next/link";
import styles from "@/app/login/login.module.css";
import { useRef, useState, type FormEvent } from "react";
import { ApiClientError, requestApi } from "@/lib/client";
import { signupSchema } from "@/lib/contracts/signup";
import { transitionScreen } from "@/components/ui/motion";
import type { z } from "zod";

type PendingSignup = { email: string; signupRequestId: string };
const storageKey = "yeobek-pending-signup";

function restoreSignup(): PendingSignup | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(storageKey);
    if (!raw) return null;
    const value = JSON.parse(raw);
    return typeof value.email === "string" && typeof value.signupRequestId === "string" ? value : null;
  } catch {
    return null;
  }
}

export function SignupForm({ preview = false }: { preview?: boolean }) {
  const [pending, setPending] = useState<PendingSignup | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [verified, setVerified] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const previousRequest = useRef<z.output<typeof signupSchema> | null>(null);

  async function perform(action: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await action();
    } catch (error) {
      setError(error instanceof ApiClientError
        ? error.status === 404 ? "현재 이메일 가입을 사용할 수 없어요." : error.message
        : "요청을 완료하지 못했어요. 다시 시도해주세요.");
    } finally {
      setBusy(false);
    }
  }

  function signup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (preview) return;
    const form = event.currentTarget;
    const fields = new FormData(form);
    const email = String(fields.get("email") ?? "").trim().toLowerCase();
    const password = String(fields.get("password") ?? "");
    const passwordConfirmation = String(fields.get("passwordConfirmation") ?? "");
    const profile = {
      fullName: String(fields.get("fullName") ?? "").trim(),
      displayName: String(fields.get("displayName") ?? "").trim(),
    };
    if (!confirming) {
      const parsed = signupSchema.safeParse({ email, password, passwordConfirmation: password, requestId: crypto.randomUUID(), profile });
      if (!parsed.success) {
        setError(parsed.error.issues[0].message);
        return;
      }
      setError("");
      setConfirming(true);
      return;
    }

    const previous = previousRequest.current;
    const requestId = previous?.email === email && previous.password === password &&
      previous.passwordConfirmation === passwordConfirmation && previous.profile?.fullName === profile.fullName &&
      previous.profile.displayName === profile.displayName ? previous.requestId : crypto.randomUUID();
    const parsed = signupSchema.safeParse({ email, password, passwordConfirmation, requestId, profile });
    if (!parsed.success) {
      setError(parsed.error.issues[0].message);
      return;
    }
    previousRequest.current = parsed.data;
    void perform(async () => {
      await requestApi("signup", { body: parsed.data });
      const next = { email: parsed.data.email, signupRequestId: requestId };
      try { sessionStorage.setItem(storageKey, JSON.stringify(next)); } catch { /* The form still works in this page. */ }
      previousRequest.current = null;
      form.reset();
      transitionScreen(() => setPending(next));
    });
  }

  function verify(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!pending) return;
    const code = String(new FormData(event.currentTarget).get("code") ?? "");
    void perform(async () => {
      await requestApi("verifySignup", { body: { ...pending, code, requestId: crypto.randomUUID() } });
      try { sessionStorage.removeItem(storageKey); } catch { /* Storage may be disabled. */ }
      transitionScreen(() => setVerified(true));
    });
  }

  function resend() {
    if (!pending) return;
    void perform(async () => {
      await requestApi("resendSignup", { body: { ...pending, requestId: crypto.randomUUID() } });
      setNotice("인증 코드를 요청했어요. 받은편지함과 스팸함을 확인해주세요.");
    });
  }

  function restore() {
    const saved = restoreSignup();
    if (saved) { transitionScreen(() => setPending(saved)); setError(""); }
    else setError("이 탭에 이어서 진행할 가입 요청이 없어요.");
  }

  if (verified) return <div className={styles.feedback}>
    <p role="status">이메일 인증이 완료됐어요. 가입한 이메일과 비밀번호로 로그인해주세요.</p>
    <Link className="button" href="/login">로그인</Link>
  </div>;

  return <>
    {pending ? <form className={styles.feedback} method="post" onSubmit={verify} aria-busy={busy}>
      <p>{pending.email}의 받은편지함에서 인증 코드 6자리를 확인해주세요.</p>
      <label htmlFor="signup-code">인증 코드</label>
      <input id="signup-code" name="code" type="text" inputMode="numeric" autoComplete="one-time-code"
        pattern="[0-9]{6}" maxLength={6} required disabled={busy} />
      <button disabled={busy}>{busy ? "처리 중…" : "인증하기"}</button>
      <button type="button" className="secondary" disabled={busy} onClick={resend}>인증 코드 다시 받기</button>
    </form> : <form className={styles.signupForm} method="post" onSubmit={signup} aria-busy={busy}>
      <div className={styles.profileFields} hidden={confirming}>
        <div className={styles.avatar} aria-hidden="true">
          <Image src="/yeobek/artist-confirmed/signup-avatar-symbol.svg" width={58} height={56} alt="" />
        </div>
        <div className={styles.signupField}>
          <label htmlFor="signup-full-name">이름<span aria-hidden="true">*</span></label>
          <input id="signup-full-name" name="fullName" placeholder="이름을 입력해주세요"
            autoComplete="name" maxLength={100} required disabled={busy} />
        </div>
        <div className={styles.signupField}>
          <label htmlFor="signup-display-name">작가명 (활동명)<span aria-hidden="true">*</span></label>
          <input id="signup-display-name" name="displayName" placeholder="활동명이 없다면 본명을 입력해주세요"
            aria-describedby="signup-display-name-help" maxLength={100} required disabled={busy} />
          <small id="signup-display-name-help">입력한 이름은 서비스 내 닉네임과 전시 작가명으로 사용됩니다.</small>
        </div>
        <div className={styles.signupField}>
          <label htmlFor="signup-email">Email<span aria-hidden="true">*</span></label>
          <input id="signup-email" name="email" type="email" placeholder="abcd1234@gmail.com"
            autoComplete="email" maxLength={254} required disabled={busy} />
        </div>
        <div className={styles.signupField}>
          <label htmlFor="signup-password">비밀번호<span aria-hidden="true">*</span></label>
          <input id="signup-password" name="password" type="password" placeholder="************"
            autoComplete="new-password" required disabled={busy} />
        </div>
      </div>
      {confirming && <div className={styles.signupField + " " + styles.feedback}>
        <label htmlFor="signup-password-confirmation">비밀번호 확인</label>
        <input id="signup-password-confirmation" name="passwordConfirmation" type="password"
          autoComplete="new-password" required disabled={busy} />
      </div>}
      <button className={styles.primary} disabled={busy || preview}>
        {busy ? "처리 중…" : confirming ? "인증 코드 받기" : "다음"}
      </button>
      {confirming
        ? <button type="button" className={styles.resume} disabled={busy} onClick={() => { setError(""); setConfirming(false); }}>기본 정보 수정</button>
        : <button type="button" className={styles.resume} disabled={busy || preview} onClick={restore}>이메일 인증 이어서 하기</button>}
    </form>}
    {error && <p className="error" role="alert">{error}</p>}
    {notice && <p role="status">{notice}</p>}
  </>;
}
