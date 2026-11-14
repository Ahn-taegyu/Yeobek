import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { localStatus } from "../../scripts/local-supabase.mjs";

const origin = process.env.TEST_APP_ORIGIN || "http://localhost:3000";
assert.ok(["localhost", "127.0.0.1"].includes(new URL(origin).hostname));
const disabledOnly = process.env.TEST_SIGNUP_DISABLED_ONLY === "true";

function browser(initialCookies = []) {
  const jar = new Map(initialCookies);
  return async (path, { method = "GET", body, expected = 200, noCookies = false } = {}) => {
    const response = await fetch(origin + path, {
      method, headers: { Origin: origin, "Content-Type": "application/json",
        Cookie: [...jar].map(([key, value]) => `${key}=${value}`).join("; ") },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const json = await response.json();
    assert.equal(response.status, expected, `${method} ${path}: ${json.error?.code ?? "unexpected status"}`);
    assert.match(response.headers.get("cache-control") || "", /no-store/);
    if (noCookies) assert.equal(response.headers.getSetCookie().length, 0, "registration never creates a browser session");
    for (const cookie of response.headers.getSetCookie()) {
      const [key, ...value] = cookie.split(";")[0].split("=");
      if (value.join("=")) jar.set(key, value.join("=")); else jar.delete(key);
    }
    return response.ok ? json.data : json.error;
  };
}

test("signup flag off leaves login/session available", { skip: !disabledOnly }, async () => {
  const request = browser();
  for (const path of ["signup", "resend", "verify"]) {
    await request(`/api/auth/${path}`, { method: "POST", body: {}, expected: 404, noCookies: true });
  }
  assert.deepEqual(await request("/api/auth/session"), { authenticated: false });
  await request("/api/auth/login", { method: "POST", body: {}, expected: 400 });
});

test("email verification requires the originating signup and never logs in automatically", { skip: disabledOnly }, async () => {
  const status = localStatus();
  const mailOrigin = status.MAILPIT_URL;
  assert.ok(mailOrigin && ["localhost", "127.0.0.1"].includes(new URL(mailOrigin).hostname));
  const admin = createClient(status.API_URL, status.SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  const anonymous = createClient(status.API_URL, status.ANON_KEY, { auth: { persistSession: false } });
  const request = browser();
  const email = `signup-${randomUUID()}@example.invalid`;
  const password = "Aa123456"; // Exactly eight characters: the confirmed policy boundary.
  const signupRequestId = randomUUID();
  const profile = { fullName: "가입 작가 이름", displayName: "가입 작가명" };
  const input = { email, password, passwordConfirmation: password, requestId: signupRequestId, profile };
  const accepted = { status: "verification_required", authenticated: false };
  const post = (path, body, expected = 202) => request(`/api/auth/${path}`, { method: "POST", body, expected, noCookies: true });

  async function codeFor(address) {
    for (let attempt = 0; attempt < 30; attempt++) {
      const list = await (await fetch(`${mailOrigin}/api/v1/messages?limit=100`)).json();
      const message = list.messages.find(item => item.To?.some(recipient => recipient.Address === address));
      if (message) {
        const full = await (await fetch(`${mailOrigin}/api/v1/message/${message.ID}`)).json();
        // Keep real local OTPs out of diagnostics and test failure values.
        const match = full.HTML?.match(/<strong>\s*(\d{6})\s*<\/strong>/i);
        assert.ok(match, "configured signup mail contains a six-digit code");
        assert.ok(!full.HTML.includes("/auth/v1/verify"), "mail does not bypass the app with an auto-login URL");
        return match[1];
      }
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    assert.fail("local signup confirmation mail was not delivered");
  }

  await post("signup", { ...input, password: "1234567", passwordConfirmation: "1234567" }, 400);
  await post("signup", { ...input, passwordConfirmation: "different" }, 400);
  assert.deepEqual(await post("signup", input), accepted);
  assert.deepEqual(await request("/api/auth/session"), { authenticated: false });
  await request("/api/admin/profile", { expected: 401 });
  await request("/api/auth/login", { method: "POST", body: { email, password }, expected: 401 });
  const code = await codeFor(email);
  const verification = { email, code, signupRequestId, requestId: randomUUID() };
  await post("verify", { ...verification, code: code === "000000" ? "111111" : "000000" }, 400);
  assert.deepEqual(await post("verify", verification, 200), { status: "verified", authenticated: false });
  await request("/api/admin/profile", { expected: 401 });
  assert.deepEqual(await request("/api/auth/session"), { authenticated: false });
  await post("verify", { ...verification, requestId: randomUUID() }, 400);

  await request("/api/auth/login", { method: "POST", body: { email, password } });
  assert.deepEqual(await request("/api/auth/session"), { authenticated: true });
  const first = await request("/api/admin/profile");
  const again = await request("/api/admin/profile");
  assert.equal(first.id, again.id, "profile remains lazy and unique");
  assert.equal(first.accountEmail, email);
  assert.equal(first.fullName, profile.fullName);
  assert.equal(first.displayName, profile.displayName);
  const duplicate = await post("signup", { ...input, requestId: randomUUID(), password: "Different123!", passwordConfirmation: "Different123!",
    profile: { fullName: "다른 이름", displayName: "다른 작가명" } });
  assert.deepEqual(duplicate, accepted, "confirmed duplicates do not disclose account existence");
  assert.equal((await request("/api/admin/profile")).displayName, profile.displayName);
  await request("/api/auth/logout", { method: "POST", body: {} });
  await request("/api/admin/profile", { expected: 401 });
  await request("/api/auth/login", { method: "POST", body: { email, password } });
  await request("/api/auth/logout", { method: "POST", body: {} });
  await request("/api/auth/login", { method: "POST", body: { email, password: "Different123!" }, expected: 401 });

  const pendingEmail = `pending-${randomUUID()}@example.invalid`;
  const creatorId = randomUUID(), unrelatedId = randomUUID();
  const pending = { email: pendingEmail, password, passwordConfirmation: password, requestId: creatorId };
  assert.deepEqual(await post("signup", pending), accepted);
  const pendingCode = await codeFor(pendingEmail);
  assert.deepEqual(await post("signup", { ...pending, requestId: unrelatedId }), accepted);
  assert.deepEqual(await post("resend", { email: pendingEmail, signupRequestId: unrelatedId, requestId: randomUUID() }), accepted);
  await post("verify", { email: pendingEmail, code: pendingCode, signupRequestId: unrelatedId, requestId: randomUUID() }, 400);
  await request("/api/auth/login", { method: "POST", body: { email: pendingEmail, password }, expected: 401 });
  // Same originating request still has a valid code: a foreign signup cannot consume it.
  await post("verify", { email: pendingEmail, code: pendingCode, signupRequestId: creatorId, requestId: randomUUID() }, 200);

  // Resume a pending creation whose initial mail/response was lost, without creating a second account.
  const resumedEmail = `resend-${randomUUID()}@example.invalid`, resumedId = randomUUID();
  const created = await admin.auth.admin.createUser({ email: resumedEmail, password, email_confirm: false,
    app_metadata: { yeobek_signup_request_id: resumedId } });
  assert.equal(created.error, null);
  assert.deepEqual(await post("resend", { email: resumedEmail, signupRequestId: resumedId, requestId: randomUUID() }), accepted);
  await post("verify", { email: resumedEmail, code: await codeFor(resumedEmail), signupRequestId: resumedId, requestId: randomUUID() }, 200);

  const direct = await anonymous.auth.signUp({ email: `direct-${randomUUID()}@example.invalid`, password });
  assert.equal(direct.error?.code, "signup_disabled", "public Auth registration stays disabled");
  const profileCount = await admin.from("artist_profiles").select("id", { count: "exact", head: true }).eq("id", first.id);
  assert.equal(profileCount.count, 1);

  // A provider-issued OTP session remains unusable even if someone supplies its cookies directly.
  const link = await admin.auth.admin.generateLink({ type: "magiclink", email });
  assert.equal(link.error, null);
  const providerOtp = await anonymous.auth.verifyOtp({ token_hash: link.data.properties.hashed_token, type: "magiclink" });
  assert.equal(providerOtp.error, null);
  assert.equal((await anonymous.rpc("get_artist_profile")).error?.code, "42501");
  const rows = await anonymous.from("artist_profiles").select("id").eq("id", first.id);
  assert.equal(rows.error, null);
  assert.deepEqual(rows.data, [], "a direct OTP token cannot read existing owner rows");
  const otpCookies = new Map();
  const ssr = createServerClient(status.API_URL, status.ANON_KEY, {
    cookies: { getAll: () => [...otpCookies].map(([name, value]) => ({ name, value })),
      setAll: values => values.forEach(({ name, value }) => otpCookies.set(name, value)) },
  });
  assert.equal((await ssr.auth.setSession(providerOtp.data.session)).error, null);
  const otpBrowser = browser(otpCookies);
  assert.deepEqual(await otpBrowser("/api/auth/session"), { authenticated: false });
  await otpBrowser("/api/admin/profile", { expected: 401 });
  await admin.auth.admin.signOut(providerOtp.data.session.access_token, "local");

  // Different networks racing for one email must not exceed the shared quota.
  const emailHash = randomUUID().replaceAll("-", "").repeat(2);
  const attempts = await Promise.all(Array.from({ length: 7 }, () => admin.rpc("consume_signup_budget", {
    p_network_hash: randomUUID().replaceAll("-", "").repeat(2), p_email_hash: emailHash,
    p_request_id: randomUUID(), p_kind: "signup",
  })));
  assert.equal(attempts.filter(item => !item.error).length, 5);
  assert.equal(attempts.filter(item => item.error?.code === "P1040").length, 2);
});
