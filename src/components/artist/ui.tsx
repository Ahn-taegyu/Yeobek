"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState, useSyncExternalStore, type ComponentProps, type ReactNode } from "react";
import { ApiClientError, requestApi } from "@/lib/client";
import { forgetArtistPage, loadArtistPage, readArtistPage } from "@/lib/client/artist-navigation";
import { homeKey, loadHome, prepareExhibition } from "./navigation-data";
import type { z } from "zod";
import type { documentResponse } from "@/lib/contracts/responses";
import type { section } from "@/lib/contracts/requests";

export type Document = z.infer<typeof documentResponse>;
export type Section = z.input<typeof section>;

export function ArtistLink({ prepare, ...props }: ComponentProps<typeof Link> & { prepare?: () => Promise<unknown> }) {
  const preload = () => { void prepare?.().catch(() => {}); };
  return <Link {...props} prefetch onPointerEnter={preload} onPointerDown={preload} onFocus={preload} />;
}

export function Header({ title, back = "/artist", backIcon = "/yeobek/artist-back.svg" }: { title: string; back?: string; backIcon?: string }) {
  const exhibitionId = /^\/artist\/exhibitions\/([0-9a-f-]{36})$/i.exec(back)?.[1];
  const prepare = back === "/artist" ? () => loadArtistPage(homeKey, loadHome)
    : exhibitionId ? () => prepareExhibition(exhibitionId) : undefined;
  return <div className="artist-header">
    <ArtistLink href={back} prepare={prepare} aria-label="뒤로"><Image alt="" width={28} height={28} src={backIcon} loading="eager" /></ArtistLink>
    <h1>{title}</h1>
  </div>;
}

export function Steps({ step }: { step: number }) {
  return <div className="artist-steps" aria-label={`3단계 중 ${step}단계`}>
    {[1, 2, 3].map(value => <span key={value} aria-current={value === step ? "step" : undefined} />)}
  </div>;
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="artist-field"><span>{label}</span>{children}</label>;
}

export function Questions({ definitions, document, short = false, placeholders }: {
  definitions: readonly { id: string; prompt: string; maxLength: number }[];
  document?: Document;
  short?: boolean;
  placeholders?: Readonly<Record<string, string>>;
}) {
  return definitions.map(({ id, prompt, maxLength }) => <Field key={id} label={prompt}>
    <textarea name={id} maxLength={maxLength} data-short={short || undefined} placeholder={placeholders?.[id]}
      defaultValue={document?.sections.find(item => item.id === id)?.body ?? ""} />
  </Field>);
}

export function sectionsFrom(form: FormData, definitions: readonly { id: Section["id"] }[], existing?: Document) {
  const editing = new Set(definitions.map(item => item.id));
  const sections = [...(existing?.sections.filter(item => !editing.has(item.id)) ?? [])];
  for (const { id } of definitions) {
    const body = String(form.get(id) ?? "").trim();
    if (body) sections.push({ id, body });
  }
  return { sections, sourceRefs: existing?.sourceRefs.filter(ref => sections.some(item => item.id === ref.sectionId)) ?? [] };
}

export function errorMessage(error: unknown) {
  if (error instanceof ApiClientError) {
    const field = Object.values(error.fields ?? {}).flat()[0];
    return field ?? error.message;
  }
  return "요청을 완료하지 못했어요. 다시 시도해주세요.";
}

const noSubscription = () => () => {};
const noServerData = () => undefined;

export function useArtistLoad<T>(load: (signal: AbortSignal) => Promise<T>, key?: string, invalidate?: () => void) {
  const [result, setResult] = useState<{ load: typeof load; key?: string; attempt: number; data?: T; error?: string }>();
  const [refresh, setRefresh] = useState({ attempt: 0, load, key });
  const attempt = refresh.load === load && refresh.key === key ? refresh.attempt : 0;
  useEffect(() => {
    const controller = new AbortController();
    const read = key !== undefined ? loadArtistPage(key, load, controller.signal) : load(controller.signal);
    void read.then(data => {
      if (!controller.signal.aborted) setResult({ load, key, attempt, data });
    }).catch(error => {
      if (controller.signal.aborted) return;
      if (error instanceof ApiClientError && error.status === 401) window.location.replace("/login");
      else setResult({ load, key, attempt, error: errorMessage(error) });
    });
    return () => controller.abort();
  }, [load, key, attempt]);
  const current = result?.load === load && result.key === key && result.attempt === attempt ? result : undefined;
  const prepared = useSyncExternalStore(noSubscription,
    () => key !== undefined && attempt === 0 ? readArtistPage<T>(key) : undefined, noServerData);
  return {
    data: current ? current.data : prepared,
    error: current?.error,
    retry: () => {
      if (key !== undefined) forgetArtistPage(key);
      invalidate?.();
      setRefresh({ attempt: attempt + 1, load, key });
    },
  };
}

export function Loading({ error, retry }: { error?: string; retry: () => void }) {
  return error ? <div>
    <p className="error" role="alert">{error}</p>
    <button className="artist-action" onClick={retry}>다시 시도</button>
  </div> : <p role="status">불러오는 중이에요.</p>;
}

export function PrivateImage({ materialId, className, alt }: { materialId: string; className?: string; alt: string }) {
  const [src, setSrc] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    void requestApi("getMaterial", { params: { id: materialId }, signal: controller.signal }).then(({ data }) => {
      if (!controller.signal.aborted) setSrc(data.download.url);
    }).catch(() => {});
    return () => controller.abort();
  }, [materialId]);
  return src ? <Image className={className} src={src} alt={alt} width={160} height={195} unoptimized />
    : <span className={className} aria-hidden="true" />;
}
