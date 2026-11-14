import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { localStatus } from "../../../scripts/local-supabase.mjs";

const origin = process.env.TEST_APP_ORIGIN || "http://localhost:3001";
assert.ok(["localhost", "127.0.0.1"].includes(new URL(origin).hostname));
function browser() {
  const jar = new Map();
  const ip = "2001:db8:" + randomUUID().replaceAll("-", "").match(/.{4}/g).slice(0, 6).join(":");
  return async (path, body, { method = body === undefined ? "GET" : "POST", expected, binary = false } = {}) => {
    const response = await fetch(origin + path, { method, headers: { Origin: origin, "Content-Type": "application/json",
      "x-forwarded-for": ip, Cookie: [...jar].map(([k, v]) => `${k}=${v}`).join("; ") },
      body: body === undefined ? undefined : JSON.stringify(body) });
    for (const cookie of response.headers.getSetCookie()) {
      const [key, ...value] = cookie.split(";")[0].split("="); jar.set(key, value.join("="));
    }
    assert.match(response.headers.get("cache-control") || "", /no-store/);
    if (binary && response.ok) {
      assert.equal(response.headers.get("x-yeobek-mock"), "true");
      assert.equal(response.headers.get("content-type"), "audio/mpeg");
      return new Uint8Array(await response.arrayBuffer());
    }
    const json = await response.json();
    if (expected) assert.equal(response.status, expected, `${method} ${path}: ${json.error?.code || "unexpected status"}`);
    else assert.ok(response.ok, `${method} ${path}: ${response.status} ${json.error?.code || "unexpected status"}`);
    return response.ok ? json.data : json.error;
  };
}

