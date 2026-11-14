import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import sharp from "sharp";
import { createClient } from "@supabase/supabase-js";
import { localStatus } from "../../../scripts/local-supabase.mjs";

const origin = process.env.TEST_APP_ORIGIN || "http://localhost:3001";
assert.ok(["localhost", "127.0.0.1"].includes(new URL(origin).hostname));

function browser() {
  const jar = new Map();
  const fixtureIp = "2001:db8:" + randomUUID().replaceAll("-", "").match(/.{4}/g).slice(0, 6).join(":");
  return async (path, body, { method = body === undefined ? "GET" : "POST", expected = 200, binary = false } = {}) => {
    const response = await fetch(origin + path, {
      method,
      headers: { "x-forwarded-for": fixtureIp, Origin: origin, "Content-Type": "application/json",
        Cookie: [...jar].map(([key, value]) => `${key}=${value}`).join("; ") },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    for (const cookie of response.headers.getSetCookie()) {
      const [key, ...value] = cookie.split(";")[0].split("=");
      jar.set(key, value.join("="));
    }
    assert.match(response.headers.get("cache-control") || "", /no-store/, path);
    if (binary && expected < 400) {
      assert.equal(response.status, expected);
      assert.equal(response.headers.get("content-type"), "audio/mpeg");
      return Buffer.from(await response.arrayBuffer());
    }
    const result = await response.json();
    assert.equal(response.status, expected, `${method} ${path}: ${result.error?.code ?? "unexpected status"}`);
    return expected < 400 ? result.data : result.error;
  };
}

test("approved narration creates private mock audio through HTTP and Storage", async () => {
  const status = localStatus();
  const worker = createClient(status.API_URL, status.SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  const anonymous = createClient(status.API_URL, status.ANON_KEY, { auth: { persistSession: false } });
  const artist = browser();
  const other = browser();
  const owners = [];
  for (const request of [artist, other]) {
    const credentials = { email: `audio-${randomUUID()}@example.invalid`, password: randomUUID() + "A1!" };
    const created = await worker.auth.admin.createUser({ ...credentials, email_confirm: true });
    assert.equal(created.error, null);
    owners.push(created.data.user.id);
    await request("/api/auth/login", credentials);
  }

  const profile = await artist("/api/admin/profile");
  await artist("/api/admin/profile", {
    displayName: "음성 검사 작가", expectedRevision: profile.revision, expectedDocumentRevision: profile.document.revision,
    sections: [], sourceRefs: [],
  }, { method: "PATCH" });
  const exhibition = await artist("/api/admin/exhibitions", {
    startDate: "2026-11-14", endDate: "2026-11-15", place: "검사 전시장",
    id: randomUUID(), title: "음성 검사 전시", sections: [], sourceRefs: [],
  }, { expected: 201 });
  const exhibitionPath = `/api/admin/exhibitions/${exhibition.id}`;
  const artwork = await artist(exhibitionPath + "/artworks", {
    id: randomUUID(), number: 18, title: "종이 위 달", sections: [], sourceRefs: [],
  }, { expected: 201 });
  const path = `/api/admin/artworks/${artwork.id}`;

  const png = await sharp({ create: { width: 4, height: 3, channels: 3, background: "blue" } }).png().toBuffer();
  const imageId = randomUUID();
  const reserved = await artist("/api/admin/uploads", {
    id: imageId, subjectType: "artwork", subjectId: artwork.id, kind: "image",
    filename: "작품.png", contentType: "image/png", byteSize: png.length,
  }, { expected: 201 });
  assert.equal((await anonymous.storage.from(reserved.upload.bucket)
    .uploadToSignedUrl(reserved.upload.path, reserved.upload.token, png, { contentType: "image/png" })).error, null);
  assert.equal((await artist(`/api/admin/uploads/${imageId}/complete`, { expectedVersion: 1 })).state, "ready");
  const attached = await artist(path + "/image", { expectedRevision: artwork.revision, materialId: imageId });
  const narration = "종이 위에 수채 물감으로 그린 달입니다.";
  const textHash = createHash("sha256").update(narration).digest("hex");
  const draft = await artist(path + "/narration", {
    expectedRevision: attached.revision, text: narration,
  }, { method: "PATCH" });
  await artist(path + "/audio", { requestId: randomUUID(), approvalId: randomUUID(), expectedRevision: draft.revision }, { expected: 409 });

  const evidence = await artist(path + "/evidence", {
    scope: "artwork", sourceLabel: "작가 설명", body: narration, source: { kind: "direct" },
  }, { expected: 201 });
  await artist(path + "/approvals", { kind: "evidence", evidenceId: evidence.id, version: evidence.version });
  const approve = expectedRevision => artist(path + "/approvals", {
    kind: "narration", expectedRevision, citations: [{ id: evidence.id, version: evidence.version }],
  });
  const oldApproval = await approve(draft.revision);
  const edited = await artist(path + "/narration", {
    expectedRevision: draft.revision, text: "검수 중에 바뀐 글입니다.",
  }, { method: "PATCH" });
  await artist(path + "/audio", { requestId: randomUUID(), approvalId: oldApproval.id, expectedRevision: edited.revision }, { expected: 409 });
  const restored = await artist(path + "/narration", {
    expectedRevision: edited.revision, text: narration,
  }, { method: "PATCH" });
  const approval = await approve(restored.revision);
  assert.equal(approval.textHash, textHash);

  const input = { requestId: randomUUID(), approvalId: approval.id, expectedRevision: restored.revision };
  await other(path + "/audio", input, { expected: 404 });
  const generated = await artist(path + "/audio", input, { expected: 201 });
  assert.equal(generated.kind, "audio");
  assert.equal(generated.status, "succeeded");
  assert.equal(generated.attempt, 1);
  assert.equal(generated.mock, true);
  assert.equal(generated.result.mock, true);
  assert.equal(generated.result.approvalId, approval.id);
  assert.equal(generated.result.textHash, textHash);
  assert.ok(generated.result.voiceConfigVersion > 0);
  assert.equal("storageKey" in generated.result, false);
  assert.deepEqual(await artist(path + "/audio", input), generated);
  assert.deepEqual(await artist(`/api/admin/jobs/${generated.id}`), generated);
  await other(`/api/admin/jobs/${generated.id}`, undefined, { expected: 404 });

  const review = await artist(path + "/review");
  assert.equal(review.audio.id, generated.result.assetId);
  assert.equal(review.audio.state, "ready");
  assert.equal(review.audio.textHash, textHash);
  assert.equal(review.audio.voiceConfigVersion, generated.result.voiceConfigVersion);
  assert.equal("storageKey" in review.audio, false);

  const audioKey = `${owners[0]}/audio/${generated.id}/1.mp3`;
  const asset = await worker.storage.from("artist-audio").download(audioKey);
  assert.equal(asset.error, null);
  assert.ok(asset.data.size > 0);
  assert.ok((await anonymous.storage.from("artist-audio").download(audioKey)).error);
  assert.ok((await anonymous.storage.from("artist-audio").createSignedUrl(audioKey, 60)).error);

  const published = await artist(exhibitionPath + "/publication", {
    action: "publish", requestId: randomUUID(), expectedRevision: exhibition.revision,
    artworks: [{ artworkId: artwork.id, expectedRevision: restored.revision }],
    intro: { bio: null, introduction: null, theme: null },
  }, { expected: 201 });
  const pub = await worker.from("publications").select("audio_key,audio_text_hash").eq("id", published.publications[0].publicationId).single();
  assert.equal(pub.error, null);
  assert.equal(pub.data.audio_key, audioKey);
  assert.equal(pub.data.audio_text_hash, "\\x" + textHash);
  const publicWork = await browser()(`/api/public/exhibitions/${exhibition.id}/artworks/${artwork.id}`);
  assert.equal(publicWork.narrationText, narration);
  const publicId = published.publications[0].publicationId;
  assert.deepEqual(publicWork.image, { id: publicId, kind: "image" });
  assert.deepEqual(publicWork.audio, { id: publicId, kind: "audio" });
  for (const [kind, expectedBytes, mime] of [["image", png, "image/png"],
    ["audio", Buffer.from(await asset.data.arrayBuffer()), "audio/mpeg"]]) {
    const media = await fetch(`${origin}/api/media/${publicId}?kind=${kind}`);
    assert.equal(media.status, 200);
    assert.equal(media.headers.get("content-type"), mime);
    assert.match(media.headers.get("cache-control"), /no-store/);
    assert.equal(media.headers.get("x-content-type-options"), "nosniff");
    assert.deepEqual(Buffer.from(await media.arrayBuffer()), expectedBytes);
  }
  assert.equal("audioKey" in publicWork, false);
  assert.ok((await anonymous.storage.from("artist-audio").download(audioKey)).error);

  const visitor = browser();
  const answer = await visitor("/api/chat", { requestId: randomUUID(), exhibitionId: exhibition.id, artworkId: null,
    question: "18", contextSequence: 0, inputMode: "text", outputMode: "voice" });
  const speechInput = { requestId: randomUUID(), answerId: answer.answerId };
  assert.deepEqual(await visitor("/api/speech", speechInput, { binary: true }), Buffer.from(await asset.data.arrayBuffer()));
  const voiceCount = execFileSync("docker", ["exec", "-i", "supabase_db_yeobek-mvp", "psql", "-U", "postgres", "-d", "postgres", "-At", "-v", "ON_ERROR_STOP=1"], {
    input: `select count(*) from public.api_requests where source_answer_id='${answer.answerId}';`, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"],
  }).trim();
  assert.equal(voiceCount, "0", "published narration reuses stored bytes without another synthesis reservation");

  // Simulate a failed attempt whose upload arrived late. Only this disposable
  // fixture's clock is advanced; deletion itself must go through Storage HTTP.
  const orphanId = randomUUID();
  const orphanKey = `${owners[0]}/audio/${orphanId}/1.mp3`;
  assert.equal((await worker.storage.from("artist-audio").upload(orphanKey, asset.data,
    { contentType: "audio/mpeg" })).error, null);
  execFileSync("docker", ["exec", "-i", "supabase_db_yeobek-mvp", "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1"], {
    input: `insert into public.audio_assets(id,owner_id,exhibition_id,artwork_id,approval_id,text_hash,voice_config_version,storage_key,state,mock,cleanup_after)
      select '${orphanId}',owner_id,exhibition_id,artwork_id,approval_id,text_hash,voice_config_version,'${orphanKey}','failed',true,now()-interval '1 second'
      from public.audio_assets where id='${generated.result.assetId}';`, stdio: ["pipe", "pipe", "pipe"],
  });
  const cronSecret = process.env.TEST_CRON_SECRET;
  assert.ok(cronSecret, "TEST_CRON_SECRET must match the local app's CRON_SECRET");
  const purge = await fetch(origin + "/api/cron/purge", { method: "POST", headers: { Authorization: `Bearer ${cronSecret}` } });
  assert.equal(purge.status, 200);
  assert.ok((await purge.json()).data.audio.completed >= 1);
  assert.ok((await worker.storage.from("artist-audio").download(orphanKey)).error);
  assert.equal((await worker.storage.from("artist-audio").download(audioKey)).error, null);

  // Keep the local fixture's pinned asset intact. Revoke access through the
  // normal public gate, and remove the now-unneeded staging object only.
  await artist(exhibitionPath + "/publication", { action: "pause", expectedRevision: published.revision });
  await visitor("/api/speech", speechInput, { expected: 404 });
  for (const kind of ["image", "audio"]) {
    const media = await fetch(`${origin}/api/media/${publicId}?kind=${kind}`);
    assert.equal(media.status, 404);
  }
  assert.equal((await worker.storage.from(reserved.upload.bucket).remove([reserved.upload.path])).error, null);
});
