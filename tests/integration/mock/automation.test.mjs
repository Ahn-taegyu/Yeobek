import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";
import { localStatus } from "../../../scripts/local-supabase.mjs";

const base = process.env.TEST_APP_ORIGIN || "http://localhost:3001";
assert.ok(["localhost", "127.0.0.1"].includes(new URL(base).hostname));
const cronSecret = process.env.TEST_CRON_SECRET;
assert.ok(cronSecret?.length >= 32, "TEST_CRON_SECRET must match the local mock app");
function sql(query) {
  return execFileSync("docker", ["exec", "supabase_db_yeobek-mvp", "psql", "-U", "postgres", "-d", "postgres", "-Atqc", query],
    { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 30000 }).trim();
}
test("real exhibition event to mock notification, approval, dispatch and policy gates", async t => {
  const status = localStatus();
  const admin = createClient(status.API_URL, status.SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  const previous = await admin.from("automation_policies").select("mode,allowed_categories").eq("kind", "notify").single();
  assert.equal(previous.error, null);
  async function policy(mode) {
    const changed = await admin.from("automation_policies").update({ mode, allowed_categories: ["transactional"] }).eq("kind", "notify");
    assert.equal(changed.error, null);
  }
  const account = { email: `notify-${randomUUID()}@example.invalid`, password: randomUUID() + "A1!" };
  const created = await admin.auth.admin.createUser({ ...account, email_confirm: true });
  assert.equal(created.error, null);
  const owner = created.data.user.id;
  assert.equal((await admin.from("operators").upsert({ user_id: owner, enabled: true })).error, null);
  t.after(async () => {
    await admin.from("operators").update({ enabled: false }).eq("user_id", owner);
    await admin.from("automation_policies").update(previous.data).eq("kind", "notify");
  });
  const jar = new Map();
  async function request(path, body, method = body ? "POST" : "GET", cron = false) {
    const response = await fetch(base + path, { method, headers: {
      Origin: base, "Content-Type": "application/json", ...(cron ? { Authorization: `Bearer ${cronSecret}` } : {}),
      Cookie: [...jar].map(([key, value]) => `${key}=${value}`).join("; "),
    }, body: body === undefined ? undefined : JSON.stringify(body) });
    for (const value of response.headers.getSetCookie()) {
      const [key, ...parts] = value.split(";")[0].split("="); jar.set(key, parts.join("="));
    }
    assert.match(response.headers.get("cache-control") || "", /no-store/);
    return { status: response.status, ...await response.json() };
  }
  assert.equal((await request("/api/auth/login", account)).status, 200);
  assert.equal((await request("/api/cron/automation", undefined, "POST")).status, 404);
  const consent = granted => request("/api/admin/profile/consents", {
    category: "transactional", granted, expectedRevision: granted ? 0 : 1,
  }, "PATCH");
  assert.equal((await consent(true)).status, 200);
  async function exhibit() {
    const id = randomUUID();
    const result = await request("/api/admin/exhibitions", { id, title: "PRIVATE-NOTIFY-CANARY",
      sections: [{ id: "introduction", body: "UNPUBLISHED-SOURCE-CANARY" }], sourceRefs: [] });
    assert.equal(result.status, 201); return id;
  }
  function state(id) {
    // IDs are generated here, never interpolated from HTTP/customer strings.
    assert.match(id, /^[0-9a-f-]{36}$/);
    const data = sql(`select jsonb_build_object('eventState',e.state,'eventId',e.id,'messageId',m.id,'messageState',m.state,
      'body',m.body,'revision',m.revision,'resultCode',m.result_code,'sendAttempt',m.send_attempt,'jobId',j.id,
      'jobStatus',j.status,'steps',a.steps,'usage',a.usage)
      from public.automation_events e left join public.outbound_messages m on m.event_id=e.id
      left join public.ai_jobs j on j.automation_event_id=e.id
      left join public.ai_job_attempts a on a.job_id=j.id and a.attempt=j.attempt
      where e.exhibition_id='${id}' and e.trigger_kind='exhibition_created'`);
    return data ? JSON.parse(data) : null;
  }
  async function until(id, ready) {
    for (let index = 0; index < 40; index++) {
      const batch = await request("/api/cron/automation", undefined, "POST", true);
      assert.equal(batch.status, 200, JSON.stringify(batch));
      assert.equal(batch.data.mock, true); assert.equal(batch.data.persistenceFailures, 0);
      const current = state(id);
      if (current && ready(current)) return current;
    }
    assert.fail("notification did not reach expected state within bounded queue drain");
  }
  await t.test("draft requires approval and sends once with current consent", async () => {
    await policy("draft");
    const id = await exhibit();
    const draft = await until(id, value => value.messageState === "draft");
    assert.equal(draft.jobStatus, "succeeded");
    assert.ok(draft.steps.some(step => step.id === "status.recheck" && step.status === "done"));
    assert.equal(draft.usage[0].mock, true);
    assert.doesNotMatch(draft.body, /PRIVATE-NOTIFY|UNPUBLISHED-SOURCE/);
    assert.equal((await request(`/api/ops/outbox/${draft.messageId}/approve`, { expectedRevision: draft.revision })).status, 200);
    const accepted = await until(id, value => value.messageState === "accepted");
    await request("/api/cron/automation", undefined, "POST", true);
    assert.equal(state(id).sendAttempt, accepted.sendAttempt);
    assert.equal(state(id).revision, accepted.revision);
  });
  await t.test("auto policy delivers transaction notices while off does no model work", async () => {
    await policy("auto");
    const autoId = await exhibit();
    await until(autoId, value => value.messageState === "accepted");
    await policy("off");
    const offId = await exhibit();
    const off = await until(offId, value => value.eventState === "suppressed");
    assert.equal(off.messageId, null); assert.equal(off.jobId, null);
  });
  await t.test("consent withdrawal blocks even an automatically approved notification", async () => {
    await policy("auto");
    assert.equal((await consent(false)).status, 200);
    const id = await exhibit();
    const withheld = await until(id, value => value.messageState === "suppressed");
    assert.equal(withheld.resultCode, "CONSENT_REQUIRED");
    assert.equal(withheld.sendAttempt, null);
  });
});
