"use client";

import Image from "next/image";
import { useCallback, useState } from "react";
import { ApiClientError, requestApi } from "@/lib/client";
import { loadArtworkList } from "./navigation-data";
import { errorMessage, Header, Loading, useArtistLoad } from "./ui";
import styles from "./review-list.module.css";

type Review = Awaited<ReturnType<typeof requestApi<"reviewArtwork">>>["data"] & { generated?: { text: string; jobId: string } };

/** The latest training batch holds generated introductions that were not saved to the artwork yet. */
async function loadReviews(id: string, signal?: AbortSignal): Promise<Review[]> {
  const [works, batch] = await Promise.all([loadArtworkList(id, signal ?? new AbortController().signal),
    requestApi("getLatestTrainingBatch", { params: { id }, signal }).then(({ data }) => data).catch(() => null)]);
  return Promise.all(works.map(async work => {
    const review: Review = (await requestApi("reviewArtwork", { params: { id: work.id }, signal })).data;
    const jobId = batch?.targets.find(target => target.kind === "narration" && target.artworkId === work.id && target.status === "succeeded")?.jobId;
    if (!review.approval && !review.artwork.narrationDraft && jobId) {
      const job = (await requestApi("getJob", { params: { id: jobId }, signal })).data;
      const answer = job.kind === "narration" ? job.result?.selected.answer : undefined;
      if (answer) review.generated = { text: answer, jobId };
    }
    return review;
  }));
}

/** Figma 116: every artwork's basic introduction in one list; edited texts are saved together. */
export function NarrationList({ id }: { id: string }) {
  const load = useCallback((signal: AbortSignal) => loadReviews(id, signal), [id]);
  const result = useArtistLoad(load);
  const [reloaded, setReloaded] = useState<Review[]>();
  const reviews = reloaded ?? result.data;
  const [open, setOpen] = useState<string | null>(null);
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const text = (review: Review) => review.approval?.text ?? review.artwork.narrationDraft ?? review.generated?.text ?? "";
  const changed = reviews?.filter(review => edits[review.artwork.id] !== undefined && edits[review.artwork.id].trim() !== text(review).trim()) ?? [];

  async function save() {
    if (!changed.length || busy) return;
    setBusy(true); setError(""); setNotice("");
    let unapproved = 0;
    try {
      for (const review of changed) {
        let revision = review.artwork.revision;
        if (review.generated) {
          // A training candidate is first stored verbatim with its job, keeping provenance; the edit is the next revision.
          try {
            revision = (await requestApi("saveNarration", { params: { id: review.artwork.id },
              body: { expectedRevision: revision, text: review.generated.text, sourceJobId: review.generated.jobId } })).data.revision;
          } catch (cause) {
            // Inputs changed after training (e.g. interview answers): keep the artist's text without the stale job link.
            if (!(cause instanceof ApiClientError && cause.status === 409)) throw cause;
          }
        }
        const saved = (await requestApi("saveNarration", { params: { id: review.artwork.id },
          body: { expectedRevision: revision, text: edits[review.artwork.id].trim() } })).data;
        // The artist's own edit keeps the evidence the approved text already cited.
        if (review.approval) await requestApi("approveArtwork", { params: { id: review.artwork.id },
          body: { kind: "narration", expectedRevision: saved.revision, citations: review.approval.citations.map(({ id, version }) => ({ id, version })) } });
        else unapproved += 1;
      }
      setEdits({});
      setReloaded(await loadReviews(id));
      setNotice(unapproved ? `저장했어요. 승인 전 소개 ${unapproved}개는 작품별 검토에서 근거와 함께 승인해 주세요.` : "수정 내용을 저장했어요. 다시 학습하면 예상 질문에도 반영돼요.");
    } catch (cause) { setError(errorMessage(cause)); }
    finally { setBusy(false); }
  }

  return <div className={styles.screen}>
    <Header title="작품 기본 소개 검토하기" back={`/artist/exhibitions/${id}/verification`} />
    {!reviews ? <Loading {...result} /> : <ol className={styles.list}>
      {reviews.map((review, index) => {
        const work = review.artwork;
        const expanded = open === work.id;
        return <li key={work.id} className={styles.item}>
          <button type="button" aria-expanded={expanded} onClick={() => setOpen(expanded ? null : work.id)}>
            <span>{`${work.draftNumber ?? work.number ?? index + 1}. ${work.title}`}
              {!review.approval && <span className={styles.badge}>승인 전</span>}</span>
            <Image className={styles.chevron} src="/yeobek/review-chevron.svg" alt="" width={19} height={19} />
          </button>
          {expanded && <div className={styles.body}>
            <textarea aria-label={`${work.title} 기본 소개`} value={edits[work.id] ?? text(review)} maxLength={2000} disabled={busy}
              onChange={event => setEdits(current => ({ ...current, [work.id]: event.target.value }))} />
            <div className={styles.actions}>
              <a href={`/artist/exhibitions/${id}/review?work=${work.id}`}>근거와 함께 자세히 검토</a>
            </div>
          </div>}
        </li>;
      })}
    </ol>}
    <div className={styles.footer}>
      {notice && <p role="status">{notice}</p>}
      {error && <p className="error" role="alert">{error}</p>}
      <button className={styles.save} disabled={!changed.length || busy} onClick={() => void save()}>{busy ? "저장 중…" : "수정 내용 저장하기"}</button>
    </div>
  </div>;
}
