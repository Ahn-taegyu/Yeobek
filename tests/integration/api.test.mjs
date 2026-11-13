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
    const unauthenticated = await request("/api/admin/profile", { user: null });
    assert.equal(unauthenticated.status, 401);
    assert.equal(unauthenticated.error.code, "UNAUTHENTICATED");
    assert.equal((await request("/api/auth/login", { method: "POST", origin: "https://evil.invalid", body: accounts[0] })).status, 403);
    const invalid = await request("/api/auth/login", { method: "POST", body: { ...accounts[0], password: "wrong-password" } });
    assert.equal(invalid.status, 401);
    assert.equal(invalid.error.code, "INVALID_CREDENTIALS");
  });
  for (let index = 0; index < 2; index++) {
    assert.equal((await request("/api/auth/login", { method: "POST", user: index, body: accounts[index] })).status, 200);
  }
  const profile = (await request("/api/admin/profile")).data;
  const otherProfile = (await request("/api/admin/profile", { user: 1 })).data;
  assert.notEqual(profile.id, otherProfile.id);
  assert.equal(profile.accountEmail, accounts[0].email);
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
    const conflict = await request("/api/admin/exhibitions", { method: "POST", body: { ...exhibitionInput, title: "다른 요청" } });
    assert.equal(conflict.status, 409);
    assert.equal(conflict.error.code, "REQUEST_ID_CONFLICT");
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
    const duplicate = await request("/api/admin/exhibitions/" + id + "/artworks", { method: "POST", body: { ...workInput, id: randomUUID() } });
    assert.equal(duplicate.status, 409);
    assert.equal(duplicate.error.code, "DUPLICATE_NUMBER");
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
  await t.test("invalid dates and invisible or NUL inputs return field errors", async () => {
    for (const fields of [
      { startDate: "0000-01-01", endDate: "0000-01-02" },
      { startDate: "2026-02-30", endDate: "2026-03-01" },
      { title: "\u0000작품" }, { title: "\u200b" },
      { sections: [{ id: "introduction", body: "\u0000" }] },
    ]) {
      const result = await request("/api/admin/exhibitions", { method: "POST", body: { ...exhibitionInput, id: randomUUID(), ...fields } });
      assert.equal(result.status, 400);
      assert.equal(result.error.code, "INVALID_INPUT");
      assert.equal(result.error.retryable, false);
      assert.ok(Object.keys(result.error.fields).length > 0);
    }
  });
  await t.test("exhibition updates, lists and optional profile names follow the editor contract", async () => {
    const path = "/api/admin/exhibitions/" + id;
    let current = (await request(path)).data;
    const body = { title: "수정 전시", startDate: "2026-11-13", endDate: "2026-11-15", place: " 전시장 ",
      expectedRevision: current.revision, expectedDocumentRevision: current.document.revision,
      sections: current.document.sections, sourceRefs: current.document.sourceRefs };
    const saved = await request(path, { method: "PATCH", body });
    assert.equal(saved.status, 200); current = saved.data;
    assert.equal(current.place, "전시장");
    assert.equal(current.startDate, body.startDate);
    assert.equal(current.endDate, body.endDate);
    assert.equal(current.document.revision, body.expectedDocumentRevision);
    const cleared = await request(path, { method: "PATCH", body: { title: current.title,
      expectedRevision: current.revision, expectedDocumentRevision: current.document.revision,
      sections: current.document.sections, sourceRefs: current.document.sourceRefs } });
    assert.equal(cleared.status, 200);
    for (const key of ["place", "startDate", "endDate"]) assert.equal(cleared.data[key], null);
    const exhibitions = await request("/api/admin/exhibitions");
    assert.equal(exhibitions.status, 200);
    assert.equal(exhibitions.data.items.find(item => item.id === id).artworkCount, 1);
    const works = await request(path + "/artworks");
    assert.equal(works.status, 200);
    assert.equal(works.data.items[0].id, workId);
    for (const name of [undefined, "   "]) {
      const p = (await request("/api/admin/profile")).data;
      const result = await request("/api/admin/profile", { method: "PATCH", body: {
        displayName: name, expectedRevision: p.revision, expectedDocumentRevision: p.document.revision,
        sections: p.document.sections, sourceRefs: p.document.sourceRefs,
      } });
      assert.equal(result.status, 200);
      assert.equal(result.data.displayName, null);
    }
  });
  await t.test("saved sources warn without blocking edits; new or changed sources still validate", async () => {
    const parent = (await request("/api/admin/profile")).data.document;
    const source = { sectionId: "description", kind: "document", sourceDocumentId: parent.id,
      sourceSectionId: "bio", sourceRevision: parent.revision };
    const path = "/api/admin/artworks/" + workId;
    async function saveWork(current, refs, title = current.title) {
      return request(path, { method: "PATCH", body: { number: current.number, title,
        expectedRevision: current.revision, expectedDocumentRevision: current.document.revision,
        sections: current.document.sections, sourceRefs: refs } });
    }
    let current = (await request(path)).data;
    const linked = await saveWork(current, [source]);
    assert.equal(linked.status, 200); current = linked.data;
    const changed = await request("/api/admin/knowledge/" + parent.id, { method: "PATCH", body: {
      expectedRevision: parent.revision, sections: [{ id: "bio", body: " 새 작가 소개 \n" }], sourceRefs: [] } });
    assert.equal(changed.status, 200);
    assert.equal(changed.data.sections[0].body, "새 작가 소개");
    const renamed = await saveWork(current, [source], "출처를 보존한 새 제목");
    assert.equal(renamed.status, 200);
    assert.equal(renamed.data.document.revision, current.document.revision);
    assert.equal(renamed.data.document.sourceWarnings[0].code, "source_changed");
    assert.equal(renamed.data.document.sourceWarnings[0].sourceSectionId, "bio");
    assert.equal(renamed.data.document.sourceWarnings[0].currentRevision, changed.data.revision);
    assert.deepEqual(renamed.data.document.sourceRefs, [source]);
    const freshSource = { ...source, sourceRevision: changed.data.revision };
    const refreshed = await saveWork(renamed.data, [freshSource]);
    assert.equal(refreshed.status, 200); current = refreshed.data;
    assert.deepEqual(current.document.sourceWarnings, []);
    const stale = await saveWork(current, [source]);
    assert.equal(stale.status, 409);
    assert.equal(stale.error.code, "SOURCE_REVISION_CONFLICT");
    const removed = await request("/api/admin/knowledge/" + parent.id, { method: "PATCH", body: {
      expectedRevision: changed.data.revision, sections: [], sourceRefs: [] } });
    assert.equal(removed.status, 200);
    const retained = await saveWork(current, [freshSource], "사라진 출처는 재검토 필요");
    assert.equal(retained.status, 200);
    assert.equal(retained.data.document.sourceWarnings[0].code, "source_unavailable");
    const unavailable = await request("/api/admin/exhibitions/" + id + "/artworks", { method: "POST", body: {
      ...workInput, id: randomUUID(), number: 19, sourceRefs: [freshSource] } });
    assert.equal(unavailable.status, 400);
    assert.equal(unavailable.error.code, "SOURCE_UNAVAILABLE");
  });
  await t.test("logout invalidates the browser cookie session", async () => {
    assert.equal((await request("/api/auth/logout", { method: "POST", body: {} })).status, 200);
    assert.equal((await request("/api/admin/profile")).status, 401);
  });
});
