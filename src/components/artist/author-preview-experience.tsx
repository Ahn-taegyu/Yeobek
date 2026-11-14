"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ExhibitionExperience } from "@/components/visitor/visitor-exhibition";
import type { ExperienceExhibition, ExperienceImageProps, ExperienceTransport } from "@/components/visitor/experience-types";
import { createAuthorPreviewTransport, loadAuthorPreview } from "@/lib/client/author-preview";
import { PrivateImage, errorMessage } from "./ui";
import styles from "./author-preview-experience.module.css";

function PreviewImage({ id, alt, className }: ExperienceImageProps) {
  // This renderer only uses authenticated material access, never public media IDs.
  return <PrivateImage key={id} materialId={id} alt={alt} className={className} />;
}

type Loaded = { exhibition: ExperienceExhibition; transport: ExperienceTransport };
export function AuthorPreviewExperience({ id, initialArtworkId }: { id: string; initialArtworkId?: string }) {
  const [state, setState] = useState<{ loaded?: Loaded; error?: string }>({});
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    void loadAuthorPreview(id, controller.signal).then(exhibition => {
      if (controller.signal.aborted) return;
      if (initialArtworkId && !exhibition.artworks.some(work => work.id === initialArtworkId)) {
        setState({ error: "체험할 작품을 찾을 수 없어요." });
      } else setState({ loaded: { exhibition, transport: createAuthorPreviewTransport(exhibition) } });
    }).catch(error => { if (!controller.signal.aborted) setState({ error: errorMessage(error) }); });
    return () => controller.abort();
  }, [id, initialArtworkId, attempt]);
  return <div className={styles.preview}>
    <div className={styles.notice}>
      <Link href={`/artist/exhibitions/${id}`}>전시 편집으로</Link>
      <strong>작가 전용 초안 체험</strong>
      <p>저장된 초안 자료로 답하며 관람객에게 공개되지 않아요. 음성을 켜거나 녹음하면 음성 처리 비용이 발생할 수 있어요.</p>
    </div>
    {state.error ? <div className={styles.state}>
      <p role="alert">{state.error}</p>
      <button onClick={() => { setState({}); setAttempt(value => value + 1); }}>다시 시도</button>
    </div> : state.loaded ? <ExhibitionExperience key={`${id}:${initialArtworkId ?? ""}`} exhibition={state.loaded.exhibition}
      initialArtworkId={initialArtworkId} transport={state.loaded.transport} ImageComponent={PreviewImage} initiallyMuted
      emptyArtworkMessage="등록된 작품이 아직 없어요. 전시에 관해 질문해 보세요." />
      : <p className={styles.state} role="status">초안 체험을 준비하고 있어요.</p>}
  </div>;
}
