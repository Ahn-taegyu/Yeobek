"use client";

import qrcode from "qrcode-generator";
import { type CSSProperties, type MouseEvent, useEffect, useId, useMemo, useRef, useState } from "react";
import styles from "./exhibition-share-sheet.module.css";
import { ArtistLink } from "./ui";
import { prepareExhibition } from "./navigation-data";

const QUIET_ZONE = 4;

/** Same-origin visitor route as the publication screen's "공개 전시 보기" link. */
export function visitorExhibitionUrl(origin: string, exhibitionId: string) {
  return new URL(`/exhibitions/${encodeURIComponent(exhibitionId)}`, origin).href;
}

function qrPath(text: string) {
  const code = qrcode(0, "M");
  code.addData(text);
  code.make();
  const count = code.getModuleCount();
  let path = "";
  for (let row = 0; row < count; row += 1) {
    for (let col = 0; col < count; col += 1) {
      if (code.isDark(row, col)) path += `M${col + QUIET_ZONE} ${row + QUIET_ZONE}h1v1h-1z`;
    }
  }
  return { path, size: count + QUIET_ZONE * 2 };
}

const order = (index: number) => ({ "--share-order": index }) as CSSProperties;

export function ExhibitionShareSheet({ exhibition, preview = false, onClose }: {
  exhibition: { id: string; title: string };
  preview?: boolean;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const linkField = useRef<HTMLInputElement>(null);
  const titleId = useId();
  const descriptionId = useId();
  const [copied, setCopied] = useState<"copied" | "selected" | "">("");
  const url = useMemo(() => visitorExhibitionUrl(window.location.origin, exhibition.id), [exhibition.id]);
  const qr = useMemo(() => qrPath(url), [url]);

  useEffect(() => {
    const modal = dialog.current;
    modal?.showModal();
    return () => modal?.close();
  }, []);

  function close() {
    const modal = dialog.current;
    if (!modal?.open) return;
    modal.close();
    void Promise.allSettled(modal.getAnimations().map(animation => animation.finished)).then(onClose);
  }

  function closeFromBackdrop(event: MouseEvent<HTMLDialogElement>) {
    if (event.target !== event.currentTarget) return;
    const box = event.currentTarget.getBoundingClientRect();
    const inside = event.clientX >= box.left && event.clientX <= box.right && event.clientY >= box.top && event.clientY <= box.bottom;
    if (!inside) close();
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied("copied");
    } catch {
      linkField.current?.select();
      setCopied("selected");
    }
  }

  return <dialog ref={dialog} className={`artist-sheet ${styles.sheet}`} aria-labelledby={titleId} aria-describedby={descriptionId}
    onCancel={event => { event.preventDefault(); close(); }} onClick={closeFromBackdrop}>
    <div className="artist-actions">
      <h2 id={titleId}>전시 공유하기</h2>
      <button type="button" className="artist-sheet-close" aria-label="닫기" onClick={close}>×</button>
    </div>
    <p id={descriptionId} className={styles.description}>
      <strong>{exhibition.title}</strong> 전시를 관람객에게 링크나 QR 코드로 알려 주세요.
    </p>

    <div className={`yeobek-appear ${styles.item}`} style={order(0)}>
      <label className={styles.label} htmlFor={`${titleId}-link`}>관람객용 전시 링크</label>
      <div className={styles.link}>
        <input ref={linkField} id={`${titleId}-link`} type="url" value={url} readOnly onFocus={event => event.currentTarget.select()} />
        <button type="button" className={styles.copy} onClick={copy}>{copied === "copied" ? "복사됨" : "복사"}</button>
      </div>
      <p className={styles.status} role="status">
        {copied === "copied" ? "링크를 복사했어요." : copied === "selected" ? "링크를 선택했어요. 길게 눌러 복사해 주세요." : ""}
      </p>
    </div>

    <figure className={`yeobek-appear ${styles.item} ${styles.qr}`} style={order(1)}>
      <svg viewBox={`0 0 ${qr.size} ${qr.size}`} role="img" aria-label="관람객용 전시 링크 QR 코드" shapeRendering="crispEdges">
        <rect width={qr.size} height={qr.size} fill="#fff" />
        <path d={qr.path} fill="#121215" />
      </svg>
      <figcaption>카메라로 찍으면 전시 화면이 열려요.</figcaption>
    </figure>

    <div className={`yeobek-appear ${styles.item} ${styles.actions}`} style={order(2)}>
      {preview ? <button type="button" className="artist-action" disabled>정보 수정하기</button> :
        <ArtistLink className="artist-action" href={`/artist/exhibitions/${exhibition.id}`} prepare={() => prepareExhibition(exhibition.id)}>정보 수정하기</ArtistLink>}
    </div>
  </dialog>;
}
