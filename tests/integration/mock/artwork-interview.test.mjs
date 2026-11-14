import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { test } from "node:test";
import { createClient } from "@supabase/supabase-js";
import sharp from "sharp";
import { localStatus } from "../../../scripts/local-supabase.mjs";

const origin = process.env.TEST_APP_ORIGIN || "http://localhost:3001";
assert.ok(["localhost", "127.0.0.1"].includes(new URL(origin).hostname));
const disabled = process.env.TEST_INTERVIEW_DISABLED_ONLY === "true";

function browser() {
  const cookies = new Map();
  return async (path, { method = "GET", body, status = 200 } = {}) => {
    const response = await fetch(origin + path, { method, headers: {
      Origin: origin, "Content-Type": "application/json", Cookie: [...cookies].map(pair => pair.join("=")).join("; "),
    }, body: body === undefined ? undefined : JSON.stringify(body) });
    for (const value of response.headers.getSetCookie()) {
      const [name, ...content] = value.split(";")[0].split("=");
      cookies.set(name, content.join("="));
    }
    const result = await response.json();
    assert.equal(response.status, status, `${method} ${path}: ${result.error?.code}`);
    assert.match(response.headers.get("Cache-Control") ?? "", /no-store/);
    return result.data;
  };
}

test("interviews use owned images, keep answers private and require explicit approval", async () => {
  const artist = browser(), other = browser();
  const missing = `/api/admin/artworks/${randomUUID()}/interview`;
  const mutation = { method: "POST", body: { requestId: randomUUID() } };
  const skip = { method: "PATCH", body: { action: "skip", expectedVersion: 1 } };
  if (disabled) {
    await artist(missing, { status: 404 });
    await artist(missing + "/generations", { ...mutation, status: 404 });
    await artist(missing + "/answers/" + randomUUID(), { ...skip, status: 404 });
    return;
  }
  const workdir = process.env.TEST_INTERVIEW_SUPABASE_WORKDIR;
  const config = workdir ? JSON.parse(execFileSync(process.execPath,
    ["node_modules/supabase/dist/supabase.js", "status", "--workdir", workdir, "-o", "json"],
    { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] })) : localStatus();
  assert.ok(["localhost", "127.0.0.1"].includes(new URL(config.API_URL).hostname));
  const auth = { persistSession: false };
  const admin = createClient(config.API_URL, config.SERVICE_ROLE_KEY, { auth });
  const storage = createClient(config.API_URL, config.ANON_KEY, { auth });
  for (const login of [artist, other]) {
    const account = { email: `interview-${randomUUID()}@example.invalid`, password: randomUUID() + "A1!" };
    assert.equal((await admin.auth.admin.createUser({ ...account, email_confirm: true })).error, null);
    await login("/api/auth/login", { method: "POST", body: account });
  }
  const profile = await artist("/api/admin/profile");
  await artist("/api/admin/profile/onboarding", { method: "PATCH", body: {
    expectedRevision: profile.revision, fullName: "가상 인터뷰 작가", displayName: "인터뷰 작가",
    keywords: { fields: ["서양화"], moods: ["차분한"], topics: ["자연"] }, complete: true,
  } });
  let exhibition = await artist("/api/admin/exhibitions", {
    method: "POST", status: 201, body: { id: randomUUID(), title: "인터뷰 전시", draft: true,
      startDate: "2026-11-14", endDate: "2026-11-15", startTime: "09:30", endTime: "18:00", place: "가상 전시장",
      sections: [{ id: "introduction", body: "인터뷰 작품을 감상하는 전시입니다." }], sourceRefs: [] },
  });
  const artwork = await artist(`/api/admin/exhibitions/${exhibition.id}/artworks`, {
    method: "POST", status: 201, body: { id: randomUUID(), title: "푸른 원", number: 1, draft: true,
      sections: [{ id: "description", body: "푸른 원을 그린 작품입니다." }], sourceRefs: [] },
  });
  const artworkPath = `/api/admin/artworks/${artwork.id}`;
  const interview = artworkPath + "/interview";
  assert.equal((await artist(interview)).imageReady, false);
  const photo = await sharp({ create: { width: 100, height: 80, channels: 3, background: "blue" } }).png().toBuffer();
  const imageId = randomUUID();
  const { upload } = await artist("/api/admin/uploads", { method: "POST", status: 201, body: {
    id: imageId, subjectId: artwork.id, subjectType: "artwork", kind: "image",
    filename: "작품.png", byteSize: photo.length, contentType: "image/png",
  } });
  assert.equal((await storage.storage.from(upload.bucket).uploadToSignedUrl(upload.path, upload.token, photo, { contentType: "image/png" })).error, null);
  await artist(`/api/admin/uploads/${imageId}/complete`, { method: "POST", body: { expectedVersion: 1 } });
  await artist(artworkPath + "/image", { method: "POST", body: { expectedRevision: artwork.revision, materialId: imageId } });

  await other(interview, { status: 404 });
  await other(interview + "/generations", { ...mutation, status: 404 });
  const concurrent = await Promise.all([
    artist(interview + "/generations", mutation),
    artist(interview + "/generations", mutation),
  ]);
  const generated = concurrent.find(result => result.job.status === "succeeded");
  assert.ok(generated);
  assert.equal(new Set(concurrent.map(result => result.job.id)).size, 1);
  assert.equal(generated.job.status, "succeeded");
  assert.equal(generated.questions.length, 5);
  assert.deepEqual(await artist(interview + "/generations", mutation), generated);
  await artist(`/api/admin/jobs/${generated.job.id}`, { status: 404 });
  const [question] = generated.questions;
  const answerPath = interview + "/answers/" + question.id;
  await other(answerPath, { ...skip, status: 404 });
  const answer = "자연에서 얻은 안료로 색을 만들었습니다.";
  const draft = await artist(answerPath, { method: "PATCH", body: { action: "save", expectedVersion: question.version, answer } });
  const saved = draft.questions[0];
  assert.equal(saved.status, "answered");
  assert.equal(saved.answer, answer);
  await artist(answerPath, { method: "PATCH", status: 409, body: { action: "approve", expectedVersion: question.version } });
  const reviewed = await artist(answerPath, { method: "PATCH", body: { action: "approve", expectedVersion: saved.version } });
  assert.equal(reviewed.questions[0].status, "approved");
  assert.equal(reviewed.questions[0].evidenceId, saved.evidenceId);
  await other(interview, { status: 404 });
  const publicPath = `/api/public/exhibitions/${exhibition.id}/artworks/${artwork.id}`;
  await other(publicPath, { status: 404 });
  const pending = generated.questions[1];
  const privateAnswer = "이 문장은 공개 승인하지 않은 검증용 답변입니다.";
  await artist(interview + "/answers/" + pending.id, {
    method: "PATCH", body: { action: "save", expectedVersion: pending.version, answer: privateAnswer },
  });
  const latest = await artist(artworkPath);
  const narration = await artist(artworkPath + "/narration", { method: "PATCH", body: {
    expectedRevision: latest.revision, text: answer,
  } });
  await artist(artworkPath + "/approvals", { method: "POST", body: {
    kind: "narration", expectedRevision: narration.revision, citations: [{ id: saved.evidenceId, version: 1 }],
  } });
  for (const step of ["world", "artworks"]) {
    const result = await artist(`/api/admin/exhibitions/${exhibition.id}/advance`, {
      method: "POST", body: { expectedRevision: exhibition.revision, step },
    });
    assert.equal(result.advanced, true);
    exhibition = result.exhibition;
  }
  const checklist = await artist(`/api/admin/exhibitions/${exhibition.id}/publication`);
  assert.deepEqual(checklist.exhibitionBlockingCodes, []);
  assert.deepEqual(checklist.artworks[0].blockingCodes, []);
  await artist(`/api/admin/exhibitions/${exhibition.id}/publication`, { method: "POST", status: 201, body: {
    action: "publish", requestId: randomUUID(), expectedRevision: exhibition.revision,
    artworks: [{ artworkId: artwork.id, expectedRevision: narration.revision }],
    intro: { bio: null, introduction: null, theme: null },
  } });
  const publicView = await other(publicPath);
  assert.equal(publicView.narrationText, answer);
  assert.ok(!JSON.stringify(publicView).includes(privateAnswer));
  for (const item of generated.questions) assert.ok(!JSON.stringify(publicView).includes(item.question));
});
