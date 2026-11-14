import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { localStatus } from "../../../scripts/local-supabase.mjs";

const base = process.env.TEST_APP_ORIGIN || "http://localhost:3001";
assert.ok(["localhost", "127.0.0.1"].includes(new URL(base).hostname));
test("unselected exhibition chat respects its flag, common evidence and voice lifecycle", async () => {
  const status = localStatus();
  const admin = createClient(status.API_URL, status.SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  const account = { email: `exhibition-chat-${randomUUID()}@example.invalid`, password: randomUUID() + "A1!" };
  assert.equal((await admin.auth.admin.createUser({ ...account, email_confirm: true })).error, null);
  const cookies = new Map();
  async function request(path, body, method = body === undefined ? "GET" : "POST") {
    const response = await fetch(base + path, { method, headers: { Origin: base, "Content-Type": "application/json",
      Cookie: [...cookies].map(([k, v]) => `${k}=${v}`).join("; ") }, body: body === undefined ? undefined : JSON.stringify(body) });
    for (const value of response.headers.getSetCookie()) {
      const [key, ...parts] = value.split(";")[0].split("="); cookies.set(key, parts.join("="));
    }
    const result = await response.json();
    assert.ok(response.ok, `${path}: ${result.error?.code}`);
    return result.data;
  }
  await request("/api/auth/login", account);
  const profile = await request("/api/admin/profile");
  await request("/api/admin/profile", { displayName: "가상 작가", expectedRevision: profile.revision,
    expectedDocumentRevision: profile.document.revision, sections: [], sourceRefs: [] }, "PATCH");
  const exhibition = await request("/api/admin/exhibitions", { id: randomUUID(), title: "바다 전시",
    startDate: "2026-11-14", endDate: "2026-11-15", place: "시연 공간", sections: [], sourceRefs: [] });
  const path = `/api/admin/exhibitions/${exhibition.id}`;
  let work = await request(path + "/artworks", { id: randomUUID(), number: 1, title: "산", sections: [], sourceRefs: [] });
  const art = `/api/admin/artworks/${work.id}`;
  const common = await request(art + "/evidence", { scope: "exhibition", sourceLabel: "전시 소개",
    body: "바다 전시는 자연의 변화를 다룹니다.", source: { kind: "direct" } });
  const specific = await request(art + "/evidence", { scope: "artwork", sourceLabel: "작품 소개",
    body: "산 작품은 화강암으로 만들어졌습니다.", source: { kind: "direct" } });
  for (const evidence of [common, specific]) await request(`/api/admin/evidence/${evidence.id}/approve`, { version: evidence.version });
  work = await request(art + "/narration", { expectedRevision: work.revision, text: specific.body }, "PATCH");
  await request(art + "/approvals", { kind: "narration", expectedRevision: work.revision,
    citations: [{ id: specific.id, version: specific.version }] });
  const publication = await request(path + "/publication", { action: "publish", requestId: randomUUID(),
    expectedRevision: exhibition.revision, artworks: [{ artworkId: work.id, expectedRevision: work.revision }],
    intro: { bio: null, introduction: { id: common.id, version: common.version }, theme: null } });
  const input = { requestId: randomUUID(), exhibitionId: exhibition.id, artworkId: null,
    question: "바다 전시에 대해 알려주세요", intent: "question", contextSequence: 1, inputMode: "text", outputMode: "voice" };
  const reply = await request("/api/chat", input);
  if (process.env.TEST_EXHIBITION_CHAT_ENABLED !== "true") {
    assert.equal(reply.outcome, "clarify"); assert.equal(reply.publication, null); return;
  }
  assert.equal(reply.source, "generated"); assert.equal(reply.publication.artworkId, null);
  assert.deepEqual(reply.citations, [common.id]); assert.equal(reply.image, null); assert.equal(reply.outputMode, "voice");
  assert.deepEqual(await request("/api/chat", input), reply, "replay uses the same bounded public context");
  const hidden = await request("/api/chat", { ...input, requestId: randomUUID(), question: "화강암은 어떤가요?" });
  assert.equal(hidden.outcome, "insufficient_evidence"); assert.equal(hidden.gapRecorded, undefined);
  const voiceBody = { requestId: randomUUID(), answerId: reply.answerId };
  const speech = await fetch(base + "/api/speech", { method: "POST", headers: { Origin: base, "Content-Type": "application/json",
    Cookie: [...cookies].map(([k, v]) => `${k}=${v}`).join("; ") }, body: JSON.stringify(voiceBody) });
  assert.equal(speech.status, 200); assert.equal(speech.headers.get("content-type"), "audio/mpeg");
  await speech.arrayBuffer();
  await request(path + "/publication", { action: "pause", expectedRevision: publication.revision });
  const closed = await fetch(base + "/api/speech", { method: "POST", headers: { Origin: base, "Content-Type": "application/json",
    Cookie: [...cookies].map(([k, v]) => `${k}=${v}`).join("; ") }, body: JSON.stringify(voiceBody) });
  assert.equal(closed.status, 404);
});
