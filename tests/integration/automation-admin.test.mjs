import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";
import { localStatus } from "../../scripts/local-supabase.mjs";

const base = process.env.TEST_APP_ORIGIN || "http://localhost:3000";
assert.ok(["localhost", "127.0.0.1"].includes(new URL(base).hostname));
test("consent and operator review through real cookie sessions", async t => {
  const status = localStatus();
  const admin = createClient(status.API_URL, status.SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  const jars = [new Map(), new Map()];
  const owners = [];
  async function request(path, { body, method = body ? "POST" : "GET", user = 0, origin = base } = {}) {
    const jar = jars[user] ?? new Map();
    const response = await fetch(base + path, { method, headers: { Origin: origin, "Content-Type": "application/json",
      Cookie: [...jar].map(([key, value]) => `${key}=${value}`).join("; ") }, body: body === undefined ? undefined : JSON.stringify(body) });
    for (const value of response.headers.getSetCookie()) {
      const [key, ...parts] = value.split(";")[0].split("="); jar.set(key, parts.join("="));
    }
    assert.match(response.headers.get("cache-control") ?? "", /no-store/);
    return { status: response.status, ...await response.json() };
  }
  for (let user = 0; user < 2; user++) {
    const account = { email: `automation-${randomUUID()}@example.invalid`, password: randomUUID() + "A1!" };
    const created = await admin.auth.admin.createUser({ ...account, email_confirm: true });
    assert.equal(created.error, null); owners.push(created.data.user.id);
    assert.equal((await request("/api/auth/login", { body: account, user })).status, 200);
  }
  t.after(async () => { await admin.from("operators").upsert({ user_id: owners[1], enabled: false }); });
  await t.test("separate opt-in defaults, revision conflicts, owner isolation and same-origin guard", async () => {
    assert.equal((await request("/api/admin/profile/consents", { user: null })).status, 401);
    const initial = await request("/api/admin/profile/consents");
    assert.equal(initial.status, 200);
    assert.ok(initial.data.every(item => item.granted === false && item.revision === 0));
    const input = { category: "transactional", granted: true, expectedRevision: 0 };
    assert.equal((await request("/api/admin/profile/consents", { method: "PATCH", body: input, origin: "https://evil.invalid" })).status, 403);
    assert.equal((await request("/api/admin/profile/consents", { method: "PATCH", body: { ...input, ownerId: owners[1] } })).status, 400);
    const saved = await request("/api/admin/profile/consents", { method: "PATCH", body: input });
    assert.equal(saved.status, 200); assert.equal(saved.data.revision, 1);
    assert.equal((await request("/api/admin/profile/consents", { method: "PATCH", body: input })).status, 409);
    const own = (await request("/api/admin/profile/consents")).data;
    assert.equal(own.find(item => item.category === "marketing").granted, false);
    assert.ok((await request("/api/admin/profile/consents", { user: 1 })).data.every(item => item.granted === false));
  });
  const eventId = randomUUID(); const messageId = randomUUID();
  // A synthetic, unsent draft isolates HTTP review from the unfinished executor.
  // All interpolated values are locally generated UUIDs; no customer inputs or credentials.
  execFileSync("docker", ["exec", "-i", "supabase_db_yeobek-mvp", "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1"], {
    encoding: "utf8", stdio: ["pipe", "pipe", "pipe"], timeout: 30000,
    input: `begin;
      insert into public.automation_events(id,kind,trigger_kind,dedupe_key,owner_id,mock,state,expires_at)
        values('${eventId}','notify','published','http:${eventId}','${owners[0]}',true,'processed',now()+interval '30 days');
      insert into public.outbound_messages(id,event_id,owner_id,channel,category,body,state,policy_revision,mock)
        select '${messageId}','${eventId}','${owners[0]}','mail','transactional',repeat('🌿',2000),'draft',revision,true
        from public.automation_policies where kind='notify';
      commit;`,
  });
  await t.test("only operators see drafts and simultaneous approve/reject accepts one revision", async () => {
    assert.equal((await request("/api/ops/outbox")).status, 404);
    assert.equal((await request(`/api/ops/outbox/${messageId}/approve`, { body: { expectedRevision: 1 } })).status, 404);
    execFileSync(process.execPath, ["scripts/local-operator.mjs", owners[1]], { stdio: "pipe", timeout: 30000 });
    const list = await request("/api/ops/outbox", { user: 1 });
    assert.equal(list.status, 200);
    const draft = list.data.items.find(item => item.id === messageId);
    assert.equal(draft.state, "draft"); assert.equal(Array.from(draft.body).length, 2000);
    for (const key of ["ownerId", "recipient", "bindingId", "sendAttempt", "steps"]) assert.equal(key in draft, false);
    assert.equal((await request(`/api/ops/outbox/${messageId}/approve`, { user: 1, body: { expectedRevision: 1, body: "replacement" } })).status, 400);
    const choices = await Promise.all(["approve", "reject"].map(action => request(`/api/ops/outbox/${messageId}/${action}`, { user: 1, body: { expectedRevision: 1 } })));
    assert.deepEqual(choices.map(result => result.status).sort(), [200, 409]);
    assert.equal(choices.find(result => result.status === 200).data.revision, 2);
    assert.equal((await request(`/api/ops/outbox/${randomUUID()}/approve`, { user: 1, body: { expectedRevision: 1 } })).status, 404);
  });
  await t.test("local role revocation takes effect with the same login cookie", async () => {
    execFileSync(process.execPath, ["scripts/local-operator.mjs", owners[1], "--disable"], { stdio: "pipe", timeout: 30000 });
    assert.equal((await request("/api/ops/outbox", { user: 1 })).status, 404);
  });
});
