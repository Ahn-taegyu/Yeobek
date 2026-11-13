"use client";

import { useState, type FormEvent } from "react";

export function LoginForm() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
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
      const result = await response.json();
      if (!response.ok) { setError(result.error?.message || "로그인하지 못했습니다."); return; }
      window.location.replace("/artist");
    } catch { setError("연결을 확인하고 다시 시도해 주세요."); }
    finally { setBusy(false); }
  }
  return <form method="post" onSubmit={submit} aria-busy={busy}>
    <label htmlFor="email">이메일</label>
    <input id="email" name="email" type="email" autoComplete="username" maxLength={254} required disabled={busy} />
    <label htmlFor="password">비밀번호</label>
    <input id="password" name="password" type="password" autoComplete="current-password" maxLength={1024} required disabled={busy} />
    <p className="error" role="alert">{error}</p>
    <button disabled={busy}>{busy ? "로그인 중…" : "로그인"}</button>
  </form>;
}
