"use client";

import Image from "next/image";
import styles from "./artist/artist-figma.module.css";
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
  return <ArtistDashboard data={result.data} onLogout={logout} leaving={leaving} error={error} />;
}

export function ArtistDashboard({ data, preview = false, previewPosters, onLogout, leaving = false, error }: {
  data: Awaited<ReturnType<typeof loadHome>>;
  preview?: boolean;
  previewPosters?: Readonly<Record<string, string>>;
  onLogout?: () => Promise<void>;
  leaving?: boolean;
  error?: string;
}) {
  const [tab, setTab] = useState<typeof tabs[number][0]>("all");
  const { profile, items, counts = countExhibitions(items) } = data;
  const visible = items.filter(item => tab === "all" || tab === (item.dashboardStatus ?? "preparing"));
  const firstExhibition = visible[0]?.id;

  useEffect(() => {
    if (preview || !firstExhibition || typeof window.requestIdleCallback !== "function") return;
    const warm = window.requestIdleCallback(() => { void prepareExhibition(firstExhibition).catch(() => {}); });
    return () => window.cancelIdleCallback(warm);
  }, [firstExhibition, preview]);
  return <div className="artist-dashboard">
    <div className={styles.wordmark}>Yeobek</div>
    <section className="artist-card" aria-label="작가 프로필">
      <div className="artist-profile">
        {profile.avatarMaterialId ? <PrivateImage key={profile.avatarMaterialId} className="artist-avatar" materialId={profile.avatarMaterialId} alt="" /> :
          <Image className="artist-avatar" src="/yeobek/artist-confirmed/home-avatar.svg" width={67} height={67} alt="" loading="eager" />}
        <div>
          <h2>{profile.displayName ? `${profile.displayName} 작가` : "작가 프로필"}</h2>
          {profile.keywords?.fields.length ? <p>{profile.keywords.fields.join(" · ")}</p> : null}
        </div>
        <ArtistLink className={styles.profileLink} href={preview ? "/dev/artist-preview/history" : "/artist/onboarding"} prepare={preview ? undefined : prepareProfile}
          aria-label={profile.onboardingComplete ? "프로필 수정" : "기본 정보 입력"}>
          <Image src="/yeobek/artist-confirmed/forward.svg" width={22} height={22} alt="" />
        </ArtistLink>
      </div>
      <dl className="artist-counts">
        <div><dd>{String(counts.all).padStart(2, "0")}</dd><dt>전체 전시</dt></div>
        <div><dd>{String(counts.ongoing).padStart(2, "0")}</dd><dt>진행 중</dt></div>
        <div><dd>{String(counts.ended).padStart(2, "0")}</dd><dt>종료</dt></div>
      </dl>
      <div className="artist-actions">
        <ArtistLink className="artist-action" href={preview ? "/dev/artist-preview/world" : "/artist/world"} prepare={preview ? undefined : prepareProfile}>나의 작품 세계</ArtistLink>
        {preview ? <button className="artist-action" disabled>새 전시 등록하기</button> :
          <ArtistLink className="artist-action" href="/artist/exhibitions/new">새 전시 등록하기</ArtistLink>}
      </div>
    </section>
    <section className={styles.exhibitions}>
      <h2>MY 전시</h2>
      <div className="artist-chips" aria-label="전시 상태">
        {tabs.map(([value, label]) => <button key={value} className="artist-chip" aria-pressed={tab === value} onClick={() => setTab(value)}>
          {label}
        </button>)}
      </div>
      {visible.length ? <ul className="artist-gallery">{visible.map(exhibition => {
        const poster = previewPosters?.[exhibition.id];
        const card = <>
          {poster ? <Image src={poster} alt="" width={155} height={190} className="artist-placeholder" /> :
            exhibition.posterMaterialId ? <PrivateImage materialId={exhibition.posterMaterialId} alt="" className="artist-placeholder" /> :
            <span className="artist-placeholder" aria-hidden="true" />}
          <div className={styles.exhibitionDetails}>
          <strong>{exhibition.draftTitle || exhibition.title || "제목 없는 전시"}</strong>
          {(exhibition.startDate || exhibition.endDate) && <small>{[exhibition.startDate, exhibition.endDate].filter(Boolean).map(date => date?.replaceAll("-", ".")).join(" - ")}</small>}
          <small className={styles.status} data-status={exhibition.dashboardStatus ?? "preparing"}>{statuses[exhibition.dashboardStatus ?? "preparing"]}</small>
          </div>
        </>;
        return <li key={exhibition.id}>{preview ? card :
          <ArtistLink href={`/artist/exhibitions/${exhibition.id}`} prepare={() => prepareExhibition(exhibition.id)}>{card}</ArtistLink>}
        </li>;
      })}</ul> : <p>표시할 전시가 없어요.</p>}
    </section>
    {error && <p role="alert" className="error">{error}</p>}
    <button className="artist-action secondary" disabled={leaving || preview} onClick={onLogout}>로그아웃</button>
  </div>;
}
