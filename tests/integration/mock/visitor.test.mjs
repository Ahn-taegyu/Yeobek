import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";
import { localStatus } from "../../../scripts/local-supabase.mjs";

const origin = process.env.TEST_APP_ORIGIN || "http://localhost:3001";
const disabledOnly = process.env.TEST_GAPS_DISABLED_ONLY === "true";
const disabledOrigin = disabledOnly ? origin : process.env.TEST_GAPS_DISABLED_ORIGIN;
for (const base of [origin, disabledOrigin].filter(Boolean)) {
  assert.ok(["localhost", "127.0.0.1"].includes(new URL(base).hostname));
}

function browser(base, networkIp) {
  const jar = new Map();
  const fixtureIp = networkIp ?? "2001:db8:" + randomUUID().replaceAll("-", "").match(/.{4}/g).slice(0, 6).join(":");
  return async function request(path, body, { method = body === undefined ? "GET" : "POST", expected = 200, binary = false } = {}) {
    const multipart = body instanceof FormData;
    const response = await fetch(base + path, { method, headers: {
      "x-forwarded-for": fixtureIp, Origin: base, ...(multipart ? {} : { "Content-Type": "application/json" }),
      Cookie: [...jar].map(([key, value]) => `${key}=${value}`).join("; "),
    }, body: body === undefined ? undefined : multipart ? body : JSON.stringify(body) });
    for (const value of response.headers.getSetCookie()) {
      const [key, ...parts] = value.split(";")[0].split("=");
      if (key === "yeobek_visitor") {
        assert.match(value, /;\s*HttpOnly/i);
        assert.match(value, /;\s*SameSite=Strict/i);
      }
      jar.set(key, parts.join("="));
    }
    assert.match(response.headers.get("cache-control") || "", /no-store/, path);
    if (binary && expected < 400) {
      assert.equal(response.status, expected, path);
      assert.equal(response.headers.get("content-type"), "audio/mpeg");
      assert.equal(response.headers.get("x-content-type-options"), "nosniff");
      assert.equal(response.headers.get("x-yeobek-mock"), "true");
      return new Uint8Array(await response.arrayBuffer());
    }
    const result = await response.json();
    assert.equal(response.status, expected, `${method} ${path}: ${result.error?.code ?? "unexpected status"}`);
    return expected < 400 ? result.data : result.error;
  };
}

