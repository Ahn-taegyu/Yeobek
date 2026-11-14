import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { localStatus } from "../../scripts/local-supabase.mjs";

const base = process.env.TEST_APP_ORIGIN || "http://localhost:3000";
assert.ok(["127.0.0.1", "localhost"].includes(new URL(base).hostname), "Tests must use a local app.");

test("P0 authoring preserves partial drafts, revision guards and owner scope", async t => {
  const status = localStatus();
  const admin = createClient(status.API_URL, status.SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  const jars = [new Map(), new Map()];
  async function request(path, { method = "GET", body, user = 0 } = {}) {
    const jar = user === null ? new Map() : jars[user];
    const headers = { Cookie: [...jar].map(([key, value]) => key + "=" + value).join("; ") };
    if (method !== "GET") {
      headers.Origin = base;
      headers["Content-Type"] = "application/json";
    }
    const response = await fetch(base + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    for (const value of response.headers.getSetCookie()) {
      const [name, ...rest] = value.split(";")[0].split("=");
      const cookie = rest.join("=");
      if (cookie) jar.set(name, cookie); else jar.delete(name);
    }
    assert.match(response.headers.get("cache-control") || "", /no-store/);
    return { status: response.status, ...await response.json() };
  }
  const post = (path, body, user) => request(path, { method: "POST", body, user });
  const patch = (path, body, user) => request(path, { method: "PATCH", body, user });
  for (let user = 0; user < jars.length; user++) {
    const email = "authoring-" + randomUUID() + "@example.invalid";
    const password = randomUUID() + "A1!";
    const { error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    assert.equal(error, null);
    assert.equal((await post("/api/auth/login", { email, password }, user)).status, 200);
    assert.ok(jars[user].size, "login sets the cookie session");
  }

  const blankDocument = { sections: [], sourceRefs: [] };
  const exhibitionId = randomUUID();
  const exhibitions = "/api/admin/exhibitions";
  const exhibitionPath = exhibitions + "/" + exhibitionId;
  const artworkList = exhibitionPath + "/artworks";
  const reorder = artworkList + "/reorder";
  const advance = exhibitionPath + "/advance";
  const draft = { draft: true, ...blankDocument };
  const revisions = resource => ({ expectedRevision: resource.revision, expectedDocumentRevision: resource.document.revision });
  let exhibition;
  let artworks;

  await t.test("saves and retrieves all seven artist questions in a document over 64 KiB", async () => {
    const profilePath = "/api/admin/profile";
    const current = await request(profilePath);
    assert.equal(current.status, 200);
    assert.equal(current.data.artWorldRegistered, false);
    const ids = ["bio", "practice", "artist_motivation", "artist_interests", "artist_philosophy",
      "artist_methods", "artist_method_reason", "artist_inspiration", "artist_audience"];
    const sections = ids.map((id, index) => ({ id, body: String(index) + "가".repeat(3000) }));
    const input = { ...blankDocument, ...revisions(current.data), sections };
    assert.ok(Buffer.byteLength(JSON.stringify(input)) > 64 * 1024);
    const wrongSubject = await patch(profilePath, { ...input, sections: [{ id: "artwork_process", body: "다른 범위" }] });
    assert.equal(wrongSubject.status, 400);
    const saved = await patch(profilePath, input);
    assert.equal(saved.status, 200);
    const read = await request(profilePath);
    assert.equal(read.status, 200);
    assert.equal(read.data.artWorldRegistered, true);
    assert.deepEqual(read.data.document.sections, sections);
    assert.equal((await patch(profilePath, input)).status, 409);
    const other = await request(profilePath, { user: 1 });
    assert.equal(other.status, 200);
    assert.equal(other.data.artWorldRegistered, false);
  });

  await t.test("keeps incomplete and reversed-period drafts and gates the two advances", async () => {
    const legacy = await post(exhibitions, { id: exhibitionId, ...blankDocument });
    assert.equal(legacy.status, 400);
    const anonymous = await post(exhibitions, { id: exhibitionId, ...draft }, null);
    assert.equal(anonymous.status, 401);
    const created = await post(exhibitions, { id: exhibitionId, ...draft, startDate: "2027-02-17" });
    assert.equal(created.status, 201);
    exhibition = created.data;
    assert.equal(typeof exhibition.title, "string");
    assert.equal(exhibition.draftTitle, null);
    assert.equal(exhibition.authoringStep, "basic");
    assert.equal(exhibition.startDate, "2027-02-17");
    assert.equal(exhibition.endDate, null);
    const list = await request(exhibitions);
    assert.equal(list.status, 200);
    const listed = list.data.items.find(item => item.id === exhibitionId);
    assert.ok(listed);
    const { artworkCount, ...listedDraft } = listed;
    assert.equal(artworkCount, 0);
    assert.deepEqual(listedDraft, exhibition);
    const read = await request(exhibitionPath);
    assert.equal(read.status, 200);
    assert.deepEqual(read.data, exhibition);

    const incomplete = await post(advance, { expectedRevision: exhibition.revision, step: "world" });
    assert.equal(incomplete.status, 200);
    assert.equal(incomplete.data.advanced, false);
    assert.equal(incomplete.data.exhibition.revision, exhibition.revision);
    assert.ok(incomplete.data.blockers.some(blocker => blocker.code === "TITLE_REQUIRED" && blocker.field === "title"));

    const basicFields = { title: "테스트 전시", startDate: "2027-02-17", endDate: "2027-02-16",
      startTime: "10:00", endTime: "18:00", place: "테스트 전시장" };
    const reverse = await patch(exhibitionPath, { ...draft, ...basicFields, ...revisions(exhibition) });
    assert.equal(reverse.status, 200);
    exhibition = reverse.data;
    assert.equal(exhibition.startDate, basicFields.startDate);
    assert.equal(exhibition.endDate, basicFields.endDate);
    const reverseGate = await post(advance, { expectedRevision: exhibition.revision, step: "world" });
    assert.equal(reverseGate.status, 200);
    assert.equal(reverseGate.data.advanced, false);
    assert.ok(reverseGate.data.blockers.some(blocker => blocker.code === "INVALID_PERIOD"));
    const repaired = await patch(exhibitionPath, { ...draft, ...basicFields, ...revisions(exhibition), endDate: "2027-02-18" });
    assert.equal(repaired.status, 200);
    exhibition = repaired.data;
    assert.equal(exhibition.draftTitle, basicFields.title);
    assert.equal(exhibition.startTime, basicFields.startTime);
    assert.equal(exhibition.endTime, basicFields.endTime);

    for (const step of ["world", "artworks"]) {
      const moved = await post(advance, { expectedRevision: exhibition.revision, step });
      assert.equal(moved.status, 200);
      assert.equal(moved.data.advanced, true);
      assert.deepEqual(moved.data.blockers, []);
      exhibition = moved.data.exhibition;
      assert.equal(exhibition.authoringStep, step);
      assert.deepEqual(exhibition.document.sections, [], "optional world answers can stay empty");
    }
  });

  await t.test("assigns draft numbers and reorders drafts without changing legacy numbers", async () => {
    artworks = [];
    for (const [index, dimensionsUnit] of ["cm", "mm"].entries()) {
      const input = { id: randomUUID(), ...draft, sections: [{ id: "artwork_process", body: "제작 과정 " + index }], dimensionsUnit };
      const created = await post(artworkList, input);
      assert.equal(created.status, 201);
      assert.equal(typeof created.data.number, "number");
      assert.equal(created.data.draftTitle, null);
      assert.equal(created.data.dimensionsUnit, dimensionsUnit);
      assert.equal(created.data.draftNumber, index + 1);
      artworks.push(created.data);
    }
    const items = [...artworks].reverse().map(({ id, revision }) => ({ id, expectedRevision: revision }));
    const reordered = await post(reorder, { items });
    assert.equal(reordered.status, 200);
    assert.deepEqual(reordered.data.items.map(({ id, draftNumber }) => [id, draftNumber]),
      [[artworks[1].id, 1], [artworks[0].id, 2]]);
    for (const item of reordered.data.items) {
      assert.equal(item.number, artworks.find(artwork => artwork.id === item.id).number);
    }
    assert.equal((await post(reorder, { items })).status, 409);
    const list = await request(artworkList);
    assert.equal(list.status, 200);
    assert.deepEqual(list.data.items, reordered.data.items);
    artworks = reordered.data.items;
  });

  await t.test("guards combined saves against source changes and denies cross-owner operations", async () => {
    const artwork = artworks[0];
    const artworkPath = "/api/admin/artworks/" + artwork.id;
    const documentPath = "/api/admin/knowledge/" + artwork.document.id;
    const sections = [{ id: "artwork_process", body: "변경된 작품 자료입니다." }];
    const changed = await patch(documentPath, { ...blankDocument, expectedRevision: artwork.document.revision, sections });
    assert.equal(changed.status, 200);
    const stale = await patch(artworkPath, { ...draft, ...revisions(artwork), title: "덮어쓰면 안 되는 작품명" });
    assert.equal(stale.status, 409);
    const current = await request(artworkPath);
    assert.equal(current.status, 200);
    assert.equal(current.data.draftTitle, null);
    assert.deepEqual(current.data.document.sections, sections);
    const items = artworks.map(({ id, revision }) => ({ id, expectedRevision: revision }));
    const forbidden = [
      await request(exhibitionPath, { user: 1 }),
      await patch(exhibitionPath, { ...draft, ...revisions(exhibition) }, 1),
      await post(advance, { expectedRevision: exhibition.revision, step: "world" }, 1),
      await request(artworkPath, { user: 1 }),
      await patch(artworkPath, { ...draft, ...revisions(artwork) }, 1),
      await post(artworkList, { ...draft, id: randomUUID() }, 1),
      await post(reorder, { items }, 1),
    ];
    for (const response of forbidden) assert.equal(response.status, 404, JSON.stringify(response));
    assert.equal((await post(reorder, { items }, null)).status, 401);
    assert.equal((await post(advance, { expectedRevision: exhibition.revision, step: "world" }, null)).status, 401);
  });
});
