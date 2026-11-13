import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { localStatus } from "../../../scripts/local-supabase.mjs";

const base = process.env.TEST_APP_ORIGIN || "http://localhost:3001";
assert.ok(["localhost", "127.0.0.1"].includes(new URL(base).hostname));

test("persistent narration jobs through real auth, RPC and mock AI", async t => {
  const status = localStatus();
  const admin = createClient(status.API_URL, status.SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  const jars = [new Map(), new Map()];
  const owners = [];
  async function request(path, body, { user = 0, method = body === undefined ? "GET" : "POST" } = {}) {
    const jar = jars[user];
    const response = await fetch(base + path, { method, headers: {
      Origin: base, "Content-Type": "application/json",
      Cookie: [...jar].map(([key, value]) => `${key}=${value}`).join("; "),
    }, body: body === undefined ? undefined : JSON.stringify(body) });
    for (const value of response.headers.getSetCookie()) {
      const [key, ...parts] = value.split(";")[0].split("=");
      jar.set(key, parts.join("="));
    }
    assert.match(response.headers.get("cache-control") || "", /no-store/);
    return { status: response.status, ...await response.json() };
  }
  for (let user = 0; user < 2; user++) {
    const account = { email: `jobs-${randomUUID()}@example.invalid`, password: randomUUID() + "A1!" };
    const created = await admin.auth.admin.createUser({ ...account, email_confirm: true });
    assert.equal(created.error, null); owners.push(created.data.user.id);
    assert.equal((await request("/api/auth/login", account, { user })).status, 200);
  }
  const exhibition = (await request("/api/admin/exhibitions", {
    id: randomUUID(), title: "작업 통합 검사", sections: [], sourceRefs: [],
  })).data;
  const artwork = (await request(`/api/admin/exhibitions/${exhibition.id}/artworks`, {
    id: randomUUID(), number: 18, title: "푸른 아침", sections: [{ id: "description", body: "이 작품은 아침의 푸른 빛을 표현한 유화입니다." }], sourceRefs: [],
  })).data;
  const path = `/api/admin/artworks/${artwork.id}`;
  const input = { requestId: randomUUID(), expectedRevision: artwork.revision,
    expectedDocumentRevision: artwork.document.revision, strategy: "best_of_two" };
  let job;
  await t.test("parallel duplicate requests claim once and expose only public job fields", async () => {
    const results = await Promise.all([1, 2].map(() => request(path + "/generations", input)));
    assert.deepEqual(results.map(r => r.status).sort(), [200, 201], JSON.stringify(results));
    assert.equal(results[0].data.id, results[1].data.id);
    job = (await request(`/api/admin/jobs/${results[0].data.id}`)).data;
    assert.equal(job.status, "succeeded", JSON.stringify(job));
    assert.equal(job.mock, true); assert.equal(job.result.mock, true);
    assert.equal(job.attempt, 1);
    assert.ok(job.result.selected.followUpQuestions.length <= 3);
    for (const key of ["steps", "usage", "sourceFingerprint", "sourceIds", "ownerId"]) assert.equal(key in job, false);
    assert.equal((await request(path)).data.narrationDraft, null);
    assert.equal((await request(path + "/generations", { ...input, strategy: "single" })).status, 409);
  });
  await t.test("job reads, retries and draft application are owner scoped", async () => {
    assert.equal((await request(`/api/admin/jobs/${job.id}`, undefined, { user: 1 })).status, 404);
    assert.equal((await request(`/api/admin/jobs/${job.id}/retry`, { requestId: randomUUID(), expectedAttempt: 1 }, { user: 1 })).status, 404);
    assert.equal((await request(path + "/generations", input, { user: 1 })).status, 404);
    assert.equal((await request(`/api/admin/jobs/${job.id}/retry`, { requestId: randomUUID(), expectedAttempt: 1 })).status, 409);
    const apply = { expectedRevision: artwork.revision, text: job.result.selected.answer, sourceJobId: job.id };
    assert.equal((await request(path + "/narration", apply, { method: "PATCH", user: 1 })).status, 404);
    assert.equal((await request(path + "/narration", apply, { method: "PATCH" })).status, 200);
    assert.equal((await request(path)).data.narrationDraft, apply.text);
    assert.equal((await request(path + "/narration", apply, { method: "PATCH" })).status, 409);
    assert.equal((await request(path + "/generations", input)).status, 200, "same ID replays even after applying the result");
  });
  await t.test("retry uses a new attempt, persists its result and is idempotent", async () => {
    const reserve = await admin.rpc("reserve_ai_job", {
      p_owner: owners[0], p_request_id: randomUUID(), p_artwork_id: artwork.id,
      p_expected_revision: artwork.revision + 1, p_expected_document_revision: artwork.document.revision,
      p_strategy: "single", p_mock: true,
    });
    assert.equal(reserve.error, null);
    const failedId = reserve.data.job.id;
    const failure = await admin.rpc("complete_ai_job", {
      p_owner: owners[0], p_job_id: failedId, p_attempt: 1,
      p_result: { status: "abstained", reason: "timeout", resultCode: "REQUEST_TIMEOUT", routing: "operator", mock: true },
    });
    assert.equal(failure.error, null);
    assert.equal((await request(`/api/admin/jobs/${failedId}`)).data.mock, true);
    const retry = { requestId: randomUUID(), expectedAttempt: 1 };
    const result = await request(`/api/admin/jobs/${failedId}/retry`, retry);
    assert.equal(result.status, 200, JSON.stringify(result));
    assert.equal(result.data.status, "succeeded"); assert.equal(result.data.attempt, 2);
    assert.deepEqual((await request(`/api/admin/jobs/${failedId}/retry`, retry)).data, result.data);
  });
  await t.test("empty knowledge abstains and is still explicitly marked mock", async () => {
    const empty = (await request(`/api/admin/exhibitions/${exhibition.id}/artworks`, {
      id: randomUUID(), number: 19, title: "자료 없는 작품", sections: [], sourceRefs: [],
    })).data;
    const result = await request(`/api/admin/artworks/${empty.id}/generations`, {
      requestId: randomUUID(), expectedRevision: 1, expectedDocumentRevision: 1,
    });
    assert.equal(result.status, 201, JSON.stringify(result));
    assert.equal(result.data.status, "abstained"); assert.equal(result.data.resultCode, "EVIDENCE_REQUIRED");
    assert.equal(result.data.mock, true); assert.equal(result.data.result, null);
  });
});
