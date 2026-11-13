"use client";

import { useEffect, useState } from "react";

type Profile = { displayName: string | null };
type Exhibition = { id: string; title: string; state: string };
type Home = { profile: Profile; exhibitions: Exhibition[] };
export function ArtistHome() {
  const [home, setHome] = useState<Home | null>(null);
  const [error, setError] = useState("");
  const [leaving, setLeaving] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        const responses = await Promise.all([
          fetch("/api/admin/profile", { signal: controller.signal, cache: "no-store" }),
          fetch("/api/admin/exhibitions", { signal: controller.signal, cache: "no-store" }),
        ]);
        if (responses.some(response => response.status === 401)) { window.location.replace("/login"); return; }
        const [profile, exhibitions] = await Promise.all(responses.map(response => response.json()));
        if (responses.some(response => !response.ok)) throw new Error(profile.error?.message || exhibitions.error?.message || "자료를 불러오지 못했습니다.");
        if (!controller.signal.aborted) setHome({ profile: profile.data, exhibitions: exhibitions.data.items });
      } catch (failure) {
        if (!controller.signal.aborted) setError(failure instanceof Error ? failure.message : "연결을 확인해 주세요.");
      }
    }
    void load();
    return () => controller.abort();
  }, []);
  async function logout() {
    setLeaving(true); setError("");
    try {
      const response = await fetch("/api/auth/logout", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: "{}",
      });
      if (!response.ok) throw new Error("로그아웃하지 못했습니다. 다시 시도해 주세요.");
      window.location.replace("/login");
    } catch (failure) { setError(failure instanceof Error ? failure.message : "연결을 확인해 주세요."); }
    finally { setLeaving(false); }
  }
  return <>
    <div className="row"><h1>{home?.profile.displayName || "나의 전시"}</h1>
      <button className="secondary" onClick={logout} disabled={leaving}>{leaving ? "로그아웃 중…" : "로그아웃"}</button>
    </div>
    <p className="error" role="alert">{error}</p>
    {!home && !error ? <p role="status">전시를 불러오고 있습니다…</p> : null}
    {home ? <section aria-label="전시 기록">
      <h2>전시 기록</h2>
      {home.exhibitions.length ? <ul className="exhibitions">{home.exhibitions.map(exhibition =>
        <li key={exhibition.id}><strong>{exhibition.title}</strong><span>{exhibition.state === "published" ? "공개 중" : exhibition.state === "paused" ? "공개 중지" : "준비 중"}</span></li>,
      )}</ul> : <p className="empty">아직 등록된 전시가 없습니다.</p>}
    </section> : null}
  </>;
}
