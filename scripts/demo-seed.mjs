import { createClient } from "@supabase/supabase-js";
import { randomBytes, randomUUID } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { parseEnv } from "node:util";
import sharp from "sharp";
import { localStatus } from "./local-supabase.mjs";
import { loadAiEnv } from "./ai-env.mjs";

export function localOrigin(value) {
  let url;
  try { url = new URL(value); } catch { throw new Error("A local HTTP origin is required."); }
  if (url.protocol !== "http:" || !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) ||
      url.username || url.password || url.pathname !== "/" || url.search || url.hash) {
    throw new Error("Demo seeding refuses remote URLs, credentials, paths and redirects.");
  }
  return url.origin;
}

export function assertDemoEnvironment(origin, status, env) {
  if (env.NODE_ENV === "production" || env.VERCEL_ENV === "production") {
    throw new Error("Demo seeding is available only in local development/test.");
  }
  if (env.AI_PROVIDER_MODE !== "mock" || env.FEATURE_VOICE_REQUIRED !== "false" || env.FEATURE_EXPECTED_QA !== "true") {
    throw new Error("Use a local mock server with FEATURE_VOICE_REQUIRED=false and FEATURE_EXPECTED_QA=true for the demo.");
  }
  const appOrigin = localOrigin(origin);
  const apiOrigin = localOrigin(status.API_URL);
  if (env.NEXT_PUBLIC_SUPABASE_URL && localOrigin(env.NEXT_PUBLIC_SUPABASE_URL) !== apiOrigin) {
    throw new Error("The configured Supabase URL does not match the local stack.");
  }
  if (!status.SERVICE_ROLE_KEY || !status.ANON_KEY) throw new Error("The local stack credentials are unavailable.");
  return appOrigin;
}

