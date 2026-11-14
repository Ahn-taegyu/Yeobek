"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { requestApi } from "@/lib/client";
import { sectionDefinitions } from "@/lib/contracts/knowledge-sections";
import { onboardingKeywordOptions } from "@/lib/contracts/onboarding";
import { errorMessage, Field, Header, Loading, loadProfile, PrivateImage, Questions, sectionsFrom, Steps, useArtistLoad } from "./ui";

import { uploadMaterial } from "./upload";

type Profile = Awaited<ReturnType<typeof loadProfile>>;
type Keywords = NonNullable<Profile["keywords"]>;

const history = sectionDefinitions.artist.filter(section => section.group === "artist_history");
const world = sectionDefinitions.artist.filter(section => section.group === "artist");
const groups = [
  ["fields", "주로 어떤 분야에서 활동하시나요?"],
  ["moods", "작가님의 작품은 어떤 분위기인가요?"],
  ["topics", "작품에서 주로 어떤 이야기를 다루시나요?"],
] as const;

export function Onboarding() {
  const result = useArtistLoad(loadProfile);
  if (!result.data) return <><Header title="기본 정보" /><Loading {...result} /></>;
  return <OnboardingSteps initial={result.data} />;
}

function OnboardingSteps({ initial }: { initial: Profile }) {
  const [profile, setProfile] = useState(initial);
  const [step, setStep] = useState(1);
  const [keywords, setKeywords] = useState<Keywords>(initial.keywords ?? { fields: [], moods: [], topics: [] });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  async function next(form?: FormData) {
    if (busy) return;
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
      else setStep(step + 1);
    } catch (error) {
      setError(errorMessage(error));
    } finally { setBusy(false); }
  }

  async function uploadAvatar(file: File) {
    if (busy) return;
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
    <Header title={["기본 정보", "활동 이력", "나의 작업 키워드"][step - 1]} />
    <form key={step} onSubmit={submit} aria-busy={busy}>
      {step === 1 && <>
        {profile.avatarMaterialId ? <PrivateImage key={profile.avatarMaterialId} className="artist-avatar artist-avatar-large"
          materialId={profile.avatarMaterialId} alt="프로필 사진" /> :
          <Image className="artist-avatar" src="/yeobek/artist-avatar.png" alt="" width={136} height={136} loading="eager" />}
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
      {step === 2 && <Questions definitions={history} document={profile.document} short />}
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
      {step > 1 && <p className="artist-note">입력한 정보는 작가 프로필에 저장되며, 언제든 수정할 수 있어요.</p>}
      <Steps step={step} />
      {error && <p role="alert" className="error">{error}</p>}
      <div className="artist-actions">
        {step > 1 && <button type="button" className="artist-action secondary" disabled={busy} onClick={() => void next()}>건너뛰기</button>}
        <button className="artist-action" disabled={busy}>{busy ? "저장 중…" : step === 3 ? "시작하기" : "다음"}</button>
      </div>
    </form>
  </>;
}

export function ArtistWorld() {
  const result = useArtistLoad(loadProfile);
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

  return <>
    <Header title="나의 작품 세계" />
    {result.data ? <form onSubmit={submit} aria-busy={busy}>
      <Questions definitions={world} document={result.data.document} />
      {error && <p role="alert" className="error">{error}</p>}
      <button className="artist-action" disabled={busy}>{busy ? "저장 중…" : "저장하기"}</button>
    </form> : <Loading {...result} />}
  </>;
}
