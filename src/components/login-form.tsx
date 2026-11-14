"use client";

import Link from "next/link";
import styles from "@/app/login/login.module.css";
import { useState, type FormEvent } from "react";
import { ApiClientError, requestApi } from "@/lib/client";

export function LoginForm() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const data = new FormData(event.currentTarget);
    setBusy(true); setError("");
    try {
      await requestApi("login", {
        body: { email: String(data.get("email") ?? ""), password: String(data.get("password") ?? "") },
      });
      window.location.replace("/artist");
    } catch (error) {
      const status = error instanceof ApiClientError ? error.status : null;
      if (status === null || status < 400) setError("연결을 확인하고 다시 시도해 주세요.");
      else if (status === 429) setError("요청이 많습니다. 잠시 기다린 후 다시 시도해 주세요.");
      else if (status >= 500) setError("서비스에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.");
      else setError("이메일과 비밀번호를 확인하고 다시 시도해 주세요.");
    }
    finally { setBusy(false); }
  }
  return <form className={styles.loginForm} method="post" onSubmit={submit} aria-busy={busy}>
    <div className={styles.loginField}>
      <svg className={styles.fieldIcon} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M3 3h18a3 3 0 0 1 3 3v12a3 3 0 0 1-3 3H3a3 3 0 0 1-3-3V6a3 3 0 0 1 3-3Zm0 4 9 6 9-6V5l-9 6-9-6v2Z" />
      </svg>
      <input id="email" name="email" type="email" aria-label="이메일" placeholder="Email" autoComplete="username"
        maxLength={254} required disabled={busy} />
    </div>
    <div className={styles.loginField}>
      <svg className={styles.fieldIcon} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M6 9V6a6 6 0 1 1 12 0v3h1a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V11a2 2 0 0 1 2-2h1Zm2 0h8V6a4 4 0 0 0-8 0v3Zm4 5a2 2 0 1 0 0 4 2 2 0 0 0 0-4Z" />
      </svg>
      <input id="password" name="password" type={showPassword ? "text" : "password"} aria-label="비밀번호"
        placeholder="Password" autoComplete="current-password" maxLength={1024} required disabled={busy} />
      <button type="button" className={styles.passwordToggle} aria-label={showPassword ? "비밀번호 숨기기" : "비밀번호 표시"}
        aria-controls="password" onClick={() => setShowPassword(value => !value)} disabled={busy}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z" />
          <circle cx="12" cy="12" r="2.5" />
          {!showPassword && <><path d="M4 3l16 18" stroke="#fdfdfd" strokeWidth="4" /><path d="M4 3l16 18" /></>}
        </svg>
      </button>
    </div>
    <div className={styles.authLinks}><Link href="/signup">회원가입</Link></div>
    {error && <p className="error" role="alert">{error}</p>}
    <button className={styles.primary} disabled={busy}>{busy ? "로그인 중…" : "로그인"}</button>
  </form>;
}