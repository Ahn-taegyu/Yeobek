"use client";

import { useState, type FormEvent } from "react";

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
      const response = await fetch("/api/auth/login", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: data.get("email"), password: data.get("password") }),
      });
      if (!response.ok) {
        setError(response.status === 429
          ? "요청이 많습니다. 잠시 기다린 후 다시 시도해 주세요."
          : response.status >= 500
            ? "서비스에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요."
            : "이메일과 비밀번호를 확인하고 다시 시도해 주세요.");
        return;
      }
      window.location.replace("/artist");
    } catch { setError("연결을 확인하고 다시 시도해 주세요."); }
    finally { setBusy(false); }
  }
  return <form method="post" onSubmit={submit} aria-busy={busy}>
    <label htmlFor="email">이메일</label>
    <input id="email" name="email" type="email" autoComplete="username" maxLength={254} required disabled={busy} />
    <label htmlFor="password">비밀번호</label>
    <div className="password-field">
      <input id="password" name="password" type={showPassword ? "text" : "password"} autoComplete="current-password" maxLength={1024} required disabled={busy} />
      <button type="button" className="secondary" aria-label="비밀번호 표시" aria-pressed={showPassword} onClick={() => setShowPassword(value => !value)} disabled={busy}>{showPassword ? "숨기기" : "표시"}</button>
    </div>
    <p className="error" role="alert">{error}</p>
    <button disabled={busy}>{busy ? "로그인 중…" : "로그인"}</button>
  </form>;
}
