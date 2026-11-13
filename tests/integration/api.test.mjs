import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { localStatus } from "../../scripts/local-supabase.mjs";

const base = process.env.TEST_APP_ORIGIN || "http://localhost:3000";
assert.ok(["127.0.0.1", "localhost"].includes(new URL(base).hostname), "Tests must use a local app.");

test("real cookie auth, owner isolation, draft CRUD, revisions and publication gates", async t => {
  const status = localStatus();
  const admin = createClient(status.API_URL, status.SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  const users = [];
  const accounts = [];
  // Unique fixtures are left in this disposable database; cleanup uses db reset, never remote deletion.
  for (let index = 0; index < 2; index++) {
    const email = "test-" + randomUUID() + "@example.invalid";
    const password = randomUUID() + "A1!";
    const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    assert.equal(error, null, "create a local test account");
    users.push(data.user.id);
    accounts.push({ email, password });
  }
  const jars = [new Map(), new Map()];
  async function request(path, { method = "GET", body, user = 0, origin = base } = {}) {
    const jar = user === null ? new Map() : jars[user];
    const headers = { Cookie: [...jar].map(([key, value]) => key + "=" + value).join("; ") };
    if (method !== "GET") { headers.Origin = origin; headers["Content-Type"] = "application/json"; }
    const response = await fetch(base + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    if (path === "/api/auth/login" && response.ok) {
      const cookies = response.headers.getSetCookie();
      assert.ok(cookies.length > 0, "login sets a cookie session");
      for (const cookie of cookies) {
        assert.match(cookie, /; HttpOnly/i);
        assert.match(cookie, /; SameSite=Lax/i);
      }
    }
    for (const value of response.headers.getSetCookie()) {
      const [name, ...rest] = value.split(";")[0].split("=");
      const cookie = rest.join("=");
      if (!cookie) jar.delete(name); else jar.set(name, cookie);
    }
    const json = await response.json();
    assert.match(response.headers.get("cache-control") || "", /no-store/);
    return { status: response.status, ...json };
  }
  await t.test("health and request guards", async () => {
    assert.equal((await request("/api/health")).status, 200);
    assert.equal((await request("/api/admin/profile", { user: null })).status, 401);
    assert.equal((await request("/api/auth/login", { method: "POST", origin: "https://evil.invalid", body: accounts[0] })).status, 403);
  });
  for (let index = 0; index < 2; index++) {
    assert.equal((await request("/api/auth/login", { method: "POST", user: index, body: accounts[index] })).status, 200);
  }
  const profile = (await request("/api/admin/profile")).data;
  const otherProfile = (await request("/api/admin/profile", { user: 1 })).data;
  assert.notEqual(profile.id, otherProfile.id);
  const profileInput = { displayName: "테스트 작가", expectedRevision: profile.revision, expectedDocumentRevision: profile.document.revision,
    sections: [{ id: "bio", body: "작가가 작성한 소개" }], sourceRefs: [] };
  await t.test("profile saves atomically and rejects stale versions", async () => {
    assert.equal((await request("/api/admin/profile", { method: "PATCH", body: profileInput })).status, 200);
    assert.equal((await request("/api/admin/profile", { method: "PATCH", body: profileInput })).status, 409);
  });
  const id = randomUUID();
  const exhibitionInput = { id, title: "테스트 전시", sections: [{ id: "introduction", body: "줄바꿈\n따옴표 \"와\" 역슬래시 \\" }], sourceRefs: [] };
  let exhibition;
  await t.test("parallel duplicate creates are idempotent and private", async () => {
    const results = await Promise.all([1, 2].map(() => request("/api/admin/exhibitions", { method: "POST", body: exhibitionInput })));
    assert.deepEqual(results.map(r => r.status).sort(), [200, 201]);
    exhibition = results[0].data;
    assert.equal(exhibition.document.subjectType, "exhibition");
    assert.equal("_created" in exhibition, false);
    assert.equal((await request("/api/admin/exhibitions", { method: "POST", body: { ...exhibitionInput, title: "다른 요청" } })).status, 409);
    assert.equal((await request("/api/public/exhibitions/" + id, { user: null })).status, 404);
    assert.equal((await request("/api/admin/exhibitions/" + id, { user: 1 })).status, 404);
    assert.equal((await request("/api/admin/exhibitions", { method: "POST", body: { ...exhibitionInput, ownerId: users[1] } })).status, 400);
  });
  const workId = randomUUID();
  const workInput = { id: workId, number: 18, title: "작품 18", sections: [{ id: "description", body: "작가가 남긴 작품 설명" }], sourceRefs: [] };
  let artwork;
  await t.test("artwork number and owner scope are enforced", async () => {
    const created = await request("/api/admin/exhibitions/" + id + "/artworks", { method: "POST", body: workInput });
    assert.equal(created.status, 201); artwork = created.data;
    assert.equal((await request("/api/admin/exhibitions/" + id + "/artworks", { method: "POST", body: workInput })).status, 200);
    assert.equal((await request("/api/admin/exhibitions/" + id + "/artworks", { method: "POST", body: { ...workInput, id: randomUUID() } })).status, 409);
    assert.equal((await request("/api/admin/artworks/" + workId, { user: 1 })).status, 404);
    assert.equal((await request("/api/admin/knowledge/" + artwork.document.id, { user: 1 })).status, 404);
    assert.equal((await request("/api/public/exhibitions/" + id + "/artworks/" + workId, { user: null })).status, 404);
  });
  await t.test("independent document updates invalidate an old combined save", async () => {
    const path = "/api/admin/knowledge/" + artwork.document.id;
    const changed = await request(path, { method: "PATCH", body: { expectedRevision: artwork.document.revision,
      sections: [{ id: "description", body: "수정한 설명" }], sourceRefs: [] } });
    assert.equal(changed.status, 200);
    const { id: ignoredId, ...fields } = workInput;
    void ignoredId;
    const stale = await request("/api/admin/artworks/" + workId, { method: "PATCH", body: {
      ...fields, title: "저장되면 안 되는 제목", expectedRevision: artwork.revision, expectedDocumentRevision: artwork.document.revision,
    } });
    assert.equal(stale.status, 409);
    const current = (await request("/api/admin/artworks/" + workId)).data;
    assert.equal(current.title, "작품 18");
    assert.equal(current.document.sections[0].body, "수정한 설명");
  });
  await t.test("logout invalidates the browser cookie session", async () => {
    assert.equal((await request("/api/auth/logout", { method: "POST", body: {} })).status, 200);
    assert.equal((await request("/api/admin/profile")).status, 401);
  });
});
