import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { localStatus } from "../../../scripts/local-supabase.mjs";

const base = process.env.TEST_APP_ORIGIN || "http://localhost:3001";
assert.ok(["localhost", "127.0.0.1"].includes(new URL(base).hostname));

test("author organization proposals retain reviewed history through actual HTTP and DB", async t => {
  const status = localStatus();
  const admin = createClient(status.API_URL, status.SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  const jars = [new Map(), new Map()];
  const owners = [];
  async function request(path, body, { user = 0, method = body === undefined ? "GET" : "POST" } = {}) {
    const jar = jars[user];
    const response = await fetch(base + path, { method, headers: {
      Origin: base, "Content-Type": "application/json", Cookie: [...jar].map(([key, value]) => `${key}=${value}`).join("; "),
    }, body: body === undefined ? undefined : JSON.stringify(body) });
    for (const value of response.headers.getSetCookie()) {
      const [key, ...parts] = value.split(";")[0].split("="); jar.set(key, parts.join("="));
    }
    assert.match(response.headers.get("cache-control") || "", /no-store/);
    return { status: response.status, ...await response.json() };
  }
  for (let user = 0; user < 2; user++) {
    const account = { email: `proposals-${randomUUID()}@example.invalid`, password: randomUUID() + "A1!" };
    const created = await admin.auth.admin.createUser({ ...account, email_confirm: true });
    assert.equal(created.error, null); owners.push(created.data.user.id);
    assert.equal((await request("/api/auth/login", account, { user })).status, 200);
  }
  const exhibition = (await request("/api/admin/exhibitions", { id: randomUUID(), title: "정리 이력 검사",
    sections: [{ id: "introduction", body: "시간과 빛을 다루는 전시입니다." }], sourceRefs: [{ kind: "direct", sectionId: "introduction" }] })).data;
  const artwork = (await request(`/api/admin/exhibitions/${exhibition.id}/artworks`, { id: randomUUID(), number: 18, title: "아침",
    sections: [{ id: "description", body: "푸른 빛을 표현했습니다." }], sourceRefs: [{ kind: "direct", sectionId: "description" }] })).data;
  const docPath = `/api/admin/knowledge/${artwork.document.id}`;
  const input = { requestId: randomUUID(), expectedDocumentRevision: artwork.document.revision };
  let proposalId;

  await t.test("parallel request replay creates one candidate without changing the document", async () => {
    const responses = await Promise.all([request(docPath + "/proposals", input), request(docPath + "/proposals", input)]);
    assert.deepEqual(responses.map(r => r.status).sort(), [200, 201], JSON.stringify(responses));
    assert.equal(responses[0].data.id, responses[1].data.id);
    const job = (await request(`/api/admin/jobs/${responses[0].data.id}`)).data;
    assert.equal(job.kind, "organize"); assert.equal(job.status, "succeeded", JSON.stringify(job));
    assert.equal(job.mock, true); proposalId = job.result.proposalId;
    assert.equal((await request(docPath)).data.revision, artwork.document.revision);
    const review = (await request(`/api/admin/proposals/${proposalId}`)).data;
    assert.deepEqual(review.before.sections, artwork.document.sections);
    assert.equal(review.proposed.sections[0].body, "푸른 빛을 표현했습니다.\n\n시간과 빛을 다루는 전시입니다.");
    assert.equal(review.changes.length, 1); assert.equal(review.mock, true);
    for (const key of ["ownerId", "sourcePins", "selection", "pluginVersion", "steps", "usage"]) assert.equal(key in review, false);
    assert.equal((await request(docPath + "/proposals", { ...input, expectedDocumentRevision: input.expectedDocumentRevision + 1 })).status, 409);
  });
  await t.test("foreign access and unreviewed application are denied", async () => {
    assert.equal((await request(`/api/admin/proposals/${proposalId}`, undefined, { user: 1 })).status, 404);
    assert.equal((await request(`/api/admin/proposals/${proposalId}/apply`, { reviewed: true }, { user: 1 })).status, 404);
    assert.equal((await request(docPath + "/history", undefined, { user: 1 })).status, 404);
    assert.equal((await request(`/api/admin/proposals/${proposalId}/apply`, { reviewed: false })).status, 400);
  });
  await t.test("apply replays once and exposes the immutable prior body and source references", async () => {
    const applied = await request(`/api/admin/proposals/${proposalId}/apply`, { reviewed: true });
    assert.equal(applied.status, 200, JSON.stringify(applied));
    assert.deepEqual(applied.data, { documentRevision: artwork.document.revision + 1 });
    assert.deepEqual((await request(`/api/admin/proposals/${proposalId}/apply`, { reviewed: true })).data, applied.data);
    const history = (await request(docPath + "/history?limit=1")).data;
    assert.equal(history.items.length, 1); assert.equal(history.nextBeforeRevision, null);
    assert.deepEqual(history.items[0].sections, artwork.document.sections);
    assert.deepEqual(history.items[0].sourceRefs, artwork.document.sourceRefs);
    assert.equal((await request(docPath + "/proposals", input)).status, 200);
  });
  await t.test("artist and exhibition contexts work, no-op does not create history, stale source blocks apply", async () => {
    const profile = (await request("/api/admin/profile")).data;
    const empty = await request(`/api/admin/knowledge/${profile.document.id}/proposals`, {
      requestId: randomUUID(), expectedDocumentRevision: profile.document.revision,
    });
    assert.equal(empty.status, 201, JSON.stringify(empty)); assert.equal(empty.data.status, "abstained");
    const candidate = await request(`/api/admin/knowledge/${exhibition.document.id}/proposals`, {
      requestId: randomUUID(), expectedDocumentRevision: exhibition.document.revision,
    });
    assert.equal(candidate.status, 201, JSON.stringify(candidate)); assert.equal(candidate.data.status, "succeeded");
    const unchanged = await request(`/api/admin/proposals/${candidate.data.result.proposalId}/apply`, { reviewed: true });
    assert.deepEqual(unchanged.data, { documentRevision: exhibition.document.revision });
    assert.deepEqual((await request(`/api/admin/knowledge/${exhibition.document.id}/history`)).data.items, []);
    const current = (await request(docPath)).data;
    const stale = await request(docPath + "/proposals", { requestId: randomUUID(), expectedDocumentRevision: current.revision });
    assert.equal(stale.data.status, "succeeded", JSON.stringify(stale));
    assert.equal((await request(`/api/admin/knowledge/${exhibition.document.id}`, {
      expectedRevision: exhibition.document.revision, sections: [{ id: "introduction", body: "새로운 전시 설명입니다." }], sourceRefs: [],
    }, { method: "PATCH" })).status, 200);
    assert.equal((await request(`/api/admin/proposals/${stale.data.result.proposalId}/apply`, { reviewed: true })).status, 409);
  });
  await t.test("cancelled jobs retry through the shared API and remain request-idempotent", async () => {
    const current = (await request(docPath)).data;
    const reserved = await admin.rpc("reserve_organize_job", { p_owner: owners[0], p_request_id: randomUUID(),
      p_document_id: current.id, p_expected_document_revision: current.revision, p_mock: true });
    assert.equal(reserved.error, null);
    const id = reserved.data.job.id;
    const cancelled = await admin.rpc("complete_organize_job", { p_owner: owners[0], p_job_id: id, p_attempt: 1,
      p_result: { proposal: null, resultCode: "REQUEST_CANCELLED", routing: "none", usage: [], steps: [], elapsedMs: 0, mock: true } });
    assert.equal(cancelled.error, null); assert.equal(cancelled.data.status, "cancelled");
    const retry = { requestId: randomUUID(), expectedAttempt: 1 };
    const result = await request(`/api/admin/jobs/${id}/retry`, retry);
    assert.equal(result.status, 200, JSON.stringify(result)); assert.equal(result.data.attempt, 2);
    assert.equal(result.data.status, "succeeded", JSON.stringify(result));
    assert.deepEqual((await request(`/api/admin/jobs/${id}/retry`, retry)).data, result.data);
  });
});
