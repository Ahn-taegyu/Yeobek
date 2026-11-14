"use client";

import Image from "next/image";
import { transitionScreen } from "@/components/ui/motion";
import { useCallback, useRef, useState, type FormEvent } from "react";
import { requestApi } from "@/lib/client";
import { forgetArtistPage, loadArtistPage } from "@/lib/client/artist-navigation";
import { sectionDefinitions } from "@/lib/contracts/knowledge-sections";
import { ArtistLink, errorMessage, Field, Header, Loading, PrivateImage, Questions, sectionsFrom, Steps, useArtistLoad } from "./ui";
import { artworkListKey, exhibitionKey, loadExhibition, loadExhibitionMaterials, loadExhibitionOverview, materialsKey, overviewKey } from "./navigation-data";
import { uploadMaterial } from "./upload";

type Exhibition = Awaited<ReturnType<typeof requestApi<"getExhibition">>>["data"];
type Work = Awaited<ReturnType<typeof requestApi<"getArtwork">>>["data"];
const basic = sectionDefinitions.exhibition.filter(item => item.group === "exhibition_basic");
const world = sectionDefinitions.exhibition.filter(item => item.group === "exhibition_world");
const story = sectionDefinitions.artwork.filter(item => item.group === "artwork_story");
const labels = { title: "전시명", startDate: "시작일", startTime: "시작 시간", endDate: "종료일", endTime: "종료 시간", place: "장소" } as const;
const images = "image/jpeg,image/png,image/webp";

function value(form: FormData, field: string) {
  return String(form.get(field) ?? "").trim() || null;
}

function explain(error: unknown) {
  return error instanceof Error && error.constructor === Error ? error.message : errorMessage(error);
}

export function ExhibitionEditor({ id, interviewEnabled = false }: { id?: string; interviewEnabled?: boolean }) {
  if (!id) return <ExhibitionSteps initial={null} interviewEnabled={interviewEnabled} />;
  return <ExistingExhibition key={id} id={id} interviewEnabled={interviewEnabled} />;
}

function ExistingExhibition({ id, interviewEnabled }: { id: string; interviewEnabled: boolean }) {
  const load = useCallback((signal: AbortSignal) => loadExhibition(id, signal), [id]);
  const result = useArtistLoad(load, exhibitionKey(id));
  if (!result.data) return <><Header title="전시 정보" /><Loading {...result} /></>;
  return <ExhibitionSteps initial={result.data} interviewEnabled={interviewEnabled} />;
}