test("mock acceptance: signup, verify, login, authoring, generation, review, publish, visitor and TTS", async () => {
  const mailOrigin = localStatus().MAILPIT_URL;
  assert.ok(mailOrigin && ["localhost", "127.0.0.1"].includes(new URL(mailOrigin).hostname));
  const artist = browser(), visitor = browser();
  const email = `full-flow-${randomUUID()}@example.invalid`, password = randomUUID() + "A1!", signupRequestId = randomUUID();
  await artist("/api/auth/signup", { email, password, passwordConfirmation: password, requestId: signupRequestId }, { expected: 202 });
  await artist("/api/auth/login", { email, password }, { expected: 401 });
  let code;
  for (let attempt = 0; attempt < 30 && !code; attempt++) {
    const list = await (await fetch(`${mailOrigin}/api/v1/messages?limit=100`)).json();
    const message = list.messages.find(item => item.To?.some(recipient => recipient.Address === email));
    if (message) {
      const full = await (await fetch(`${mailOrigin}/api/v1/message/${message.ID}`)).json();
      code = full.HTML?.match(/<strong>\s*(\d{6})\s*<\/strong>/i)?.[1];
    }
    if (!code) await new Promise(resolve => setTimeout(resolve, 100));
  }
  assert.ok(code, "local signup email arrived without an external mail provider");
  await artist("/api/auth/verify", { email, code, signupRequestId, requestId: randomUUID() });
  assert.deepEqual(await artist("/api/auth/session"), { authenticated: false });
  await artist("/api/auth/login", { email, password });
  const profile = await artist("/api/admin/profile");
  await artist("/api/admin/profile/onboarding", { expectedRevision: profile.revision, fullName: "가상 통합 작가",
    displayName: "통합 작가", keywords: { fields: ["서양화"], moods: ["차분한"], topics: ["자연"] }, complete: true }, { method: "PATCH" });
  const show = await artist("/api/admin/exhibitions", { id: randomUUID(), title: "통합 시연 전시", startDate: "2026-11-14",
    endDate: "2026-11-15", place: "가상 전시장", sections: [{ id: "introduction", body: "가상 작품을 감상하는 전시입니다." }], sourceRefs: [] });
  const ep = `/api/admin/exhibitions/${show.id}`;
  let work = await artist(ep + "/artworks", { id: randomUUID(), number: 1, title: "아침의 여백",
    sections: [{ id: "description", body: "아침의 여백은 종이에 수채 물감으로 푸른 아침을 표현했습니다." }], sourceRefs: [] });
  const ap = `/api/admin/artworks/${work.id}`;
  const publicPath = `/api/public/exhibitions/${show.id}`;
  await visitor(publicPath, undefined, { expected: 404 });
  const generated = await artist(ap + "/generations", { requestId: randomUUID(), expectedRevision: work.revision,
    expectedDocumentRevision: work.document.revision, strategy: "single" });
  assert.equal(generated.status, "succeeded"); assert.equal(generated.mock, true);
  assert.equal((await artist(ap)).narrationDraft, null, "generation never applies or approves automatically");
  work = await artist(ap + "/narration", { expectedRevision: work.revision, text: generated.result.selected.answer, sourceJobId: generated.id }, { method: "PATCH" });
  const evidence = await artist(ap + "/evidence", { scope: "artwork", sourceLabel: "작가 입력 원문", body: work.document.sections[0].body,
    source: { kind: "document", sourceDocumentId: work.document.id, sourceSectionId: "description", sourceRevision: work.document.revision } });
  const pin = { id: evidence.id, version: evidence.version };
  await artist(`/api/admin/evidence/${evidence.id}/approve`, { version: evidence.version });
  await artist(ap + "/approvals", { kind: "narration", expectedRevision: work.revision, citations: [pin] });
  const qaJob = await artist(ep + "/qa/generations", { requestId: randomUUID(), artworkId: work.id,
    expectedRevision: work.revision, expectedDocumentRevision: work.document.revision });
  assert.equal(qaJob.status, "succeeded"); assert.equal(qaJob.mock, true);
  const listPath = ep + `/qa?artworkId=${work.id}`;
  const qa = (await artist(listPath))[0];
  assert.equal(qa.state, "draft");
  const pins = [];
  for (const source of qa.citations) {
    if (source.evidenceId) pins.push({ id: source.evidenceId, version: source.version });
    else {
      const excerpt = await artist(ap + "/evidence", { scope: source.scope, sourceLabel: "Q&A 출처", body: source.body,
        source: { kind: "document", sourceDocumentId: source.sourceDocumentId, sourceSectionId: source.sectionId, sourceRevision: source.version } });
      await artist(`/api/admin/evidence/${excerpt.id}/approve`, { version: excerpt.version });
      pins.push({ id: excerpt.id, version: excerpt.version });
    }
  }
  await artist(`/api/admin/qa/${qa.id}/approve`, { expectedVersion: qa.version, evidencePins: pins });
  const preview = await artist(ep + "/preview/chat", { requestId: randomUUID(), artworkId: work.id, question: "수채 물감으로 표현했나요?" });
  assert.equal(preview.status, "succeeded");
  await artist(`/api/admin/preview/${preview.id}/evaluations`, { requestId: randomUUID(), rating: "needs_revision" });
  const rewritten = await artist("/api/admin/qa/rewrite", { targetKind: "preview", targetId: preview.id, targetVersion: null,
    requestId: randomUUID(), instruction: "승인한 재료 정보를 간결하게 설명해 주세요.", evidencePins: [pin] });
  assert.equal(rewritten.status, "succeeded");
  const revised = (await artist(listPath)).find(item => item.id === rewritten.result.itemIds[0]);
  assert.equal(revised.state, "draft", "instruction rewrite returns to review");
  await artist(`/api/admin/qa/${revised.id}/approve`, { expectedVersion: revised.version, evidencePins: [pin] });
  await visitor(publicPath, undefined, { expected: 404 });
  work = await artist(ap);
  const checklist = await artist(ep + "/publication");
  assert.deepEqual(checklist.exhibitionBlockingCodes, []);
  assert.deepEqual(checklist.artworks[0].blockingCodes, []);
  const published = await artist(ep + "/publication", { action: "publish", requestId: randomUUID(), expectedRevision: show.revision,
    artworks: [{ artworkId: work.id, expectedRevision: work.revision }], intro: { bio: null, introduction: null, theme: null } });
  const publicShow = await visitor(publicPath);
  assert.equal(publicShow.artistDisplayName, "통합 작가"); assert.equal(publicShow.artworks.length, 1);
  const publicWork = await visitor(publicPath + `/artworks/${work.id}`);
  assert.equal(publicWork.image, null); assert.equal(publicWork.audio, null);
  assert.equal(publicWork.narrationText, generated.result.selected.answer);
  const chat = { requestId: randomUUID(), exhibitionId: show.id, artworkId: null, question: "아침의 여백은 어떤 재료인가요?",
    contextSequence: 1, inputMode: "text", outputMode: "text" };
  const answer = await visitor("/api/chat", chat);
  assert.equal(answer.outcome, "answered"); assert.equal(answer.source, "generated");
  assert.equal(answer.publication.artworkId, work.id); assert.equal(answer.image, null);
  assert.deepEqual(await visitor("/api/chat", chat), answer);
  const speechInput = { requestId: randomUUID(), answerId: answer.answerId };
  const speech = await visitor("/api/speech", speechInput, { binary: true });
  assert.ok(speech.length > 4); assert.deepEqual(await visitor("/api/speech", speechInput, { binary: true }), speech);
  await artist(ep + "/publication", { action: "pause", expectedRevision: published.revision });
  await visitor(publicPath, undefined, { expected: 404 });
  await visitor("/api/speech", { ...speechInput, requestId: randomUUID() }, { expected: 404 });
});
