"use client";

import Link from "next/link";
import { transitionScreen } from "@/components/ui/motion";
import { AiStarLogo } from "@/components/ui/ai-star/ai-star-logo";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { requestApi } from "@/lib/client";
import { sectionDefinitions } from "@/lib/contracts/knowledge-sections";
import { onboardingKeywordOptions } from "@/lib/contracts/onboarding";
import { errorMessage, Field, Header, Loading, PrivateImage, Questions, sectionsFrom, Steps, useArtistLoad } from "./ui";
import { loadProfile, profileKey } from "./navigation-data";

import styles from "./artist-figma.module.css";
import { uploadMaterial } from "./upload";

type Profile = Awaited<ReturnType<typeof loadProfile>>;
type Keywords = NonNullable<Profile["keywords"]>;

const history = sectionDefinitions.artist.filter(section => section.group === "artist_history");
const world = sectionDefinitions.artist.filter(section => section.group === "artist");
const historyExamples = {
  artist_education: "ex) 홍익대학교 회화과 졸업",
  artist_exhibitions: "ex) 2025 개인전 <기억의 조각>\n2024 단체전 <서로의 시선>",
  artist_awards: "ex) 연도, 수상명, 기관",
  artist_activities: "ex) 레지던시 참여, 아트페어, 워크숍 등",
  artist_other_history: "추가로 소개하고 싶은 활동을 입력해 주세요",
};
const worldExamples = {
  artist_motivation: "ex. 대학 시절 일상의 풍경을 기록하다가 그 장면들을 그림으로 남기고 싶어졌어요.",
  artist_interests: "ex. 도시 속에서 사라지는 작은 공간과 그곳에 남은 사람들의 흔적에 관심이 많아요.",
  artist_philosophy: "ex. 꾸미지 않은 솔직함이에요. 보기 좋게 만들기보다 제가 느낀 그대로 남기려고 해요.",
  artist_methods: "ex. 캔버스에 아크릴과 오일 파스텔을 겹쳐서 쓰고, 표면을 긁어내는 기법도 써요.",
  artist_method_reason: "ex. 여러 겹을 쌓고 긁어내면 시간이 지나며 흔적이 남는 느낌을 낼 수 있어서예요.",
  artist_inspiration: "ex. 출퇴근길 풍경과 오래된 동네를 걷다가 마주친 간판, 빛, 소리에서 많이 얻어요.",
  artist_audience: "ex. 자신이 지나쳤던 평범한 장소를 떠올리고, 그곳에 담긴 기억을 한 번 되돌아보면 좋겠어요.",
};
const backIcon = "/yeobek/artist-confirmed/back.svg";
const groups = [
  ["fields", "주로 어떤 분야에서 활동하시나요?"],
  ["moods", "작가님의 작품은 어떤 분위기인가요?"],
  ["topics", "작품에서 주로 어떤 이야기를 다루시나요?"],
] as const;

export function Onboarding() {
  const result = useArtistLoad(loadProfile, profileKey);
  if (!result.data) return <><Header title="기본 정보" /><Loading {...result} /></>;
  return <OnboardingSteps initial={result.data} />;
}