function ExhibitionSteps({ initial, interviewEnabled }: { initial: Exhibition | null; interviewEnabled: boolean }) {
  const [saved, setSaved] = useState(initial);
  const [step, setStep] = useState(() => {
    if (initial && (initial.state !== "draft" || initial.authoringStep === "artworks")) return 3;
    return initial?.authoringStep === "world" ? 2 : 1;
  });
  const [status, setStatus] = useState<{ error?: string; notice?: string }>({});
  const [busy, setBusy] = useState(false);
  const creating = useRef<string | null>(null);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const form = new FormData(event.currentTarget);
    const advance = (event.nativeEvent as SubmitEvent).submitter?.getAttribute("value") === "next";
    const fields = step === 1 ? {
      title: value(form, "title"), startDate: value(form, "startDate"), endDate: value(form, "endDate"),
      startTime: value(form, "startTime"), endTime: value(form, "endTime"), place: value(form, "place"),
    } : {
      title: saved?.draftTitle ?? saved?.title, startDate: saved?.startDate, endDate: saved?.endDate,
      startTime: saved?.startTime, endTime: saved?.endTime, place: saved?.place,
    };
    if (fields.startDate && fields.endDate && fields.startTime && fields.endTime &&
      `${fields.startDate}T${fields.startTime}` > `${fields.endDate}T${fields.endTime}`) {
      setStatus({ error: "종료 일시는 시작 일시와 같거나 그 이후여야 해요." });
      return;
    }
    setBusy(true);
    setStatus({});
    const document = sectionsFrom(form, step === 1 ? basic : world, saved?.document);
    try {
      let next: Exhibition;
      if (saved?.authoringStep) {
        next = (await requestApi("updateExhibition", {
          params: { id: saved.id }, body: { ...fields, ...document, draft: true,
            expectedRevision: saved.revision, expectedDocumentRevision: saved.document.revision },
        })).data;
      } else if (saved) {
        next = (await requestApi("updateExhibition", {
          params: { id: saved.id }, body: { title: fields.title ?? "", startDate: fields.startDate, endDate: fields.endDate,
            place: fields.place, ...document, expectedRevision: saved.revision, expectedDocumentRevision: saved.document.revision },
        })).data;
      } else {
        creating.current ??= crypto.randomUUID();
        next = (await requestApi("createExhibition", {
          body: { ...fields, ...document, draft: true, id: creating.current },
        })).data;
        window.history.replaceState(null, "", `/artist/exhibitions/${next.id}`);
      }
      setSaved(next);
      if (!advance) { setStatus({ notice: "임시 저장했어요." }); return; }
      const target = step === 1 ? "world" : "artworks";
      if (next.authoringStep === (step === 1 ? "basic" : "world")) {
        const { data } = await requestApi("advanceExhibition", {
          params: { id: next.id }, body: { expectedRevision: next.revision, step: target },
        });
        setSaved(data.exhibition);
        if (!data.advanced) {
          const fields = data.blockers.map(blocker => labels[blocker.field as keyof typeof labels] ?? blocker.field);
          setStatus({ error: `다음 단계로 가려면 ${[...new Set(fields)].join(", ")} 항목을 확인해주세요.` });
          return;
        }
      }
      transitionScreen(() => setStep(step + 1));
    } catch (error) {
      setStatus({ error: errorMessage(error) });
    } finally { setBusy(false); }
  }

  return <>
    <Header title={initial ? saved?.title || "전시 정보" : "새 전시 등록하기"} />
    {step < 3 && <form key={step} onSubmit={save} aria-busy={busy}>
      <h2>{step === 1 ? "전시 정보를 알려주세요" : "전체적인 작품에 대해 알려주세요"}</h2>
      {step === 1 && <>
        <Field label="전시명"><input name="title" maxLength={100} defaultValue={saved?.draftTitle ?? saved?.title ?? ""} /></Field>
        <fieldset>
          <legend>전시 기간</legend>
          <div className="artist-date">
            <Field label="시작일"><input type="date" name="startDate" defaultValue={saved?.startDate ?? ""} /></Field>
            <Field label="시작 시간"><input type="time" name="startTime" defaultValue={saved?.startTime ?? ""} /></Field>
            <Field label="종료일"><input type="date" name="endDate" defaultValue={saved?.endDate ?? ""} /></Field>
            <Field label="종료 시간"><input type="time" name="endTime" defaultValue={saved?.endTime ?? ""} /></Field>
          </div>
        </fieldset>
        <Field label="장소"><input name="place" maxLength={200} defaultValue={saved?.place ?? ""} /></Field>
      </>}
      <Questions definitions={step === 1 ? basic : [...world.slice(1), world[0]]} document={saved?.document} />
      <Steps step={step} />
      {status.error && <p role="alert" className="error">{status.error}</p>}
      {status.notice && <p role="status">{status.notice}</p>}
      <div className="artist-actions">
        {step > 1 && <button className="artist-action secondary" type="button" disabled={busy} onClick={() => transitionScreen(() => setStep(step - 1))}>이전</button>}
        <button className="artist-action secondary" value="draft" disabled={busy}>임시 저장</button>
        <button className="artist-action" value="next" disabled={busy}>{busy ? "저장 중…" : "다음"}</button>
      </div>
    </form>}
    {saved && <nav className="artist-actions" aria-label="전시 질문과 체험">
      <ArtistLink className="artist-action secondary" href={`/artist/exhibitions/${saved.id}/faq`}>자주하는 질문</ArtistLink>
      <ArtistLink className="artist-action secondary" href={`/artist/exhibitions/${saved.id}/preview`}>여운 체험하기</ArtistLink>
    </nav>}
    {step === 3 && saved && <ExhibitionMaterials exhibition={saved} interviewEnabled={interviewEnabled}
      onChange={setSaved} onBack={() => transitionScreen(() => setStep(2))} />}
  </>;
}

