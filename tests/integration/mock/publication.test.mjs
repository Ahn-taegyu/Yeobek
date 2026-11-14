import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { localStatus } from "../../../scripts/local-supabase.mjs";

const base = process.env.TEST_APP_ORIGIN || "http://localhost:3001";
assert.ok(["localhost", "127.0.0.1"].includes(new URL(base).hostname));

test("publish approved evidence and revoke its use across exhibitions through HTTP", async t => {
  const status = localStatus();
  const admin = createClient(status.API_URL, status.SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  const jars = [new Map(), new Map()];
  async function request(path, body, { user = 0, method = body === undefined ? "GET" : "POST", expected = 200 } = {}) {
    const jar = jars[user];
    const response = await fetch(base + path, { method, headers: {
      Origin: base, "Content-Type": "application/json",
      ...(jar ? { Cookie: [...jar].map(([key, value]) => `${key}=${value}`).join("; ") } : {}),
    }, body: body === undefined ? undefined : JSON.stringify(body) });
    if (jar) for (const value of response.headers.getSetCookie()) {
      const [key, ...parts] = value.split(";")[0].split("=");
      jar.set(key, parts.join("="));
    }
    assert.match(response.headers.get("cache-control") || "", /no-store/, path);
    const result = await response.json();
    assert.equal(response.status, expected, `${method} ${path}: ${result.error?.code ?? "unexpected status"}`);
    return expected < 400 ? result.data : result.error;
  }

  const owners = [];
  for (let user = 0; user < 2; user++) {
    const account = { email: `publication-${randomUUID()}@example.invalid`, password: randomUUID() + "A1!" };
    const created = await admin.auth.admin.createUser({ ...account, email_confirm: true });
    assert.equal(created.error, null);
    owners.push(created.data.user.id);
    await request("/api/auth/login", account, { user });
  }

  const excerpt = "종이와 수채 물감으로 작업합니다.";
  const privateTail = "비공개 작가 연락 기록입니다.";
  const unapprovedBody = "공개 승인 전 메모입니다.";
  const faqBody = "물감은 겹쳐 칠했습니다.";
  const profile = await request("/api/admin/profile");
  const savedProfile = await request("/api/admin/profile", {
    displayName: "전시 테스트 작가", expectedRevision: profile.revision, expectedDocumentRevision: profile.document.revision,
    sections: [{ id: "bio", body: `${excerpt} ${privateTail}` }], sourceRefs: [],
  }, { method: "PATCH" });

  async function makeExhibition(title) {
    return request("/api/admin/exhibitions", { id: randomUUID(), title,
      startDate: "2026-11-14", endDate: "2026-11-15", place: "검사 전시장",
      sections: [{ id: "introduction", body: "별도로 공개 승인하지 않은 전시 소개입니다." }], sourceRefs: [],
    }, { expected: 201 });
  }
  await t.test("checklist reports missing exhibition fields and blocks publication", async () => {
    const empty = await request("/api/admin/exhibitions", {
      id: randomUUID(), draft: true, title: null, sections: [], sourceRefs: [],
    }, { expected: 201 });
    const path = `/api/admin/exhibitions/${empty.id}/publication`;
    const checklist = await request(path);
    assert.deepEqual(checklist.exhibitionBlockingCodes, ["EXHIBITION_TITLE_REQUIRED",
      "EXHIBITION_PERIOD_REQUIRED", "EXHIBITION_PLACE_REQUIRED", "ARTWORK_REQUIRED"]);
    assert.deepEqual(checklist.artworks, []);
    await request(path, undefined, { user: 1, expected: 404 });
    const blocked = await request(path, { action: "publish", requestId: randomUUID(),
      expectedRevision: empty.revision, artworks: [], intro: { bio: null, introduction: null, theme: null },
    }, { expected: 409 });
    assert.equal(blocked.code, "PUBLICATION_BLOCKED");
    assert.deepEqual(blocked.fields.exhibition, checklist.exhibitionBlockingCodes);
  });
  const first = await makeExhibition("첫 전시");
  const second = await makeExhibition("둘째 전시");
  const exhibitionPath = id => `/api/admin/exhibitions/${id}`;
  const publicPath = id => `/api/public/exhibitions/${id}`;
  async function makeArtwork(exhibition, number, title) {
    return request(exhibitionPath(exhibition.id) + "/artworks", {
      id: randomUUID(), number, title, sections: [], sourceRefs: [],
    }, { expected: 201 });
  }
  const firstWork = await makeArtwork(first, 18, "첫 작품");
  const unready = await makeArtwork(first, 19, "준비 중인 작품");
  const secondWork = await makeArtwork(second, 18, "둘째 작품");
  const artworkPath = work => `/api/admin/artworks/${work.id}`;

  // W3 upload is not implemented. Supply only the image-ready database fixture.
  async function attachFixtureImage(work) {
    const id = randomUUID();
    const material = await admin.from("materials").insert({
      id, owner_id: owners[0], artwork_id: work.id, kind: "image", state: "ready",
      storage_key: `${owners[0]}/fixture/${id}.webp`, byte_size: 64,
    });
    assert.equal(material.error, null);
    const linked = await admin.from("artworks").update({ image_material_id: id }).eq("id", work.id).eq("owner_id", owners[0]);
    assert.equal(linked.error, null);
  }
  // W12: the first prepared work deliberately has no image.
  await attachFixtureImage(secondWork);

  const documentSource = { kind: "document", sourceDocumentId: savedProfile.document.id,
    sourceSectionId: "bio", sourceRevision: savedProfile.document.revision };
  const pin = evidence => ({ id: evidence.id, version: evidence.version });
  async function upsert(work, scope, body, source) {
    return request(artworkPath(work) + "/evidence", { scope, sourceLabel: "통합 검사 근거", body, source }, { expected: 201 });
  }
  async function approveEvidence(work, evidence) {
    const approved = await request(artworkPath(work) + "/approvals", {
      kind: "evidence", evidenceId: evidence.id, version: evidence.version,
    });
    assert.equal(approved.state, "approved");
  }
  async function prepare(work) {
    const saved = await request(artworkPath(work) + "/narration", {
      expectedRevision: work.revision, text: excerpt,
    }, { method: "PATCH" });
    const evidence = await upsert(work, "artist", excerpt, documentSource);
    assert.equal(evidence.state, "draft");
    assert.deepEqual(evidence.source, documentSource);
    await approveEvidence(work, evidence);
    const approval = await request(artworkPath(work) + "/approvals", {
      kind: "narration", expectedRevision: saved.revision, citations: [pin(evidence)],
    });
    assert.deepEqual(approval.citations, [pin(evidence)]);
    return { revision: saved.revision, evidence, approval };
  }
  const firstReady = await prepare(firstWork);
  const secondReady = await prepare(secondWork);
  const faq = await upsert(firstWork, "exhibition", faqBody, { kind: "direct" });
  await approveEvidence(firstWork, faq);
  const unapproved = await upsert(firstWork, "artwork", unapprovedBody, { kind: "direct" });

  const makePublish = (show, work, ready, bio = null) => ({
    action: "publish", requestId: randomUUID(), expectedRevision: show.revision,
    artworks: [{ artworkId: work.id, expectedRevision: ready.revision }],
    intro: { bio, introduction: null, theme: null },
  });
  const publishFirst = makePublish(first, firstWork, firstReady, pin(firstReady.evidence));
  let published;
  await t.test("one unready selection blocks the whole batch, then a prepared subset publishes once", async () => {
    const blocked = await request(exhibitionPath(first.id) + "/publication", { ...publishFirst,
      artworks: [...publishFirst.artworks, { artworkId: unready.id, expectedRevision: unready.revision }],
    }, { expected: 409 });
    assert.equal(blocked.code, "PUBLICATION_BLOCKED");
    assert.ok(blocked.fields[unready.id].includes("NARRATION_APPROVAL_REQUIRED"));
    await request(publicPath(first.id), undefined, { user: null, expected: 404 });
    const checklist = await request(exhibitionPath(first.id) + "/publication");
    assert.deepEqual(checklist.exhibitionBlockingCodes, []);
    assert.deepEqual(checklist.artworks.find(item => item.artworkId === firstWork.id).blockingCodes, []);
    assert.ok(checklist.artworks.find(item => item.artworkId === unready.id).blockingCodes.includes("NARRATION_APPROVAL_REQUIRED"));
    const review = await request(artworkPath(firstWork) + "/review");
    assert.deepEqual(review.blockingCodes, []);
    assert.equal(review.publication, null);
    assert.equal(review.evidence.find(item => item.id === unapproved.id).state, "draft");
    published = await request(exhibitionPath(first.id) + "/publication", publishFirst, { expected: 201 });
    assert.equal(published.state, "published");
    assert.deepEqual(await request(exhibitionPath(first.id) + "/publication", publishFirst), published);
    const publishedReview = await request(artworkPath(firstWork) + "/review");
    assert.equal(publishedReview.approval.id, firstReady.approval.id);
    assert.deepEqual(publishedReview.exhibitionPublicIntro, publishFirst.intro);
    assert.equal(publishedReview.publication.id, published.publications[0].publicationId);
  });

  await t.test("public reads show only approved display fields and fixed labels", async () => {
    const publicShow = await request(publicPath(first.id), undefined, { user: null });
    assert.equal(publicShow.artistBio, excerpt);
    assert.equal(publicShow.introduction, null);
    assert.deepEqual(publicShow.artworks.map(work => work.id), [firstWork.id]);
    assert.equal(JSON.stringify(publicShow).includes(privateTail), false);
    assert.equal(JSON.stringify(publicShow).includes(unapprovedBody), false);
    const workPath = `${publicPath(first.id)}/artworks/${firstWork.id}`;
    const publicWork = await request(workPath, undefined, { user: null });
    assert.equal(publicWork.narrationText, excerpt);
    assert.equal(publicWork.image, null, "image-free publication remains readable");
    assert.equal("imageKey" in publicWork, false);
    assert.equal("audioKey" in publicWork, false);
    await request(`${publicPath(first.id)}/artworks/${unready.id}`, undefined, { user: null, expected: 404 });
    const labels = await request(exhibitionPath(first.id) + "/labels");
    assert.equal(labels.path, `/exhibitions/${first.id}`);
    assert.deepEqual(labels.artworks, [{ artworkId: firstWork.id, number: 18, title: firstWork.title,
      path: `/exhibitions/${first.id}/artworks/${firstWork.id}` }]);
    await request(exhibitionPath(first.id) + "/labels", undefined, { user: 1, expected: 404 });
    await request(artworkPath(firstWork) + "/review", undefined, { user: 1, expected: 404 });
  });

  await t.test("pause and resume preserve the publication ID", async () => {
    const paused = await request(exhibitionPath(first.id) + "/publication", {
      action: "pause", expectedRevision: published.revision,
    });
    assert.equal(paused.state, "paused");
    await request(publicPath(first.id), undefined, { user: null, expected: 404 });
    const resumed = await request(exhibitionPath(first.id) + "/publication", {
      action: "resume", expectedRevision: paused.revision,
    });
    assert.equal(resumed.state, "published");
    const show = await request(publicPath(first.id), undefined, { user: null });
    assert.equal(show.artworks[0].publicationId, published.publications[0].publicationId);
  });

  await t.test("shared source revocation requires up-to-date impact and closes both exhibitions", async () => {
    const evidencePath = `/api/admin/evidence/${firstReady.evidence.id}`;
    const expectedVersion = firstReady.evidence.version;
    await request(evidencePath + "/impact", { expectedVersion }, { user: 1, expected: 404 });
    const originalImpact = await request(evidencePath + "/impact", { expectedVersion });
    assert.equal(originalImpact.exhibitions.length, 1);
    await request(exhibitionPath(second.id) + "/publication", makePublish(second, secondWork, secondReady), { expected: 201 });
    await request(evidencePath + "/revoke", { expectedVersion, impactToken: originalImpact.token }, { expected: 409 });
    const impact = await request(evidencePath + "/impact", { expectedVersion });
    assert.equal(impact.exhibitions.length, 2);
    assert.deepEqual(impact.exhibitions.find(item => item.exhibitionId === first.id),
      { exhibitionId: first.id, artworkIds: [firstWork.id], introAffected: true });
    assert.deepEqual(impact.exhibitions.find(item => item.exhibitionId === second.id),
      { exhibitionId: second.id, artworkIds: [secondWork.id], introAffected: false });
    await request(evidencePath + "/revoke", { expectedVersion, impactToken: impact.token }, { user: 1, expected: 404 });
    assert.deepEqual(await request(evidencePath + "/revoke", { expectedVersion, impactToken: impact.token }), impact);
    await request(publicPath(first.id), undefined, { user: null, expected: 404 });
    await request(publicPath(second.id), undefined, { user: null, expected: 404 });
    assert.deepEqual((await request(exhibitionPath(first.id) + "/labels")).artworks, []);
  });
});
