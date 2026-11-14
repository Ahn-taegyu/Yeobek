import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { createClient } from "@supabase/supabase-js";
import { localStatus } from "../../scripts/local-supabase.mjs";

const origin = process.env.TEST_APP_ORIGIN || "http://localhost:3000";
assert.ok(["localhost", "127.0.0.1"].includes(new URL(origin).hostname), "Tests must use a local app.");

function browser() {
  const jar = new Map();
  return async (path, { method = "GET", body, expected = 200 } = {}) => {
    const response = await fetch(origin + path, {
      method,
      headers: {
        Origin: new URL(origin).origin,
        "Content-Type": "application/json",
        Cookie: [...jar].map(([name, value]) => `${name}=${value}`).join("; "),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const cookies = response.headers.getSetCookie();
    if (path === "/api/auth/login") assert.ok(cookies.length, "Login must set a cookie.");
    for (const cookie of cookies) {
      const [name, ...value] = cookie.split(";")[0].split("=");
      if (value.join("=")) jar.set(name, value.join("="));
      else jar.delete(name);
    }
    const json = await response.json();
    assert.equal(response.status, expected, `${method} ${path}: ${json.error?.code}`);
    return response.ok ? json.data : json.error;
  };
}

test("artist onboarding, private author images, and dashboard counts", async () => {
  const status = localStatus();
  const admin = createClient(status.API_URL, status.SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  const storage = createClient(status.API_URL, status.ANON_KEY, { auth: { persistSession: false } }).storage;
  const guest = browser();
  async function signIn() {
    const credentials = { email: `onboarding-${randomUUID()}@example.invalid`, password: randomUUID() + "A1!" };
    const created = await admin.auth.admin.createUser({ ...credentials, email_confirm: true });
    assert.equal(created.error, null);
    const request = browser();
    await request("/api/auth/login", { method: "POST", body: credentials });
    return { request, email: credentials.email, ownerId: created.data.user.id };
  }
  const { request: artist, email, ownerId } = await signIn();
  const { request: other } = await signIn();
  const profilePath = "/api/admin/profile";
  const avatarPath = profilePath + "/avatar";
  const onboardingPath = profilePath + "/onboarding";
  const exhibitionsPath = "/api/admin/exhibitions";
  const profile = await artist(profilePath);
  const otherProfile = await other(profilePath);
  const legacy = await artist(profilePath, {
    method: "PATCH",
    body: {
      expectedRevision: profile.revision, expectedDocumentRevision: profile.document.revision,
      displayName: "기존 작가명", sections: [{ id: "bio", body: "기존 작가 소개" }],
      sourceRefs: [{ kind: "direct", sectionId: "bio" }],
    },
  });
  const patch = (request, path, body, expected = 200) => request(path, { method: "PATCH", body, expected });
  const draftInput = {
    expectedRevision: legacy.revision, fullName: null, displayName: "여백", complete: false,
    keywords: { fields: ["사진", "설치미술"], moods: ["차분한"], topics: ["자연"] },
  };
  await patch(guest, onboardingPath, draftInput, 401);
  const draft = await patch(artist, onboardingPath, draftInput);
  assert.equal(draft.onboardingComplete, false);
  assert.equal(draft.onboardingCompletedAt, null);
  assert.equal(draft.fullName, null);
  assert.deepEqual(draft.document, legacy.document);

  const completeInput = { ...draftInput, expectedRevision: draft.revision, fullName: " 홍길동 ", complete: true };
  assert.equal((await patch(artist, onboardingPath, { ...completeInput, email }, 400)).code, "INVALID_INPUT");
  const complete = await patch(artist, onboardingPath, completeInput);
  assert.equal(complete.fullName, "홍길동");
  assert.equal(complete.displayName, "여백");
  assert.deepEqual(complete.keywords, completeInput.keywords);
  assert.equal(complete.onboardingComplete, true);
  assert.ok(Number.isFinite(Date.parse(complete.onboardingCompletedAt)));
  assert.deepEqual(complete.document, legacy.document);
  assert.equal((await patch(artist, onboardingPath, completeInput, 409)).code, "REVISION_CONFLICT");
  assert.deepEqual(await artist(profilePath), { ...complete, accountEmail: email });

  const show = await artist(exhibitionsPath, {
    method: "POST", expected: 201,
    body: { id: randomUUID(), title: "비공개 종료 전시", startDate: "2000-01-01", endDate: "2000-01-02", sections: [], sourceRefs: [] },
  });
  const posterPath = `${exhibitionsPath}/${show.id}/poster`;
  assert.equal(show.periodState, "ended");
  assert.equal(show.dashboardStatus, "preparing");

  const png = await sharp({ create: { width: 4, height: 3, channels: 3, background: "blue" } }).png().toBuffer();
  async function uploadImage(subjectType, subjectId) {
    const id = randomUUID();
    const { upload } = await artist("/api/admin/uploads", {
      method: "POST", expected: 201,
      body: { id, subjectType, subjectId, kind: "image", filename: "author-image.png", contentType: "image/png", byteSize: png.length },
    });
    const sent = await storage.from(upload.bucket).uploadToSignedUrl(upload.path, upload.token, png, { contentType: "image/png" });
    assert.equal(sent.error, null);
    const material = await artist(`/api/admin/uploads/${id}/complete`, { method: "POST", body: { expectedVersion: 1 } });
    assert.equal(material.state, "ready");
    assert.equal(material.width, 4);
    return material;
  }
  const avatar = await uploadImage("artist", complete.id);
  const poster = await uploadImage("exhibition", show.id);
  await patch(other, avatarPath, { expectedRevision: otherProfile.revision, materialId: avatar.id }, 404);
  await patch(other, posterPath, { expectedRevision: show.revision, materialId: poster.id }, 404);
  await patch(artist, avatarPath, { expectedRevision: complete.revision, materialId: poster.id }, 404);
  await patch(artist, posterPath, { expectedRevision: show.revision, materialId: avatar.id }, 404);

  const withAvatar = await patch(artist, avatarPath, { expectedRevision: complete.revision, materialId: avatar.id });
  assert.equal(withAvatar.avatarMaterialId, avatar.id);
  const withPoster = await patch(artist, posterPath, { expectedRevision: show.revision, materialId: poster.id });
  assert.equal(withPoster.posterMaterialId, poster.id);
  const list = await artist(exhibitionsPath);
  assert.deepEqual(list.counts, { all: 1, preparing: 1, ongoing: 0, ended: 0 });
  assert.deepEqual(list.items, [{ ...withPoster, artworkCount: 0 }]);
  await guest(`/api/public/exhibitions/${show.id}`, { expected: 404 });

  for (const { material, path, resource, field } of [
    { material: avatar, path: avatarPath, resource: withAvatar, field: "avatarMaterialId" },
    { material: poster, path: posterPath, resource: withPoster, field: "posterMaterialId" },
  ]) {
    const materialPath = `/api/admin/materials/${material.id}`;
    await guest(`/api/media/${material.id}?kind=image`, { expected: 404 });
    assert.ok((await storage.from("artist-materials").download(`${ownerId}/materials/${material.id}/v1.png`)).error);
    const deleteMaterial = expected => artist(materialPath, { method: "DELETE", body: { expectedVersion: material.version }, expected });
    assert.equal((await deleteMaterial(409)).code, "MATERIAL_IN_USE");
    const detached = await patch(artist, path, { expectedRevision: resource.revision, materialId: null });
    assert.equal(detached[field], null);
    assert.equal((await deleteMaterial(200)).state, "revoked");
  }
});
