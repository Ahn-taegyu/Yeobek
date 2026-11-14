import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";
import { localStatus } from "../../../scripts/local-supabase.mjs";

const base = process.env.TEST_APP_ORIGIN || "http://localhost:3001";
assert.ok(["localhost", "127.0.0.1"].includes(new URL(base).hostname));
const cronSecret = process.env.TEST_CRON_SECRET;
const channel = process.env.CHANNEL_TALK_CHANNEL_ID;
const token = process.env.CHANNEL_TALK_WEBHOOK_TOKEN;
assert.ok(cronSecret?.length >= 32, "TEST_CRON_SECRET must match the local mock app");
assert.ok(channel === "support-test-channel" && token?.startsWith("local-support-only-") && token.length >= 32,
  "The local mock app requires the synthetic support channel and webhook token");

function sql(query) {
  return execFileSync("docker", ["exec", "supabase_db_yeobek-mvp", "psql", "-U", "postgres", "-d", "postgres", "-Atqc", query],
    { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 30000 }).trim();
}

test("Channel Talk webhook receipt, operator binding, approval, and mock support delivery", async t => {
  const status = localStatus();
  const admin = createClient(status.API_URL, status.SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  const prior = await admin.from("automation_policies").select("mode,allowed_categories").eq("kind", "support").single();
  assert.equal(prior.error, null);
  const account = { email: `support-${randomUUID()}@example.invalid`, password: randomUUID() + "A1!" };
  const created = await admin.auth.admin.createUser({ ...account, email_confirm: true });
  assert.equal(created.error, null);
  const owner = created.data.user.id;
  const user = randomUUID();
  const chat = randomUUID();
  const helpId = randomUUID();
  const helpBody = "전시일정은 작가 홈에서 확인할 수 있습니다.";
  t.after(async () => {
    await admin.from("operators").update({ enabled: false }).eq("user_id", owner);
    await admin.from("help_articles").update({ published: false }).eq("id", helpId);
    await admin.from("automation_policies").update(prior.data).eq("kind", "support");
  });
  assert.equal((await admin.from("automation_policies").update({ mode: "draft" }).eq("kind", "support")).error, null);
  assert.equal((await admin.from("help_articles").insert({ id: helpId, title: "전시 일정 안내", body: helpBody, published: true })).error, null);

  const jar = new Map();
  async function request(path, body, { webhook = false, cron = false } = {}) {
    const headers = { "Content-Type": "application/json" };
    if (!webhook) {
      headers.Origin = base;
      headers.Cookie = [...jar].map(([key, value]) => `${key}=${value}`).join("; ");
    }
    if (cron) headers.Authorization = `Bearer ${cronSecret}`;
    const response = await fetch(base + path, { method: "POST", headers,
      body: body === undefined ? undefined : JSON.stringify(body) });
    for (const value of response.headers.getSetCookie()) {
      const [key, ...parts] = value.split(";")[0].split("=");
      jar.set(key, parts.join("="));
    }
    assert.match(response.headers.get("cache-control") || "", /no-store/);
    return { status: response.status, ...await response.json() };
  }
  const ingress = "/api/webhooks/channeltalk";
  const webhook = (payload, query = `?token=${encodeURIComponent(token)}`) =>
    request(ingress + query, payload, { webhook: true });
  const message = entity => ({ event: "push", type: "message", entity: {
    id: randomUUID(), channelId: channel, chatId: chat, personId: user, chatType: "userChat",
    personType: "user", createdAt: Date.now(), plainText: "전시일정 알려주세요", ...entity,
  } });
  const inquiry = message();
  assert.equal((await webhook(inquiry, "")).status, 404);
  assert.equal((await webhook(inquiry, "?token=incorrect-synthetic-token")).status, 404);
  assert.equal((await webhook(inquiry, `?token=${encodeURIComponent(token)}&token=${encodeURIComponent(token)}`)).status, 404);
  assert.equal((await webhook(message({ channelId: "wrong-channel" }))).status, 404);
  assert.deepEqual((await webhook(message({ personType: "bot" }))).data, { accepted: true, ignored: true });

  assert.equal((await request("/api/auth/login", account)).status, 200);
  const binding = { userId: user, ownerId: owner, enabled: true, expectedRevision: 0 };
  assert.equal((await request("/api/ops/support/bindings", binding)).status, 404);
  assert.equal((await admin.from("operators").upsert({ user_id: owner, enabled: true })).error, null);
  const bound = await request("/api/ops/support/bindings", binding);
  assert.equal(bound.status, 200);
  assert.deepEqual(bound.data, { revision: 1 });

  const accepted = await webhook(inquiry);
  assert.equal(accepted.status, 200);
  assert.deepEqual(accepted.data, { accepted: true, duplicate: false });
  assert.deepEqual((await webhook(inquiry)).data, { accepted: true, duplicate: true });
  assert.equal((await webhook({ ...inquiry, entity: { ...inquiry.entity, chatId: randomUUID() } })).status, 409);

  const unbound = message({ personId: randomUUID() });
  const sensitive = message({ plainText: "결제 취소와 환불 문의" });
  assert.equal((await webhook(unbound)).status, 200);
  assert.equal((await webhook(sensitive)).status, 200);

  function state(payload) {
    const id = payload.entity.id;
    assert.match(id, /^[0-9a-f-]{36}$/);
    const row = sql(`select jsonb_build_object('eventState',e.state,'resultCode',e.result_code,'owner',i.owner_id,
      'messageId',m.id,'messageState',m.state,'chatId',m.destination_id,'revision',m.revision,'body',m.body,
      'sendAttempt',m.send_attempt,'jobId',j.id,'usage',a.usage)
      from public.support_inquiries i join public.automation_events e on e.id=i.event_id
      left join public.outbound_messages m on m.event_id=e.id
      left join public.ai_jobs j on j.automation_event_id=e.id
      left join public.ai_job_attempts a on a.job_id=j.id and a.attempt=j.attempt
      where i.channel_id='support-test-channel' and i.message_id='${id}' and i.mock`);
    return row ? JSON.parse(row) : null;
  }
  async function tick() {
    const batch = await request("/api/cron/automation", undefined, { cron: true });
    assert.equal(batch.status, 200);
    assert.equal(batch.data.support.mock, true);
    assert.equal(batch.data.support.dispatchReady, true);
    assert.equal(batch.data.support.persistenceFailures, 0);
    assert.equal(batch.data.support.dispatch.persistenceFailures, 0);
  }
  async function until(payload, ready) {
    for (let index = 0; index < 12; index++) {
      await tick();
      const current = state(payload);
      if (current && ready(current)) return current;
    }
    assert.fail("support inquiry did not reach the expected state within bounded queue drain");
  }

  assert.equal(state(unbound).eventState, "escalated");
  assert.equal(state(unbound).resultCode, "UNLINKED_ACCOUNT");
  assert.equal(state(unbound).jobId, null);
  const draft = await until(inquiry, item => item.messageState === "draft");
  assert.equal(draft.owner, owner);
  assert.equal(draft.chatId, chat);
  assert.equal(draft.body, helpBody);
  assert.equal(draft.usage[0].mock, true);
  assert.equal(draft.sendAttempt, null);
  const escalated = await until(sensitive, item => item.eventState === "escalated");
  assert.equal(escalated.resultCode, "SENSITIVE_QUESTION");
  assert.deepEqual(escalated.usage, []);
  assert.equal(escalated.messageId, null);
  assert.equal((await request(`/api/ops/outbox/${draft.messageId}/approve`, { expectedRevision: draft.revision })).status, 200);
  const sent = await until(inquiry, item => item.messageState === "accepted");
  assert.ok(sent.sendAttempt);
  await tick();
  assert.equal(state(inquiry).sendAttempt, sent.sendAttempt);
  assert.equal(state(inquiry).revision, sent.revision);
});