function apiClient(origin) {
  const cookies = new Map();
  return async (path, body, method = body === undefined ? "GET" : "POST") => {
    const response = await fetch(origin + path, {
      method, redirect: "error", signal: AbortSignal.timeout(60_000),
      headers: { Origin: origin, "Content-Type": "application/json",
        Cookie: [...cookies].map(([key, value]) => `${key}=${value}`).join("; ") },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    for (const value of response.headers.getSetCookie()) {
      const [key, ...parts] = value.split(";")[0].split("="); cookies.set(key, parts.join("="));
    }
    const result = await response.json();
    if (!response.ok) throw new Error(`Demo API ${method} ${path}: HTTP ${response.status} (${result.error?.code ?? "invalid_response"}).`);
    return result.data;
  };
}

/** Creates only fictional local data through Auth, Storage and application APIs.
 * No SQL table writes, database resets, external model calls or existing-account changes. */
export async function seedDemo({ origin, status, env = process.env, saved, onAccount }) {
  const base = assertDemoEnvironment(origin, status, env); // before any network call
  const request = apiClient(base);
  if (saved) {
    await request("/api/auth/login", { email: saved.email, password: saved.password });
    const show = await request(`/api/public/exhibitions/${saved.exhibitionId}`);
    if (show.artworks.length !== 3) throw new Error("Existing demo changed; preserve it and choose a new DEMO_ENV_FILE.");
    for (const work of show.artworks) {
      const qa = await request(`/api/admin/exhibitions/${show.id}/qa?artworkId=${work.id}`);
      if (!qa.some(item => item.state === "approved")) throw new Error("Existing demo lacks approved QA; preserve it and choose a new DEMO_ENV_FILE.");
    }
    return { ...saved, path: `/exhibitions/${show.id}`, reused: true };
  }
  const credentials = { email: `demo-${randomUUID()}@example.invalid`, password: randomBytes(24).toString("base64url") };
  const worker = createClient(status.API_URL, status.SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  const anonymous = createClient(status.API_URL, status.ANON_KEY, { auth: { persistSession: false } });
  const created = await worker.auth.admin.createUser({ ...credentials, email_confirm: true });
  if (created.error) throw new Error("Could not create the local demo account.");
  const exhibitionId = randomUUID();
  const result = { ...credentials, exhibitionId, path: `/exhibitions/${exhibitionId}`, reused: false };
  // Preserve access even when a later API fails. Never print the credentials.
  onAccount?.(result);
  await request("/api/auth/login", credentials);
  const profile = await request("/api/admin/profile");
  await request("/api/admin/profile/onboarding", { expectedRevision: profile.revision,
    fullName: "시연 작가", displayName: "여백 시연 작가", complete: true,
    keywords: { fields: ["서양화"], moods: ["차분한"], topics: ["자연"] } }, "PATCH");
  const show = await request("/api/admin/exhibitions", {
    id: exhibitionId, title: "여백 — 로컬 시연 전시", startDate: "2026-11-14", endDate: "2026-11-15", place: "시연 공간",
    sections: [{ id: "introduction", body: "가상의 작가와 작품으로 구성한 개발 시연입니다." }], sourceRefs: [],
  });
  const works = [];
  let intro = null;
  const fixtures = [
    { title: "아침의 여백", color: "#cfa97f", text: "아침의 여백은 따뜻한 갈색 면으로 고요한 아침을 표현한 가상의 시연 작품입니다." },
    { title: "바람의 선", color: "#8ca9a3", text: "바람의 선은 푸른 초록색을 사용해 바람의 움직임을 표현한 가상의 시연 작품입니다." },
    { title: "저녁의 기억", color: "#797399", text: "저녁의 기억은 보라색 면으로 하루가 끝나는 순간을 표현한 가상의 시연 작품입니다." },
  ];
  for (const [index, fixture] of fixtures.entries()) {
    let work = await request(`/api/admin/exhibitions/${exhibitionId}/artworks`, {
      id: randomUUID(), number: index + 1, title: fixture.title, creationYear: "2026", medium: "시연용 디지털 이미지",
      sections: [{ id: "description", body: fixture.text }], sourceRefs: [],
    });
    const artPath = `/api/admin/artworks/${work.id}`;
    const png = await sharp({ create: { width: 480, height: 360, channels: 3, background: fixture.color } }).png().toBuffer();
    const upload = await request("/api/admin/uploads", { id: randomUUID(), subjectType: "artwork", subjectId: work.id,
      kind: "image", filename: `demo-${index + 1}.png`, contentType: "image/png", byteSize: png.length });
    if (!upload.upload) throw new Error("A new local upload reservation was not returned.");
    if (new URL(upload.upload.signedUrl).origin !== localOrigin(status.API_URL)) throw new Error("Refusing a nonlocal upload URL.");
    const sent = await anonymous.storage.from(upload.upload.bucket).uploadToSignedUrl(upload.upload.path,
      upload.upload.token, png, { contentType: "image/png" });
    if (sent.error) throw new Error("Could not upload the demo image to local Storage.");
    const material = await request(`/api/admin/uploads/${upload.material.id}/complete`, { expectedVersion: upload.material.version });
    work = await request(artPath + "/image", { expectedRevision: work.revision, materialId: material.id });
    const evidence = await request(artPath + "/evidence", { scope: "artwork", sourceLabel: "가상 시연 원고",
      body: fixture.text, source: { kind: "direct" } });
    await request(artPath + "/approvals", { kind: "evidence", evidenceId: evidence.id, version: evidence.version });
    work = await request(artPath + "/narration", { expectedRevision: work.revision, text: fixture.text }, "PATCH");
    await request(artPath + "/approvals", { kind: "narration", expectedRevision: work.revision,
      citations: [{ id: evidence.id, version: evidence.version }] });
    if (index === 0) {
      const introduction = await request(artPath + "/evidence", { scope: "exhibition", sourceLabel: "시연 전시 소개",
        body: "가상의 작가와 세 작품으로 구성한 로컬 개발 시연 전시입니다.", source: { kind: "direct" } });
      await request(artPath + "/approvals", { kind: "evidence", evidenceId: introduction.id, version: introduction.version });
      intro = { id: introduction.id, version: introduction.version };
    }
    // Generate one set in mock mode and approve one candidate per artwork (three total).
    const fresh = await request(artPath);
    const generated = await request(`/api/admin/exhibitions/${exhibitionId}/qa/generations`, {
      requestId: randomUUID(), artworkId: work.id, expectedRevision: fresh.revision,
      expectedDocumentRevision: fresh.document.revision,
    });
    if (generated.status !== "succeeded" || generated.mock !== true) throw new Error("Expected a successful mock QA generation.");
    const candidates = await request(`/api/admin/exhibitions/${exhibitionId}/qa?artworkId=${work.id}`);
    const candidate = candidates.find(item => generated.result.itemIds.includes(item.id));
    if (!candidate) throw new Error("Mock QA generation did not return a candidate.");
    const pins = [];
    for (const source of candidate.citations) {
      if (source.evidenceId) {
        pins.push({ id: source.evidenceId, version: source.version });
      } else {
        const excerpt = await request(artPath + "/evidence", { scope: source.scope, sourceLabel: "시연 Q&A 출처",
          body: source.body, source: { kind: "document", sourceDocumentId: source.sourceDocumentId,
            sourceSectionId: source.sectionId, sourceRevision: source.version } });
        await request(`/api/admin/evidence/${excerpt.id}/approve`, { version: excerpt.version });
        pins.push({ id: excerpt.id, version: excerpt.version });
      }
    }
    await request(`/api/admin/qa/${candidate.id}/approve`, { expectedVersion: candidate.version, evidencePins: pins });
    work = await request(artPath);
    works.push({ artworkId: work.id, expectedRevision: work.revision });
  }
  await request(`/api/admin/exhibitions/${exhibitionId}/publication`, { action: "publish", requestId: randomUUID(),
    expectedRevision: show.revision, artworks: works, intro: { bio: null, introduction: intro, theme: null } });
  const published = await request(`/api/public/exhibitions/${exhibitionId}`);
  if (published.artworks.length !== 3) throw new Error("The public demo does not contain three artworks.");
  for (const work of published.artworks) {
    const detail = await request(`/api/public/exhibitions/${exhibitionId}/artworks/${work.id}`);
    if (!detail.narrationText || !detail.image) throw new Error("The demo is missing approved narration or a public image.");
  }
  return result;
}

async function main() {
  loadAiEnv();
  const origin = process.env.DEMO_APP_ORIGIN || process.env.APP_ORIGIN || "http://localhost:3001";
  // Reject a remote app before even invoking local CLI status.
  localOrigin(origin);
  if (process.env.NODE_ENV === "production" || process.env.VERCEL_ENV === "production") throw new Error("Production demo seeding is forbidden.");
  const filename = process.env.DEMO_ENV_FILE || ".env.demo.local";
  if (!/^\.env\.demo(?:-[a-z0-9-]+)?\.local$/.test(filename)) throw new Error("DEMO_ENV_FILE must be a private .env.demo[-name].local file in this checkout.");
  const savedEnv = existsSync(filename) ? parseEnv(readFileSync(filename, "utf8")) : null;
  const saved = savedEnv && { email: savedEnv.DEMO_EMAIL, password: savedEnv.DEMO_PASSWORD, exhibitionId: savedEnv.DEMO_EXHIBITION_ID };
  if (saved && (!saved.email || !saved.password || !saved.exhibitionId)) throw new Error("The existing demo file is incomplete; preserve it and use a new DEMO_ENV_FILE.");
  const result = await seedDemo({ origin, status: localStatus(), saved,
    onAccount: account => writeFileSync(filename,
      `DEMO_EMAIL=${account.email}\nDEMO_PASSWORD=${account.password}\nDEMO_EXHIBITION_ID=${account.exhibitionId}\n`, { flag: "wx", mode: 0o600 }) });
  console.log(`${result.reused ? "Reused" : "Created"} local demo: ${localOrigin(origin)}${result.path}`);
  console.log(`Local login details are in ignored ${filename}. Mock QA only; no external model/TTS calls were made.`);
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(() => {
    console.error("Demo seed failed. Check the local mock server, FEATURE_VOICE_REQUIRED=false, FEATURE_EXPECTED_QA=true and local stack. Existing data is preserved; credentials, if created, remain in the ignored demo file. For an incomplete demo choose a new DEMO_ENV_FILE.");
    process.exitCode = 1;
  });
}