function ExhibitionMaterials({ exhibition, interviewEnabled, onChange, onBack }: {
  exhibition: Exhibition; interviewEnabled: boolean; onChange: (value: Exhibition) => void; onBack: () => void;
}) {
  const id = exhibition.id;
  const load = useCallback((signal: AbortSignal) => loadExhibitionMaterials(id, signal), [id]);
  const result = useArtistLoad(load, materialsKey(id), () => forgetArtistPage(artworkListKey(id)));
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState("");

  async function upload(file: File, kind: "image" | "pdf") {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const material = await uploadMaterial(file, "exhibition", id, kind);
      if (kind === "image") {
        const { data } = await requestApi("setExhibitionPoster", { params: { id }, body: {
          expectedRevision: exhibition.revision, materialId: material.id,
        } });
        onChange(data);
      }
      result.retry();
    } catch (error) { setError(explain(error)); }
    finally { setBusy(false); }
  }

  async function move(index: number, direction: number) {
    if (!result.data || busy) return;
    const items = result.data.works.map(({ id, revision }) => ({ id, expectedRevision: revision }));
    const target = index + direction;
    [items[index], items[target]] = [items[target], items[index]];
    setBusy(true);
    setError("");
    try {
      await requestApi("reorderArtworks", { params: { id }, body: { items } });
      result.retry();
    } catch (error) { setError(errorMessage(error)); }
    finally { setBusy(false); }
  }

  if (!result.data) return <Loading {...result} />;
  return <section>
    <h2>전시 자료를 제공해주세요</h2>
    <Field label="파일 업로드"><input type="file" accept="application/pdf" disabled={busy} onChange={event => {
      const file = event.target.files?.[0];
      event.target.value = "";
      if (file) void upload(file, "pdf");
    }} /></Field>

    {result.data.materials.filter(item => item.kind === "pdf" && item.state === "ready")
      .map(item => <p key={item.id}>{item.filename}</p>)}
    <Field label="전시 포스터"><input type="file" accept={images} disabled={busy} onChange={event => {
      const file = event.target.files?.[0];
      event.target.value = "";
      if (file) void upload(file, "image");
    }} /></Field>
    {exhibition.posterMaterialId && <PrivateImage key={exhibition.posterMaterialId} materialId={exhibition.posterMaterialId}
      className="artist-placeholder" alt="전시 포스터" />}
    <h2>작품 설명</h2>
    {result.data.works.length === 0 && <p>등록한 작품이 없어요.</p>}
    {result.data.works.map((work, index) => <details key={work.id}>
      <summary>{work.draftNumber ?? work.number}. {work.draftTitle || work.title}</summary>
      <ArtworkForm exhibitionId={id} work={work} onSaved={result.retry} />
      <div className="artist-actions">
        {interviewEnabled && <ArtistLink className="artist-action secondary"
          href={`/artist/exhibitions/${id}/artworks/${work.id}/interview`}>작품 인터뷰</ArtistLink>}
        <button className="artist-action secondary" disabled={busy || index === 0} onClick={() => void move(index, -1)}>위로</button>
        <button className="artist-action secondary" disabled={busy || index === result.data!.works.length - 1} onClick={() => void move(index, 1)}>아래로</button>
      </div>
    </details>)}
    {adding ? <ArtworkForm exhibitionId={id} onSaved={() => { setAdding(false); result.retry(); }} /> :
      <button className="artist-action secondary" onClick={() => setAdding(true)}>
        <Image src="/yeobek/artist-add.svg" width={18} height={18} alt="" />작품 추가하기
      </button>}
    <Steps step={3} />
    {error && <p className="error" role="alert">{error}</p>}
    <div className="artist-actions">
      <button className="artist-action secondary" onClick={onBack}>이전</button>
      <ArtistLink className="artist-action" href={`/artist/exhibitions/${id}/learning`}
        prepare={() => loadArtistPage(overviewKey(id), signal => loadExhibitionOverview(id, signal))}>여운 학습시키기</ArtistLink>
      <ArtistLink className="artist-action secondary" href={`/artist/exhibitions/${id}/review`}
        prepare={() => import("./narration-review").then(({ prepareNarrationReview }) => prepareNarrationReview(id, result.data?.works[0]?.id))}>기본 해설 검토</ArtistLink>
      <ArtistLink className="artist-action secondary" href={`/artist/exhibitions/${id}/publication`}
        prepare={() => import("./publication").then(({ preparePublication }) => preparePublication(id))}>전시 게시 관리</ArtistLink>
    </div>
  </section>;
}