export function OnboardingSteps({ initial, previewStep }: { initial: Profile; previewStep?: 2 | 3 }) {
  const [profile, setProfile] = useState(initial);
  const [step, setStep] = useState<number>(previewStep ?? 1);
  const [keywords, setKeywords] = useState<Keywords>(initial.keywords ?? { fields: [], moods: [], topics: [] });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  async function next(form?: FormData) {
    if (busy || previewStep) return;
    setBusy(true);
    setError("");
    try {
      if (step === 2 && form) {
        const { data } = await requestApi("updateKnowledge", {
          params: { id: profile.document.id },
          body: { expectedRevision: profile.document.revision, ...sectionsFrom(form, history, profile.document) },
        });
        const latest = await loadProfile(new AbortController().signal);
        setProfile({ ...latest, document: data });
      } else if (step !== 2) {
        const { data } = await requestApi("updateOnboarding", { body: {
          expectedRevision: profile.revision, complete: step === 3, keywords: form ? keywords :
            profile.keywords ?? { fields: [], moods: [], topics: [] },
          fullName: step === 1 ? String(form?.get("fullName") ?? "").trim() || null : profile.fullName ?? null,
          displayName: step === 1 ? String(form?.get("displayName") ?? "").trim() || null : profile.displayName,
        } });
        setProfile({ ...data, accountEmail: profile.accountEmail });
      }
      if (step === 3) router.replace("/artist");
      else transitionScreen(() => setStep(step + 1));
    } catch (error) {
      setError(errorMessage(error));
    } finally { setBusy(false); }
  }

  async function uploadAvatar(file: File) {
    if (busy || previewStep) return;
    setBusy(true);
    setError("");
    try {
      const material = await uploadMaterial(file, "artist", profile.id, "image");
      const { data } = await requestApi("setArtistAvatar", {
        body: { expectedRevision: profile.revision, materialId: material.id },
      });
      setProfile({ ...data, accountEmail: profile.accountEmail });
    } catch (error) {
      setError(error instanceof Error && error.constructor === Error ? error.message : errorMessage(error));
    } finally { setBusy(false); }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void next(new FormData(event.currentTarget));
  }

  return <>
    <Header backIcon={backIcon} title={["기본 정보", "활동 이력", "나의 작업 키워드"][step - 1]}
      back={previewStep ? `/dev/artist-preview/${previewStep === 2 ? "signup" : "history"}` : undefined} />
    <form className={step === 2 ? styles.history : step === 3 ? styles.keywords : undefined} key={step} method="post" onSubmit={submit} aria-busy={busy}>
      {step === 1 && <>
        {profile.avatarMaterialId ? <PrivateImage key={profile.avatarMaterialId} className="artist-avatar artist-avatar-large"
          materialId={profile.avatarMaterialId} alt="프로필 사진" /> :
          <div className="artist-onboarding-star"><AiStarLogo state="idle" size={136} label="" /></div>}
        <Field label="프로필 사진"><input type="file" accept="image/jpeg,image/png,image/webp" disabled={busy}
          onChange={event => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (file) void uploadAvatar(file);
          }} /></Field>
        <Field label="이름*"><input name="fullName" autoComplete="name" maxLength={100} required defaultValue={profile.fullName ?? ""} placeholder="이름을 입력해주세요" /></Field>
        <Field label="작가명 (활동명)*"><input name="displayName" maxLength={100} required defaultValue={profile.displayName ?? ""} placeholder="활동명이 없다면 본명을 입력해주세요" /></Field>
        <p className="artist-note">입력한 이름은 서비스 내 닉네임과 전시 작가명으로 사용됩니다.</p>
        <Field label="Email*"><input type="email" readOnly value={profile.accountEmail ?? ""} /></Field>
      </>}
      {step === 2 && <Questions definitions={history} document={profile.document} placeholders={historyExamples} short />}
      {step === 3 && groups.map(([group, legend]) => <fieldset key={group} className="artist-chips">
        <legend>{legend}</legend>
        {onboardingKeywordOptions[group].map(option => {
          const selected = (keywords[group] as readonly string[]).includes(option);
          return <button type="button" key={option} className="artist-chip" aria-pressed={selected} onClick={() => {
            setKeywords(current => ({
              ...current, [group]: selected ? current[group].filter(value => value !== option) : [...current[group], option],
            }));
          }}>{option}</button>;
        })}
      </fieldset>)}
      {step > 1 && <p className="artist-note">{previewStep ? "입력과 선택은 이 미리보기에서만 확인할 수 있어요." : "입력한 정보는 작가 프로필에 저장되며, 언제든 수정할 수 있어요."}</p>}
      {step === 1 && <Steps step={step} />}
      {error && <p role="alert" className="error">{error}</p>}
      {previewStep ? <div className="artist-actions">
        <Link className="artist-action secondary" href={previewStep === 2 ? "/dev/artist-preview/keywords" : "/dev/artist-preview/home"}>건너뛰기</Link>
        <Link className="artist-action" href={previewStep === 2 ? "/dev/artist-preview/keywords" : "/dev/artist-preview/home"}>
          {previewStep === 2 ? "다음" : "시작하기"}
        </Link>
      </div> : <div className="artist-actions">
        {step > 1 && <button type="button" className="artist-action secondary" disabled={busy} onClick={() => void next()}>건너뛰기</button>}
        <button className="artist-action" disabled={busy}>{busy ? "저장 중…" : step === 3 ? "시작하기" : "다음"}</button>
      </div>}
    </form>
  </>;
}

export function ArtistWorld() {
  const result = useArtistLoad(loadProfile, profileKey);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!result.data || busy) return;
    const { document } = result.data;
    const body = sectionsFrom(new FormData(event.currentTarget), world, document);
    setBusy(true);
    setError("");
    try {
      await requestApi("updateKnowledge", { params: { id: document.id }, body: { ...body, expectedRevision: document.revision } });
      router.push("/artist");
    } catch (error) {
      setError(errorMessage(error));
    } finally { setBusy(false); }
  }

  if (!result.data) return <><Header title="나의 작품 세계" /><Loading {...result} /></>;
  return <ArtistWorldForm document={result.data.document} onSubmit={submit} error={error} busy={busy} />;
}

export function ArtistWorldForm({ document, onSubmit, error, busy = false }: {
  document: Profile["document"];
  onSubmit?: (event: FormEvent<HTMLFormElement>) => void;
  error?: string;
  busy?: boolean;
}) {
  return <>
    <Header title="나의 작품 세계" backIcon={backIcon} back={onSubmit ? undefined : "/dev/artist-preview/home"} />
    <form className={styles.world} method="post" onSubmit={onSubmit ?? (event => event.preventDefault())} aria-busy={busy}>
      <Questions definitions={world} document={document} placeholders={worldExamples} />
      {error && <p role="alert" className="error">{error}</p>}
      <button className="artist-action" disabled={busy || !onSubmit}>{busy ? "저장 중…" : "저장하기"}</button>
    </form>
  </>;
}