test("visitor chat through real publication, cookie sessions and mock AI", async t => {
  const status = localStatus();
  const admin = createClient(status.API_URL, status.SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  const artist = browser(origin);
  const otherArtist = browser(origin);
  const visitor = browser(origin);
  const accounts = [];
  for (const login of [artist, otherArtist]) {
    const credentials = { email: `visitor-${randomUUID()}@example.invalid`, password: randomUUID() + "A1!" };
    const created = await admin.auth.admin.createUser({ ...credentials, email_confirm: true });
    assert.equal(created.error, null);
    accounts.push({ ...credentials, id: created.data.user.id });
    await login("/api/auth/login", credentials);
  }

  const profile = await artist("/api/admin/profile");
  await artist("/api/admin/profile", {
    displayName: "관람 테스트 작가", expectedRevision: profile.revision, expectedDocumentRevision: profile.document.revision,
    sections: [{ id: "bio", body: "공개되지 않는 작가 기록" }], sourceRefs: [],
  }, { method: "PATCH" });
  const exhibition = await artist("/api/admin/exhibitions", {
    startDate: "2026-11-14", endDate: "2026-11-15", place: "검사 전시장",
    id: randomUUID(), title: "관람 테스트 전시", sections: [], sourceRefs: [],
  }, { expected: 201 });
  const exhibitPath = `/api/admin/exhibitions/${exhibition.id}`;
  const artwork = await artist(exhibitPath + "/artworks", {
    id: randomUUID(), number: 18, title: "푸른 달", sections: [], sourceRefs: [],
  }, { expected: 201 });
  const artPath = `/api/admin/artworks/${artwork.id}`;

  // Upload is outside this flow. The local fixture supplies only ready image metadata.
  const imageId = randomUUID();
  const owner = accounts[0].id;
  assert.equal((await admin.from("materials").insert({
    id: imageId, owner_id: owner, artwork_id: artwork.id, kind: "image", state: "ready",
    storage_key: `${owner}/fixture/${imageId}.webp`, byte_size: 64,
    content_type: "image/webp", content_hash: "\\x" + "ab".repeat(32),
  })).error, null);
  assert.equal((await admin.from("artworks").update({ image_material_id: imageId })
    .eq("id", artwork.id).eq("owner_id", owner)).error, null);

  const narration = "수채 물감으로 그린 푸른 달입니다.";
  const approvedBody = "재료는 종이와 수채 물감입니다.";
  const saved = await artist(artPath + "/narration", { expectedRevision: artwork.revision, text: narration }, { method: "PATCH" });
  const evidence = await artist(artPath + "/evidence", {
    scope: "artwork", sourceLabel: "승인된 작가 설명", body: approvedBody, source: { kind: "direct" },
  }, { expected: 201 });
  await artist(artPath + "/approvals", { kind: "evidence", evidenceId: evidence.id, version: evidence.version });
  await artist(artPath + "/approvals", {
    kind: "narration", expectedRevision: saved.revision, citations: [{ id: evidence.id, version: evidence.version }],
  });
  const published = await artist(exhibitPath + "/publication", {
    action: "publish", requestId: randomUUID(), expectedRevision: exhibition.revision,
    artworks: [{ artworkId: artwork.id, expectedRevision: saved.revision }],
    intro: { bio: null, introduction: null, theme: null },
  }, { expected: 201 });

  const payload = overrides => ({
    requestId: randomUUID(), exhibitionId: exhibition.id, artworkId: artwork.id, question: "재료를 알려주세요.",
    contextSequence: 3, inputMode: "text", outputMode: "text", ...overrides,
  });
  const insufficient = payload({ question: "보관 장소는 어디인가요?" });
  let generatedRequest;
  let generated;
  if (!disabledOnly) await t.test("legacy number opens approved narration and modes remain independent", async () => {
    const open = payload({ question: "18", artworkId: null, inputMode: "voice", outputMode: "text" });
    const reply = await visitor("/api/chat", open);
    assert.equal(reply.source, "approved_narration");
    assert.equal(reply.answer, narration);
    assert.deepEqual(reply.image, { id: reply.publication.publicationId, kind: "image" });
    assert.equal(reply.inputMode, "voice");
    assert.equal(reply.outputMode, "text");
    assert.deepEqual(reply.citations, [evidence.id]);

    generatedRequest = payload({ inputMode: "text", outputMode: "voice" });
    generated = await visitor("/api/chat", {
      ...generatedRequest, requestId: generatedRequest.requestId.toUpperCase(),
      exhibitionId: exhibition.id.toUpperCase(), artworkId: artwork.id.toUpperCase(),
    });
    assert.equal(generated.requestId, generatedRequest.requestId);
    assert.equal(generated.source, "generated");
    assert.equal(generated.answer, approvedBody);
    assert.equal(generated.mock, true);
    assert.equal(generated.inputMode, "text");
    assert.equal(generated.outputMode, "voice");
    assert.equal(generated.contextSequence, 3);
    assert.equal(generated.publication.publicationId, published.publications[0].publicationId);
    assert.deepEqual(await visitor("/api/chat", generatedRequest), generated, "normalized UUID replays the same saved reply");
    const execution = JSON.parse(execFileSync("docker", ["exec", "-i", "supabase_db_yeobek-mvp", "psql", "-U", "postgres", "-d", "postgres", "-At", "-v", "ON_ERROR_STOP=1"], {
      input: `select usage from public.api_requests where id='${generated.answerId}';`, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"],
    }).trim());
    assert.equal(execution.calls.length, 1, "replay must not duplicate usage");
    assert.equal(execution.calls[0].provider, "mock");
    assert.ok(execution.elapsedMs >= 0);
    assert.equal("answer" in execution, false);
    for (const key of ["steps", "usage", "promptVersion", "ownerId", "question", "inputHash", "sessionHash"]) {
      assert.equal(key in generated, false);
    }
  });

  if (!disabledOnly) await t.test("missing evidence records one gap, with owner-only access and replay", async () => {
    const reply = await visitor("/api/chat", insufficient);
    assert.equal(reply.outcome, "insufficient_evidence");
    assert.equal(reply.gapRecorded, true);
    assert.equal(typeof reply.notice, "string");
    assert.deepEqual(await visitor("/api/chat", insufficient), reply);
    const changed = await visitor("/api/chat", { ...insufficient, question: "다른 질문입니다." }, { expected: 409 });
    assert.equal(changed.code, "REQUEST_ID_CONFLICT");
    const list = await artist(exhibitPath + "/gaps");
    assert.equal(list.length, 1);
    assert.equal(list[0].question, insufficient.question);
    assert.equal(list[0].count, 1);
    assert.equal(list[0].publicationId, reply.publication.publicationId);
    await otherArtist(exhibitPath + "/gaps", undefined, { expected: 404 });
    await otherArtist(`/api/admin/gaps/${list[0].id}/dismiss`, {}, { expected: 404 });
  });

  if (disabledOrigin) await t.test("disabling gaps hides the routes and leaves chat usable", async () => {
    const disabled = browser(disabledOrigin);
    const { email, password } = accounts[0];
    await disabled("/api/auth/login", { email, password });
    await disabled(exhibitPath + "/gaps", undefined, { expected: 404 });
    const unknown = await disabled("/api/chat", { ...insufficient, requestId: randomUUID() });
    assert.equal(unknown.outcome, "insufficient_evidence");
    assert.equal("gapRecorded" in unknown, false);
    assert.equal("notice" in unknown, false);
    const normal = await disabled("/api/chat", payload());
    assert.equal(normal.outcome, "answered");
    const gaps = await admin.rpc("list_gaps", { p_owner: owner, p_exhibition_id: exhibition.id, p_enabled: true });
    assert.equal(gaps.error, null);
    assert.equal(gaps.data.length, disabledOnly ? 0 : 1);
  });
  if (disabledOnly) return;

  await t.test("recording returns editable text; speech uses session-owned answers and caches one synthesis", async () => {
    const voice = browser(origin);
    const requestId = randomUUID();
    const recording = (id = requestId, extra = "") => {
      const form = new FormData();
      form.set("requestId", id);
      form.set("exhibitionId", exhibition.id);
      form.set("file", new Blob(["RIFF0000WAVE", extra], { type: "audio/wav" }), "private-filename.wav");
      return form;
    };
    const transcript = await voice("/api/transcribe", recording());
    assert.deepEqual(Object.keys(transcript).sort(), ["mock", "overLimit", "requestId", "transcript"]);
    assert.equal(transcript.overLimit, false);
    assert.equal(transcript.mock, true);
    assert.equal(transcript.transcript, "이 작품의 재료를 알려주세요.");
    assert.deepEqual(await voice("/api/transcribe", recording()), transcript);
    assert.equal((await voice("/api/transcribe", recording(requestId, "different"), { expected: 409 })).code, "REQUEST_ID_CONFLICT");
    assert.equal((await voice("/api/chat", payload({ requestId }), { expected: 409 })).code, "REQUEST_ID_CONFLICT");
    // Sending the reviewed transcript is a separate chat action; text output can still be spoken later.
    const reply = await voice("/api/chat", payload({ question: transcript.transcript, inputMode: "voice", outputMode: "text" }));
    const speech = { requestId: randomUUID(), answerId: reply.answerId };
    const bytes = await voice("/api/speech", speech, { binary: true });
    assert.ok(bytes.length > 4);
    assert.deepEqual(await voice("/api/speech", speech, { binary: true }), bytes);
    assert.deepEqual(await voice("/api/speech", { ...speech, requestId: randomUUID() }, { binary: true }), bytes);
    await browser(origin)("/api/speech", { ...speech, requestId: randomUUID() }, { expected: 404 });
    await voice("/api/speech", { ...speech, text: "arbitrary text" }, { expected: 400 });
    const ledger = JSON.parse(execFileSync("docker", ["exec", "-i", "supabase_db_yeobek-mvp", "psql", "-U", "postgres", "-d", "postgres", "-At", "-v", "ON_ERROR_STOP=1"], {
      input: `select json_build_object('transcription', (select json_build_object('kind',kind,'result',result,'usage',usage) from public.api_requests where request_id='${requestId}'), 'speech',(select json_build_object('id',id,'result',result,'usage',usage) from public.api_requests where request_id='${speech.requestId}'));`,
      encoding: "utf8", stdio: ["pipe", "pipe", "pipe"],
    }).trim());
    assert.equal(ledger.transcription.kind, "transcription");
    const storedTranscript = { requestId: transcript.requestId, transcript: transcript.transcript, mock: transcript.mock };
    assert.deepEqual(ledger.transcription.result, storedTranscript);
    assert.equal(ledger.transcription.usage.calls.length, 1);
    assert.equal(ledger.speech.usage.calls.length, 1);
    assert.equal(ledger.speech.result.byteSize, bytes.length);
    assert.equal(ledger.speech.result.mock, true);
    const selection = await voice("/api/chat", payload({ question: "작품을 설명해 주세요", artworkId: null }));
    assert.equal(selection.source, "fixed");
    assert.equal(selection.publication, null);
    const selectionAudio = { requestId: randomUUID(), answerId: selection.answerId };
    assert.ok((await voice("/api/speech", selectionAudio, { binary: true })).length > 4);
    assert.ok((await voice("/api/speech", selectionAudio, { binary: true })).length > 4);
    // Retention is server enforced, independent of a fresh HTTP request ID.
    execFileSync("docker", ["exec", "-i", "supabase_db_yeobek-mvp", "psql", "-U", "postgres", "-d", "postgres", "-At", "-v", "ON_ERROR_STOP=1"], {
      input: `update public.api_requests set created_at=now()-interval '2 hours',expires_at=now()-interval '1 hour' where id='${reply.answerId}'; update public.visitor_audio_assets set cleanup_after=now()-interval '1 second' where id='${ledger.speech.id}';`,
      encoding: "utf8", stdio: ["pipe", "pipe", "pipe"],
    });
    assert.equal((await voice("/api/speech", speech, { expected: 410 })).code, "ANSWER_EXPIRED");
    if (process.env.TEST_CRON_SECRET) {
      const cleanup = await fetch(origin + "/api/cron/purge", { method: "POST", headers: { Authorization: `Bearer ${process.env.TEST_CRON_SECRET}` } });
      assert.equal(cleanup.status, 200);
      assert.ok((await cleanup.json()).data.visitorAudio.completed >= 1);
      assert.ok((await admin.storage.from("visitor-audio").download(ledger.speech.result.storageKey)).error);
    }
  });

  await t.test("a cookie retains one quota across requests; another cookie can ask", async () => {
    const limited = browser(origin);
    const current = await admin.from("app_policies").select("value").eq("key", "visitor_requests_per_minute").single();
    assert.equal(current.error, null);
    const setLimit = async value => assert.equal((await admin.from("app_policies").update({ value })
      .eq("key", "visitor_requests_per_minute")).error, null);
    await setLimit(1);
    try {
      const first = payload({ question: "18", artworkId: null });
      const reply = await limited("/api/chat", first);
      assert.deepEqual(await limited("/api/chat", first), reply);
      const denied = await limited("/api/chat", { ...first, requestId: randomUUID() }, { expected: 429 });
      assert.equal(denied.code, "VISITOR_REQUEST_LIMIT");
      assert.equal((await browser(origin)("/api/chat", first)).source, "approved_narration");
    } finally {
      await setLimit(current.data.value);
    }
  });

  await t.test("new cookies cannot evade the network budget and approved text stays readable at both caps", async () => {
    const keys = ["visitor_network_requests_per_minute", "exhibition_requests_per_day"];
    const current = await admin.from("app_policies").select("key,value").in("key", keys);
    assert.equal(current.error, null);
    const set = async (key, value) => assert.equal((await admin.from("app_policies").update({ value }).eq("key", key)).error, null);
    const ip = "2001:db8:" + randomUUID().replaceAll("-", "").match(/.{4}/g).slice(0, 6).join(":");
    try {
      await set(keys[0], 1);
      const request = payload({ question: "18" });
      const original = browser(origin, ip);
      const reply = await original("/api/chat", request);
      assert.deepEqual(await original("/api/chat", request), reply);
      const denied = await browser(origin, ip)("/api/chat", request, { expected: 429 });
      assert.equal(denied.code, "VISITOR_REQUEST_LIMIT");
      assert.deepEqual(denied.fields.fallback, ["approved_narration", "published_audio"]);
      await set(keys[1], 1);
      const approved = await browser(origin, ip)(`/api/public/exhibitions/${exhibition.id}/artworks/${artwork.id}`);
      assert.equal(approved.narrationText, narration);
    } finally {
      for (const row of current.data) await set(row.key, row.value);
    }
  });

  await t.test("version check and answer replay close after pause", async () => {
    const { exhibitionId, ...reference } = generated.publication;
    const versionsPath = `/api/public/exhibitions/${exhibitionId}/versions/check`;
    const body = { publications: [reference] };
    assert.equal((await visitor(versionsPath, body)).publications[0].current, true);
    await artist(exhibitPath + "/publication", { action: "pause", expectedRevision: published.revision });
    assert.equal((await visitor(versionsPath, body)).publications[0].current, false);
    await visitor("/api/chat", generatedRequest, { expected: 404 });
    await visitor("/api/cron/purge", {}, { expected: 404 });
  });
});