function ArtworkForm({ exhibitionId, work, onSaved }: { exhibitionId: string; work?: Work; onSaved: () => void }) {
  const creating = useRef<string | null>(null);
  const [saved, setSaved] = useState(work);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const form = new FormData(event.currentTarget);
    const number = value(form, "number");
    const fields = {
      draft: true as const, title: value(form, "title"), number: number ? Number(number) : null,
      creationYear: value(form, "creationYear"), medium: value(form, "medium"), dimensions: value(form, "dimensions"),
      dimensionsUnit: value(form, "dimensionsUnit"), ...sectionsFrom(form, story, saved?.document),
    };
    const image = form.get("image");
    setBusy(true);
    setError("");
    try {
      let next: Work;
      if (saved) {
        next = (await requestApi("updateArtwork", { params: { id: saved.id },
          body: { ...fields, expectedRevision: saved.revision, expectedDocumentRevision: saved.document.revision },
        })).data;
      } else {
        creating.current ??= crypto.randomUUID();
        next = (await requestApi("createArtwork", { params: { id: exhibitionId }, body: { ...fields, id: creating.current } })).data;
      }
      setSaved(next);
      if (image instanceof File && image.size) {
        const material = await uploadMaterial(image, "artwork", next.id, "image");
        await requestApi("setArtworkImage", { params: { id: next.id }, body: { expectedRevision: next.revision, materialId: material.id } });
      }
      onSaved();
    } catch (error) { setError(explain(error)); }
    finally { setBusy(false); }
  }

  return <form onSubmit={save} aria-busy={busy}>
    <Field label="작품명"><input name="title" defaultValue={saved?.draftTitle ?? saved?.title ?? ""} maxLength={100} /></Field>
    <Field label="작품 번호"><input type="number" name="number" min={1} max={9999} defaultValue={saved?.draftNumber ?? saved?.number} /></Field>
    <Field label="제작 연도"><input name="creationYear" defaultValue={saved?.creationYear ?? ""} maxLength={50} /></Field>
    <Field label="재료와 기법"><input name="medium" defaultValue={saved?.medium ?? ""} maxLength={200} /></Field>
    <Field label="크기"><input name="dimensions" defaultValue={saved?.dimensions ?? ""} maxLength={100} /></Field>
    <Field label="크기 단위"><input name="dimensionsUnit" defaultValue={saved?.dimensionsUnit ?? ""} maxLength={20} /></Field>
    <Field label="작품 이미지"><input type="file" name="image" accept={images} /></Field>
    {saved?.imageMaterialId && <PrivateImage key={saved.imageMaterialId} materialId={saved.imageMaterialId}
      className="artist-placeholder" alt="작품 이미지" />}
    <Questions definitions={story} document={saved?.document} />
    {error && <p className="error" role="alert">{error}</p>}
    <button className="artist-action" disabled={busy}>{busy ? "저장 중…" : "작품 저장"}</button>
  </form>;
}
