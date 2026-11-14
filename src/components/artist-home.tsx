"use client";

import Image from "next/image";
import { brand } from "@/components/ui/brand";
import { useEffect, useState } from "react";
import { requestApi } from "@/lib/client";
import { forgetArtistPage, loadArtistPage } from "@/lib/client/artist-navigation";
import { countExhibitions } from "@/lib/contracts/responses";
import { ArtistLink, errorMessage, Loading, PrivateImage, useArtistLoad } from "./artist/ui";
import { homeKey, loadHome, loadProfile, prepareExhibition, profileKey } from "./artist/navigation-data";

const tabs = [["all", "전체"], ["preparing", "준비중"], ["ongoing", "진행중"], ["ended", "종료"]] as const;
const statuses = { preparing: "준비중", ongoing: "진행 중", ended: "종료" } as const;

const prepareProfile = () => loadArtistPage(profileKey, loadProfile);
const refreshProfile = () => forgetArtistPage(profileKey);

export function ArtistHome() {
  const result = useArtistLoad(loadHome, homeKey, refreshProfile);
  const [tab, setTab] = useState<typeof tabs[number][0]>("all");
  const [leaving, setLeaving] = useState(false);
  const [error, setError] = useState("");
  const firstExhibition = result.data?.items.find(item => tab === "all" || tab === (item.dashboardStatus ?? "preparing"))?.id;

  useEffect(() => {
    if (!firstExhibition || typeof window.requestIdleCallback !== "function") return;
    const warm = window.requestIdleCallback(() => { void prepareExhibition(firstExhibition).catch(() => {}); });
    return () => window.cancelIdleCallback(warm);
  }, [firstExhibition]);

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
          <Image className="artist-avatar" src={brand.artistAvatar} width={82} height={82} alt="" loading="eager" />}
        <div>
          <h2>{profile.displayName ? `${profile.displayName} 작가` : "작가 프로필"}</h2>
          {profile.keywords?.fields.length ? <p>{profile.keywords.fields.join(" · ")}</p> : null}
          <ArtistLink href="/artist/onboarding" prepare={prepareProfile}>{profile.onboardingComplete ? "프로필 수정" : "기본 정보 입력"}</ArtistLink>
        </div>
      </div>
      <dl className="artist-counts">
        <div><dd>{counts.all}</dd><dt>전체 전시</dt></div>
        <div><dd>{counts.ongoing}</dd><dt>진행 중</dt></div>
        <div><dd>{counts.ended}</dd><dt>종료</dt></div>
      </dl>
      <div className="artist-actions">
        <ArtistLink className="artist-action" href="/artist/world" prepare={prepareProfile}>나의 작품 세계</ArtistLink>
        <ArtistLink className="artist-action" href="/artist/exhibitions/new">새 전시 등록하기</ArtistLink>
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
        <ArtistLink href={`/artist/exhibitions/${exhibition.id}`} prepare={() => prepareExhibition(exhibition.id)}>
          {exhibition.posterMaterialId ? <PrivateImage materialId={exhibition.posterMaterialId} alt="" className="artist-placeholder" /> :
            <span className="artist-placeholder" aria-hidden="true" />}
          <strong>{exhibition.draftTitle || exhibition.title || "제목 없는 전시"}</strong>
          {(exhibition.startDate || exhibition.endDate) && <small>{[exhibition.startDate, exhibition.endDate].filter(Boolean).join(" – ")}</small>}
          <small>{statuses[exhibition.dashboardStatus ?? "preparing"]}</small>
        </ArtistLink>
      </li>)}</ul> : <p>표시할 전시가 없어요.</p>}
    </section>
    {error && <p role="alert" className="error">{error}</p>}
    <button className="artist-action secondary" disabled={leaving} onClick={() => void logout()}>로그아웃</button>
  </div>;
}
