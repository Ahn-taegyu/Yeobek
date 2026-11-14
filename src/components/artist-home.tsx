"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { requestApi } from "@/lib/client";
import { countExhibitions } from "@/lib/contracts/responses";
import { errorMessage, Loading, loadProfile, PrivateImage, useArtistLoad } from "./artist/ui";

const tabs = [["all", "전체"], ["preparing", "준비중"], ["ongoing", "진행중"], ["ended", "종료"]] as const;
const statuses = { preparing: "준비중", ongoing: "진행 중", ended: "종료" } as const;

async function loadHome(signal: AbortSignal) {
  const [profile, exhibitions] = await Promise.all([loadProfile(signal), requestApi("listExhibitions", { signal })]);
  return { profile, ...exhibitions.data };
}

export function ArtistHome() {
  const result = useArtistLoad(loadHome);
  const [tab, setTab] = useState<typeof tabs[number][0]>("all");
  const [leaving, setLeaving] = useState(false);
  const [error, setError] = useState("");

  async function logout() {
    setLeaving(true);
    try {
      await requestApi("logout", { body: {} });
      window.location.replace("/login");
    } catch (error) {
      setError(errorMessage(error));
      setLeaving(false);
    }
  }

  if (!result.data) return <Loading {...result} />;
  const { profile, items, counts = countExhibitions(items) } = result.data;
  const visible = items.filter(item => tab === "all" || tab === (item.dashboardStatus ?? "preparing"));
  return <div className="artist-dashboard">
    <section className="artist-card" aria-label="작가 프로필">
      <div className="artist-profile">
        {profile.avatarMaterialId ? <PrivateImage key={profile.avatarMaterialId} className="artist-avatar" materialId={profile.avatarMaterialId} alt="" /> :
          <Image className="artist-avatar" src="/yeobek/artist-avatar.png" width={82} height={82} alt="" loading="eager" />}
        <div>
          <h2>{profile.displayName ? `${profile.displayName} 작가` : "작가 프로필"}</h2>
          {profile.keywords?.fields.length ? <p>{profile.keywords.fields.join(" · ")}</p> : null}
          <Link href="/artist/onboarding">{profile.onboardingComplete ? "프로필 수정" : "기본 정보 입력"}</Link>
        </div>
      </div>
      <dl className="artist-counts">
        <div><dd>{counts.all}</dd><dt>전체 전시</dt></div>
        <div><dd>{counts.ongoing}</dd><dt>진행 중</dt></div>
        <div><dd>{counts.ended}</dd><dt>종료</dt></div>
      </dl>
      <div className="artist-actions">
        <Link className="artist-action" href="/artist/world">나의 작품 세계</Link>
        <Link className="artist-action" href="/artist/exhibitions/new">새 전시 등록하기</Link>
      </div>
    </section>
    <section className="artist-card">
      <h2>MY 전시</h2>
      <div className="artist-chips" aria-label="전시 상태">
        {tabs.map(([value, label]) => <button key={value} className="artist-chip" aria-pressed={tab === value} onClick={() => setTab(value)}>
          {label} {counts[value]}
        </button>)}
      </div>
      {visible.length ? <ul className="artist-gallery">{visible.map(exhibition => <li key={exhibition.id}>
        <Link href={`/artist/exhibitions/${exhibition.id}`}>
          {exhibition.posterMaterialId ? <PrivateImage materialId={exhibition.posterMaterialId} alt="" className="artist-placeholder" /> :
            <span className="artist-placeholder" aria-hidden="true" />}
          <strong>{exhibition.draftTitle || exhibition.title || "제목 없는 전시"}</strong>
          {(exhibition.startDate || exhibition.endDate) && <small>{[exhibition.startDate, exhibition.endDate].filter(Boolean).join(" – ")}</small>}
          <small>{statuses[exhibition.dashboardStatus ?? "preparing"]}</small>
        </Link>
      </li>)}</ul> : <p>표시할 전시가 없어요.</p>}
    </section>
    {error && <p role="alert" className="error">{error}</p>}
    <button className="artist-action secondary" disabled={leaving} onClick={() => void logout()}>로그아웃</button>
  </div>;
}
