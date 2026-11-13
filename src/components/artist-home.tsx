"use client";

import { useEffect, useState } from "react";

import { ApiClientError, requestApi } from "@/lib/client";

type Home = {
  profile: Awaited<ReturnType<typeof requestApi<"getProfile">>>["data"];
  exhibitions: Awaited<ReturnType<typeof requestApi<"listExhibitions">>>["data"]["items"];
};
export function ArtistHome() {
  const [home, setHome] = useState<Home | null>(null);
  const [error, setError] = useState("");
  const [leaving, setLeaving] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        const [profile, exhibitions] = await Promise.allSettled([
          requestApi("getProfile", { signal: controller.signal }),
          requestApi("listExhibitions", { signal: controller.signal }),
        ]);
        if (controller.signal.aborted) return;
        if ([profile, exhibitions].some(result =>
          result.status === "rejected" && result.reason instanceof ApiClientError && result.reason.status === 401
        )) {
          window.location.replace("/login");
          return;
        }
        if (profile.status === "rejected" || exhibitions.status === "rejected") throw new Error();
        setHome({ profile: profile.value.data, exhibitions: exhibitions.value.data.items });
      } catch {
        if (!controller.signal.aborted) setError("자료를 불러오지 못했습니다. 다시 시도해 주세요.");
      }
    }
    void load();
    return () => controller.abort();
  }, []);
  async function logout() {
    setLeaving(true); setError("");
    try {
      await requestApi("logout", { body: {} });
      window.location.replace("/login");
    } catch { setError("로그아웃하지 못했습니다. 다시 시도해 주세요."); }
    finally { setLeaving(false); }
  }
  return <>
    <div className="row"><h1>{home?.profile.displayName || "나의 전시"}</h1>
      <button className="secondary" onClick={logout} disabled={leaving}>{leaving ? "로그아웃 중…" : "로그아웃"}</button>
    </div>
    <p className="error" role="alert">{error}</p>
    {home ? <>
      {home.profile.accountEmail ? <p>로그인 계정: {home.profile.accountEmail}</p> : null}
      {!home.profile.displayName ? <p>작가 정보가 아직 입력되지 않았습니다.</p> : null}
    </> : null}
    {!home && !error ? <p role="status">전시를 불러오고 있습니다…</p> : null}
    {home ? <section aria-label="전시 기록">
      <h2>전시 기록</h2>
      {home.exhibitions.length ? <ul className="exhibitions">{home.exhibitions.map(exhibition =>
        <li key={exhibition.id}><div><strong>{exhibition.title}</strong>
          <div className="exhibition-details">기간: {exhibition.startDate && exhibition.endDate ? `${exhibition.startDate} ~ ${exhibition.endDate}` : "미정"} · 장소: {exhibition.place || "미정"} · 작품 {exhibition.artworkCount}점</div>
        </div><span>{exhibition.state === "published" ? "공개 중" : exhibition.state === "paused" ? "공개 중지" : "준비 중"}</span></li>,
      )}</ul> : <p className="empty">아직 등록된 전시가 없습니다.</p>}
    </section> : null}
  </>;
}
