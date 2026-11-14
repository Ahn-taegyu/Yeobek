"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { ApiClientError, requestApi } from "@/lib/client";
import type { z } from "zod";
import type { documentResponse } from "@/lib/contracts/responses";
import type { section } from "@/lib/contracts/requests";

export type Document = z.infer<typeof documentResponse>;
export type Section = z.input<typeof section>;

export function Header({ title, back = "/artist" }: { title: string; back?: string }) {
  return <div className="artist-header">
    <Link href={back} aria-label="뒤로"><Image alt="" width={28} height={28} src="/yeobek/artist-back.svg" /></Link>
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

export function Questions({ definitions, document, short = false }: {
  definitions: readonly { id: string; prompt: string; maxLength: number }[];
  document?: Document;
  short?: boolean;
}) {
  return definitions.map(({ id, prompt, maxLength }) => <Field key={id} label={prompt}>
    <textarea name={id} maxLength={maxLength} data-short={short || undefined}
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

export function useArtistLoad<T>(load: (signal: AbortSignal) => Promise<T>) {
  const [result, setResult] = useState<{ data?: T; error?: string }>({});
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal).then(data => {
      if (!controller.signal.aborted) setResult({ data });
    }).catch(error => {
      if (controller.signal.aborted) return;
      if (error instanceof ApiClientError && error.status === 401) window.location.replace("/login");
      else setResult({ error: errorMessage(error) });
    });
    return () => controller.abort();
  }, [load, attempt]);
  return {
    ...result,
    retry: () => { setResult({}); setAttempt(value => value + 1); },
  };
}

export function Loading({ error, retry }: { error?: string; retry: () => void }) {
  return error ? <div>
    <p className="error" role="alert">{error}</p>
    <button className="artist-action" onClick={retry}>다시 시도</button>
  </div> : <p role="status">불러오는 중이에요.</p>;
}

export async function loadProfile(signal: AbortSignal) {
  return (await requestApi("getProfile", { signal })).data;
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
