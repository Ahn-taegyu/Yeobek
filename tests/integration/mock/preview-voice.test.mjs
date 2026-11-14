import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { localStatus } from "../../../scripts/local-supabase.mjs";

const base = process.env.TEST_APP_ORIGIN || "http://localhost:3001";
assert.ok(["localhost", "127.0.0.1"].includes(new URL(base).hostname));
test("private preview voice owner, replay, and disabled boundaries", async () => {
  const jars = [new Map(), new Map()];
  async function request(path, body, { user = 0, expected = 200, binary = false } = {}) {
    const headers = { Origin: base, Cookie: [...jars[user]].map(([k, v]) => `${k}=${v}`).join("; ") };
    if (!(body instanceof FormData)) headers["Content-Type"] = "application/json";
    const response = await fetch(base + path, { method: "POST", headers, body: body instanceof FormData ? body : JSON.stringify(body) });
    for (const value of response.headers.getSetCookie()) { const [key, ...rest] = value.split(";")[0].split("="); jars[user].set(key, rest.join("=")); }
    assert.match(response.headers.get("cache-control") || "", /private, no-store/);
    assert.equal(response.status, expected, `${path}: ${response.status}`);
    if (binary && response.ok) { assert.equal(response.headers.get("content-type"), "audio/mpeg"); return Buffer.from(await response.arrayBuffer()); }
    const result = await response.json();
    return response.ok ? result.data : result.error;
  }
  if (process.env.TEST_PREVIEW_VOICE_DISABLED_ONLY === "true") {
    await request(`/api/admin/exhibitions/${randomUUID()}/preview/transcribe`, {}, { expected: 404 });
    await request(`/api/admin/preview/${randomUUID()}/speech`, {}, { expected: 404 });
    return;
  }
  await request(`/api/admin/preview/${randomUUID()}/speech`, { requestId: randomUUID() }, { expected: 401 });
  const status = localStatus();
  const admin = createClient(status.API_URL, status.SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  for (let user = 0; user < 2; user++) {
    const account = { email: `preview-voice-${randomUUID()}@example.invalid`, password: randomUUID() + "A1!" };
    assert.equal((await admin.auth.admin.createUser({ ...account, email_confirm: true })).error, null);
    await request("/api/auth/login", account, { user });
  }
  const exhibition = await request("/api/admin/exhibitions", { id: randomUUID(), title: "미리보기 전시",
    sections: [{ id: "introduction", body: "전시는 푸른 아침의 변화를 다룹니다." }], sourceRefs: [] }, { expected: 201 });
  const path = `/api/admin/exhibitions/${exhibition.id}/preview`;
  const requestId = randomUUID();
  const recording = (id = requestId, exhibitionId = exhibition.id, extra = "") => {
    const form = new FormData(); form.set("requestId", id); form.set("exhibitionId", exhibitionId);
    form.set("file", new Blob(["RIFF0000WAVE", extra], { type: "audio/wav" }), "recording.wav"); return form;
  };
  const transcript = await request(path + "/transcribe", recording());
  assert.equal(transcript.mock, true);
  assert.deepEqual(await request(path + "/transcribe", recording()), transcript);
  assert.equal((await request(path + "/transcribe", recording(requestId, exhibition.id, "changed"), { expected: 409 })).code, "REQUEST_ID_CONFLICT");
  await request(path + "/transcribe", recording(randomUUID(), randomUUID()), { expected: 400 });
  await request(path + "/transcribe", recording(randomUUID()), { user: 1, expected: 404 });
  const evidence = await request(`/api/admin/exhibitions/${exhibition.id}/evidence`, { scope: "exhibition", sourceLabel: "전시 설명",
    body: "전시는 푸른 아침의 변화를 다룹니다.", source: { kind: "direct" } }, { expected: 201 });
  await request(`/api/admin/evidence/${evidence.id}/approve`, { version: evidence.version });
  const preview = await request(path + "/chat", { requestId: randomUUID(), artworkId: null, question: "전시는 무엇을 다루나요?" }, { expected: 201 });
  assert.equal(preview.status, "succeeded");
  // The preview answer is private even when its UUID is supplied to visitor APIs.
  const publicSpeech = await fetch(base + "/api/speech", { method: "POST", headers: { Origin: base, "Content-Type": "application/json" },
    body: JSON.stringify({ requestId: randomUUID(), answerId: preview.id }) });
  assert.equal(publicSpeech.status, 404);
  const publicSpeechBody = await publicSpeech.text();
  assert.ok(!publicSpeechBody.includes(preview.result.answer));
  assert.ok(!publicSpeechBody.includes("audio/mpeg"));
  const publicExhibition = await fetch(base + `/api/public/exhibitions/${exhibition.id}`);
  assert.equal(publicExhibition.status, 404);
  const publicExhibitionBody = await publicExhibition.text();
  assert.ok(!publicExhibitionBody.includes(preview.result.answer));
  assert.ok(!publicExhibitionBody.includes(preview.id));
  const speechPath = `/api/admin/preview/${preview.id}/speech`;
  const speech = { requestId: randomUUID() };
  const bytes = await request(speechPath, speech, { binary: true });
  assert.ok(bytes.length > 0);
  assert.deepEqual(await request(speechPath, speech, { binary: true }), bytes);
  await request(speechPath, { requestId: randomUUID() }, { user: 1, expected: 404 });
});
