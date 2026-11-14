import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { PDFDocument } from "pdf-lib";
import { createClient } from "@supabase/supabase-js";
import { localStatus } from "../../scripts/local-supabase.mjs";

const origin = process.env.TEST_APP_ORIGIN || "http://localhost:3000";
assert.ok(["localhost", "127.0.0.1"].includes(new URL(origin).hostname));
function browser() {
  const jar = new Map();
  return async (path, body, { method = body === undefined ? "GET" : "POST", expected = 200 } = {}) => {
    const response = await fetch(origin + path, { method, headers: { Origin: origin, "Content-Type": "application/json",
      Cookie: [...jar].map(([k, v]) => `${k}=${v}`).join("; ") }, body: body === undefined ? undefined : JSON.stringify(body) });
    for (const cookie of response.headers.getSetCookie()) {
      const [key, ...value] = cookie.split(";")[0].split("="); jar.set(key, value.join("="));
    }
    const result = await response.json();
    assert.match(response.headers.get("cache-control") || "", /no-store/);
    assert.equal(response.status, expected, `${method} ${path}: ${result.error?.code}`);
    return expected < 400 ? result.data : result.error;
  };
}

test("actual private Storage upload, validation, owner isolation and cleanup", async t => {
  const status = localStatus();
  const worker = createClient(status.API_URL, status.SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  const anonymous = createClient(status.API_URL, status.ANON_KEY, { auth: { persistSession: false } });
  const artist = browser(), other = browser();
  let owner;
  for (const request of [artist, other]) {
    const credentials = { email: `materials-${randomUUID()}@example.invalid`, password: randomUUID() + "A1!" };
    const created = await worker.auth.admin.createUser({ ...credentials, email_confirm: true });
    assert.equal(created.error, null);
    if (request === artist) owner = created.data.user.id;
    await request("/api/auth/login", credentials);
  }
  const show = await artist("/api/admin/exhibitions", { id: randomUUID(), title: "실제 파일 검사", sections: [], sourceRefs: [] }, { expected: 201 });
  const work = await artist(`/api/admin/exhibitions/${show.id}/artworks`, {
    id: randomUUID(), number: 18, title: "업로드 작품", sections: [], sourceRefs: [],
  }, { expected: 201 });
  const artPath = `/api/admin/artworks/${work.id}`;
  const png = await sharp({ create: { width: 4, height: 3, channels: 3, background: "blue" } }).png().toBuffer();
  const jpeg = await sharp(png).jpeg().toBuffer();
  async function reserve(bytes, options = {}) {
    const body = { id: randomUUID(), subjectType: "artwork", subjectId: work.id, kind: "image", filename: "작품.png",
      contentType: "image/png", byteSize: bytes.length, ...options };
    return { body, result: await artist("/api/admin/uploads", body, { expected: 201 }) };
  }
  async function send(result, bytes, mime = "image/png") {
    // A fresh anonymous client has no artist cookie; only the scoped token authorizes this transfer.
    const sent = await anonymous.storage.from(result.upload.bucket).uploadToSignedUrl(result.upload.path,
      result.upload.token, bytes, { contentType: mime });
    assert.equal(sent.error, null);
  }
  let image;
  await t.test("image and PDF limits reject actual signed Storage transfers", async () => {
    const imageLimit = 3 * 1024 * 1024;
    const pdfLimit = 6 * 1024 * 1024;
    for (const { kind, filename, contentType, limit, bucket } of [
      { kind: "image", filename: "size.png", contentType: "image/png", limit: imageLimit, bucket: "artist-material-staging" },
      { kind: "pdf", filename: "size.pdf", contentType: "application/pdf", limit: pdfLimit, bucket: "artist-material-pdf-staging" },
    ]) {
      const input = { id: randomUUID(), subjectType: "artwork", subjectId: work.id, kind, filename, contentType };
      await artist("/api/admin/uploads", { ...input, byteSize: limit + 1 }, { expected: 400 });
      const reserved = await artist("/api/admin/uploads", { ...input, byteSize: limit }, { expected: 201 });
      assert.equal(reserved.upload.bucket, bucket);
      const staging = anonymous.storage.from(bucket);
      assert.ok((await staging.uploadToSignedUrl(reserved.upload.path, reserved.upload.token,
        Buffer.alloc(limit + 1), { contentType })).error, "Storage must reject the bytes before completion");
      assert.equal((await staging.uploadToSignedUrl(reserved.upload.path, reserved.upload.token,
        Buffer.alloc(limit), { contentType })).error, null, "the object size limit is inclusive");
      assert.ok((await staging.download(reserved.upload.path)).error, "staging remains private");
      await artist(`/api/admin/materials/${input.id}`, { expectedVersion: 1 }, { method: "DELETE" });
    }
  });
  await t.test("real PNG becomes ready only after complete, replay is stable, final bytes are immutable", async () => {
    const { body, result } = await reserve(png);
    const id = body.id;
    assert.equal(result.material.state, "pending");
    await artist(`/api/admin/uploads/${id}/complete`, { expectedVersion: 1 }, { expected: 409 });
    await other(`/api/admin/uploads/${id}/complete`, { expectedVersion: 1 }, { expected: 404 });
    await other(`/api/admin/materials/${id}`, undefined, { expected: 404 });
    const replay = await artist("/api/admin/uploads", body);
    assert.equal(replay.material.id, id);
    await send(result, png);
    const replies = await Promise.all([1, 2].map(() => artist(`/api/admin/uploads/${id}/complete`, { expectedVersion: 1 })));
    assert.equal(replies[0].state, "ready");
    assert.equal(replies[0].width, 4);
    assert.equal(replies[0].height, 3);
    assert.equal(replies[1].id, id);
    assert.equal((await artist("/api/admin/uploads", body)).upload, null);
    assert.equal("storageKey" in replies[0], false);
    const download = await artist(`/api/admin/materials/${id}`);
    const response = await fetch(download.download.url);
    assert.deepEqual(Buffer.from(await response.arrayBuffer()), png);
    const finalKey = `${owner}/materials/${id}/v1.png`;
    assert.ok((await anonymous.storage.from("artist-materials").download(finalKey)).error);
    // The old upload token can recreate staging after completion, but cannot affect final bytes.
    await send(result, Buffer.alloc(png.length, 1));
    assert.deepEqual(Buffer.from(await (await fetch(download.download.url)).arrayBuffer()), png);
    image = { id, finalKey, stagingKey: result.upload.path };
    const attached = await artist(artPath + "/image", { expectedRevision: work.revision, materialId: id });
    assert.equal(attached.imageMaterialId, id);
  });
  await t.test("JPEG magic mismatch stays pending; actual JPEG and PDF decode", async () => {
    const mismatch = await reserve(jpeg);
    await send(mismatch.result, jpeg);
    assert.equal((await artist(`/api/admin/uploads/${mismatch.body.id}/complete`, { expectedVersion: 1 }, { expected: 400 })).code, "INVALID_FILE");
    const correct = await reserve(jpeg, { filename: "image.jpeg", contentType: "image/jpeg" });
    await send(correct.result, jpeg, "image/jpeg");
    assert.equal((await artist(`/api/admin/uploads/${correct.body.id}/complete`, { expectedVersion: 1 })).state, "ready");
    const pdf = await PDFDocument.create(); pdf.addPage(); pdf.addPage();
    const bytes = await pdf.save();
    const prepared = await reserve(bytes, { subjectType: "exhibition", subjectId: show.id,
      filename: "도록.pdf", kind: "pdf", contentType: "application/pdf" });
    await send(prepared.result, bytes, "application/pdf");
    assert.equal((await artist(`/api/admin/uploads/${prepared.body.id}/complete`, { expectedVersion: 1 })).pages, 2);
    const legacy = await reserve(bytes, { filename: "legacy.pdf", kind: "pdf", contentType: "application/pdf" });
    const legacyBucket = worker.storage.from("artist-material-staging");
    const oldToken = await legacyBucket.createSignedUploadUrl(legacy.result.upload.path, { upsert: false });
    assert.equal(oldToken.error, null);
    assert.equal((await anonymous.storage.from("artist-material-staging").uploadToSignedUrl(
      oldToken.data.path, oldToken.data.token, bytes, { contentType: "application/pdf" })).error, null);
    assert.equal((await artist(`/api/admin/uploads/${legacy.body.id}/complete`, { expectedVersion: 1 })).pages, 2);
    const input = { expectedRevision: show.document.revision, sections: [{ id: "introduction", body: "도록에서 발췌" }],
      sourceRefs: [{ kind: "material", sectionId: "introduction", materialId: prepared.body.id, pageStart: 1, pageEnd: 3 }] };
    await artist(`/api/admin/knowledge/${show.document.id}`, input, { method: "PATCH", expected: 400 });
    input.sourceRefs[0].pageEnd = 2;
    await artist(`/api/admin/knowledge/${show.document.id}`, input, { method: "PATCH" });
    assert.equal((await artist(`/api/admin/materials/${prepared.body.id}`, { expectedVersion: 1 }, { method: "DELETE", expected: 409 })).code, "MATERIAL_IN_USE");
  });
  await t.test("existing final object must have identical validated bytes", async () => {
    for (const matches of [true, false]) {
      const reserved = await reserve(png);
      await send(reserved.result, png);
      const key = `${owner}/materials/${reserved.body.id}/v1.png`;
      // Simulate another completion having created the final key before its DB commit.
      const inserted = await worker.storage.from("artist-materials").upload(key,
        matches ? png : Buffer.alloc(png.length, 1), { contentType: "image/png" });
      assert.equal(inserted.error, null);
      const result = await artist(`/api/admin/uploads/${reserved.body.id}/complete`, { expectedVersion: 1 },
        { expected: matches ? 200 : 409 });
      if (matches) assert.equal(result.state, "ready");
      else assert.equal(result.code, "UPLOAD_CONTENT_CONFLICT");
      await artist(`/api/admin/materials/${reserved.body.id}`, { expectedVersion: 1 }, { method: "DELETE" });
    }
  });
  await t.test("delete returns durable tombstone; delayed cleanup removes recreated stage and number can be reused", async () => {
    const deleted = await artist(`/api/admin/materials/${image.id}`, { expectedVersion: 1 }, { method: "DELETE" });
    assert.equal(deleted.state, "revoked");
    assert.equal(deleted.cleanupPending, true);
    await artist(`/api/admin/materials/${image.id}`, undefined, { expected: 404 });
    await other(`/api/admin/materials?subjectType=artwork&subjectId=${work.id}`, undefined, { expected: 404 });
    const list = await artist(`/api/admin/materials?subjectType=artwork&subjectId=${work.id}`);
    assert.ok(list.every(row => row.id !== image.id));
    const current = await artist(artPath);
    const removed = await artist(artPath + "/delete", { expectedRevision: current.revision });
    assert.equal(removed.id, work.id);
    assert.ok(removed.deletedAt);
    assert.deepEqual(await artist(artPath + "/delete", { expectedRevision: current.revision }), removed);
    await artist(`/api/admin/exhibitions/${show.id}/artworks`, { id: randomUUID(), number: 18,
      title: "번호 재사용", sections: [], sourceRefs: [] }, { expected: 201 });
    assert.ok((await worker.storage.from("artist-materials").download(image.finalKey)).error);
    // Advance only this local test fixture's cleanup clock; no real wait or production change.
    assert.equal((await worker.from("materials").update({ cleanup_after: new Date(Date.now() - 1000).toISOString() }).eq("id", image.id)).error, null);
    const recreated = await worker.storage.from("artist-material-staging").upload(image.stagingKey, png, { contentType: "image/png" });
    assert.equal(recreated.error, null);
    const cronSecret = process.env.TEST_CRON_SECRET;
    assert.ok(cronSecret, "TEST_CRON_SECRET must match the local app's CRON_SECRET");
    const purge = await fetch(origin + "/api/cron/purge", { method: "POST", headers: { Authorization: `Bearer ${cronSecret}` } });
    assert.equal(purge.status, 200);
    assert.ok((await purge.json()).data.materials.completed >= 1);
    assert.ok((await worker.storage.from("artist-material-staging").download(image.stagingKey)).error);
    const row = await worker.from("materials").select("cleanup_pending").eq("id", image.id).single();
    assert.equal(row.data.cleanup_pending, false);
  });
});
