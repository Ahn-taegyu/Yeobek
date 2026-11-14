import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { localStatus } from "../../../scripts/local-supabase.mjs";

const base = process.env.TEST_APP_ORIGIN || "http://localhost:3001";
assert.ok(["localhost", "127.0.0.1"].includes(new URL(base).hostname));

test("private Q&A generation, approval, preview, correction and training over HTTP", async t => {
  const status = localStatus();
  const admin = createClient(status.API_URL, status.SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  const jars = [new Map(), new Map()];
  async function request(path, body, { user = 0, method = body === undefined ? "GET" : "POST", expected = 200 } = {}) {
    const jar = jars[user];
    const response = await fetch(base + path, { method, headers: { Origin: base, "Content-Type": "application/json",
      Cookie: [...jar].map(([key, value]) => `${key}=${value}`).join("; ") },
    body: body === undefined ? undefined : JSON.stringify(body) });
    for (const value of response.headers.getSetCookie()) {
      const [key, ...parts] = value.split(";")[0].split("="); jar.set(key, parts.join("="));
    }
    const result = await response.json();
    assert.match(response.headers.get("cache-control") || "", /private, no-store/);
    assert.equal(response.status, expected, `${method} ${path}: ${JSON.stringify(result)}`);
    return result.data;
  }
  if (process.env.TEST_QA_DISABLED_ONLY === "true") {
    for (const path of [`/api/admin/exhibitions/${randomUUID()}/qa/generations`,
      `/api/admin/exhibitions/${randomUUID()}/preview/chat`, "/api/admin/qa/rewrite",
      `/api/admin/exhibitions/${randomUUID()}/training`]) await request(path, {}, { expected: 404 });
    await request(`/api/admin/exhibitions/${randomUUID()}/training/latest`, undefined, { expected: 404 });
    return;
  }
  await request(`/api/admin/exhibitions/${randomUUID()}/training/latest`, undefined, { expected: 401 });
  for (let user = 0; user < 2; user++) {
    const account = { email: `qa-${randomUUID()}@example.invalid`, password: randomUUID() + "A1!" };
    assert.equal((await admin.auth.admin.createUser({ ...account, email_confirm: true })).error, null);
    await request("/api/auth/login", account, { user });
  }
  const exhibition = await request("/api/admin/exhibitions", { id: randomUUID(), title: "Q&A 검수 전시",
    sections: [{ id: "introduction", body: "전시는 푸른 아침의 변화를 다룹니다." }], sourceRefs: [] }, { expected: 201 });
  const artwork = await request(`/api/admin/exhibitions/${exhibition.id}/artworks`, { id: randomUUID(), number: 18,
    title: "푸른 아침", sections: [{ id: "description", body: "푸른 아침의 빛을 유화로 표현했습니다." }], sourceRefs: [] }, { expected: 201 });
  await request("/api/admin/qa/corrections", { targetKind: "gap", targetId: randomUUID(), targetVersion: null,
    requestId: randomUUID(), sourceLabel: "관람 질문", sourceBody: "이번 범위에서는 전환하지 않습니다." }, { expected: 400 });
  await request("/api/admin/qa/rewrite", { targetKind: "gap", targetId: randomUUID(), targetVersion: null,
    requestId: randomUUID(), instruction: "답해 주세요.", evidencePins: [{ id: randomUUID(), version: 1 }] }, { expected: 400 });
  const path = `/api/admin/exhibitions/${exhibition.id}`;
  const latestPath = path + "/training/latest";
  const listPath = path + `/qa?artworkId=${artwork.id}`;
  const pin = evidence => ({ id: evidence.id, version: evidence.version });
  let candidate;
  await t.test("generation replays once, private candidates retain exact excerpts and foreign owners are denied", async () => {
    const input = { requestId: randomUUID(), artworkId: artwork.id, expectedRevision: artwork.revision,
      expectedDocumentRevision: artwork.document.revision };
    const job = await request(path + "/qa/generations", input, { expected: 201 });
    assert.equal(job.status, "succeeded"); assert.equal(job.mock, true);
    assert.ok(job.result.itemIds.length <= 3);
    assert.deepEqual(await request(path + "/qa/generations", input), job);
    await request(`/api/admin/qa/jobs/${job.id}`, undefined, { user: 1, expected: 404 });
    await request(listPath, undefined, { user: 1, expected: 404 });
    candidate = (await request(listPath))[0];
    assert.equal(candidate.state, "draft"); assert.equal(candidate.citations[0].body, artwork.document.sections[0].body);
    assert.equal((await request(`/api/admin/artworks/${artwork.id}`)).narrationDraft, null);
  });
  await t.test("new exact approved evidence can approve a generated candidate without changing its source revision", async () => {
    const source = candidate.citations[0];
    const evidence = await request(`/api/admin/artworks/${artwork.id}/evidence`, { scope: source.scope,
      sourceLabel: "작품 원문", body: source.body, source: { kind: "document", sourceDocumentId: source.sourceDocumentId,
        sourceSectionId: source.sectionId, sourceRevision: source.version } }, { expected: 201 });
    await request(`/api/admin/evidence/${evidence.id}/approve`, { version: evidence.version }, { user: 1, expected: 404 });
    await request(`/api/admin/evidence/${evidence.id}/approve`, { version: evidence.version });
    const approved = await request(`/api/admin/qa/${candidate.id}/approve`, { expectedVersion: candidate.version, evidencePins: [pin(evidence)] });
    assert.equal(approved.state, "approved");
    assert.equal((await request(`/api/admin/qa/${candidate.id}/withdraw`, { expectedVersion: candidate.version })).state, "withdrawn");
  });
  await t.test("exhibition evidence and Q&A work without an artwork-specific approval route", async () => {
    const evidence = await request(path + "/evidence", { scope: "exhibition", sourceLabel: "전시 설명",
      body: "전시는 푸른 아침의 변화를 다룹니다.", source: { kind: "direct" } }, { expected: 201 });
    await request(`/api/admin/evidence/${evidence.id}/approve`, { version: evidence.version });
    const fresh = await request(path);
    const job = await request(path + "/qa/generations", { requestId: randomUUID(), artworkId: null,
      expectedRevision: fresh.revision, expectedDocumentRevision: fresh.document.revision }, { expected: 201 });
    assert.equal(job.status, "succeeded"); assert.ok(job.result.itemIds.length <= 5);
    const item = (await request(path + "/qa"))[0];
    assert.equal((await request(`/api/admin/qa/${item.id}/approve`, {
      expectedVersion: item.version, evidencePins: [pin(evidence)] })).state, "approved");
  });
  await t.test("preview rating never approves and factual correction requires approved evidence before rewrite", async () => {
    const preview = await request(path + "/preview/chat", { requestId: randomUUID(), artworkId: artwork.id,
      question: "푸른 아침을 어떻게 표현했나요?" }, { expected: 201 });
    assert.equal(preview.status, "succeeded");
    await request(`/api/admin/preview/${preview.id}`, undefined, { user: 1, expected: 404 });
    const evaluation = { requestId: randomUUID(), rating: "accurate" };
    assert.deepEqual(await request(`/api/admin/preview/${preview.id}/evaluations`, evaluation),
      await request(`/api/admin/preview/${preview.id}/evaluations`, evaluation));
    assert.equal((await request(listPath))[0].state, "withdrawn");
    const origin = { targetKind: "preview", targetId: preview.id, targetVersion: null };
    const corrected = await request("/api/admin/qa/corrections", { ...origin, requestId: randomUUID(),
      sourceLabel: "작가 정정", sourceBody: "파란색은 새벽의 차분함을 표현하기 위해 사용했습니다." });
    assert.equal(corrected.state, "draft");
    await request(`/api/admin/evidence/${corrected.id}/approve`, { version: corrected.version });
    const rewritten = await request("/api/admin/qa/rewrite", { ...origin, requestId: randomUUID(),
      instruction: "승인한 정정 이유를 반영해 주세요.", evidencePins: [pin(corrected)] }, { expected: 201 });
    assert.equal(rewritten.status, "succeeded"); assert.equal(rewritten.targetId, preview.id);
    const item = (await request(listPath)).find(row => row.id === rewritten.result.itemIds[0]);
    assert.equal(item.state, "draft"); assert.equal(item.answer, corrected.body);
    assert.equal((await request(`/api/admin/qa/${item.id}/approve`, { expectedVersion: item.version,
      evidencePins: [pin(corrected)] })).state, "approved");
  });
  await t.test("training creation and GET do no model work; each explicit run persists one target and replays safely", async () => {
    assert.equal(await request(latestPath), null);
    await request(latestPath, undefined, { user: 1, expected: 404 });
    await request(`/api/admin/exhibitions/${randomUUID()}/training/latest`, undefined, { expected: 404 });
    const fresh = await request(path);
    const batch = await request(path + "/training", { requestId: randomUUID(), expectedRevision: fresh.revision });
    assert.deepEqual(await request(latestPath), batch);
    assert.equal(batch.status, "queued"); assert.equal(batch.targets.length, 3);
    assert.ok(batch.targets.every(target => target.jobId === null));
    assert.deepEqual(await request(`/api/admin/training/${batch.id}`), batch);
    await request(`/api/admin/training/${batch.id}`, undefined, { user: 1, expected: 404 });
    let current;
    for (const target of batch.targets) {
      const input = { requestId: randomUUID(), expectedAttempt: 0 };
      const runPath = `/api/admin/training/${batch.id}/targets/${target.id}/run`;
      current = await request(runPath, input);
      assert.equal(current.targets.find(row => row.id === target.id).status, "succeeded");
      assert.deepEqual(await request(runPath, input), current);
    }
    assert.equal(current.status, "completed");
    assert.deepEqual(await request(latestPath), current);
    const newer = await request(path + "/training", { requestId: randomUUID(), expectedRevision: fresh.revision });
    assert.notEqual(newer.id, batch.id);
    assert.deepEqual(await request(latestPath), newer);
    assert.equal((await request(`/api/admin/artworks/${artwork.id}`)).narrationDraft, null);
  });
});
