import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET as session } from "@/app/api/auth/session/route";
import { POST as signup } from "@/app/api/auth/signup/route";
import { POST as resend } from "@/app/api/auth/resend/route";
import { POST as verify } from "@/app/api/auth/verify/route";
import { authenticatedContext } from "@/lib/api/db";
import { ApiError } from "@/lib/api/errors";
import { signupSchema, verifySignupSchema } from "@/lib/contracts/signup";
import { loginSchema } from "@/lib/contracts/requests";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/api/db", () => ({ authenticatedContext: vi.fn() }));

const appOrigin = "https://app.example.test";
const requestId = "e6a7292d-760b-4f01-915c-4f724058a847";
const signupRequestId = "d6f8255f-ebce-44e9-ab73-455c6fb95ee5";
const userId = "0727c32d-e5ff-4370-994c-c20f30fc787e";
const email = "artist@example.test";
const password = "일이삼사오육칠팔";
const code = "012345";
const signupBody = { requestId, email, password, passwordConfirmation: password };
const confirmationBody = { requestId, signupRequestId, email };
const accessToken = "verification-access-token";
const refreshToken = "verification-refresh-token";
const user = { id: userId, email, email_confirmed_at: "2026-11-14T06:00:00Z" };

function request(path: string, body: object, origin = appOrigin) {
  return new Request(`${appOrigin}/api/auth/${path}`, {
    method: "POST", headers: { origin, "content-type": "application/json", cookie: "sb=existing-login-session" },
    body: JSON.stringify(body),
  });
}

const budgetPath = "/rest/v1/rpc/consume_signup_budget";
const identityPath = "/rest/v1/rpc/get_signup_verification_identity";
const createPath = "/auth/v1/admin/users";
const resendPath = "/auth/v1/resend";
const verifyPath = "/auth/v1/verify";
const revokePath = "/auth/v1/logout?scope=local";

const providerResponses: Record<string, () => Response> = {
  [budgetPath]: () => new Response(null, { status: 204 }),
  [identityPath]: () => Response.json(userId),
  [createPath]: () => Response.json({ ...user, email_confirmed_at: null }),
  [resendPath]: () => Response.json({}),
  [verifyPath]: () => Response.json({ access_token: accessToken, refresh_token: refreshToken, expires_in: 3600, user }),
  [revokePath]: () => new Response(null, { status: 204 }),
};

const providerFetch = vi.fn<typeof fetch>();
function mockProvider(overrides: typeof providerResponses = {}) {
  providerFetch.mockImplementation(async (input) => {
    const url = new URL(input instanceof Request ? input.url : input);
    const response = overrides[url.pathname + url.search] ?? providerResponses[url.pathname + url.search];
    if (!response) throw new Error(`Unexpected request to ${url.pathname}`);
    return response();
  });
}

function calls() {
  return providerFetch.mock.calls.map(([input, init]) => {
    const url = new URL(input instanceof Request ? input.url : input);
    return { path: url.pathname + url.search, headers: new Headers(init?.headers), body: init?.body ? JSON.parse(String(init.body)) : null };
  });
}

const providerError = (status: number, code = "unexpected_failure") => Response.json({ code, msg: "private provider details" }, {
  status, headers: { "x-supabase-api-version": "2024-01-01" },
});
const pending = { status: "verification_required", authenticated: false };

beforeEach(() => {
  vi.stubEnv("FEATURE_SIGNUP", "true");
  vi.stubEnv("APP_ORIGIN", appOrigin);
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://supabase.example.test");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "publishable-test-key");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "worker-test-key");
  vi.stubEnv("VISITOR_IP_HASH_SECRET", "signup-unit-test-secret-more-than-32-characters");
  vi.stubEnv("VERCEL", "");
  vi.stubGlobal("fetch", providerFetch);
  vi.spyOn(console, "error").mockImplementation(() => {});
  providerFetch.mockClear();
  mockProvider();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("artist email signup", () => {
  it("enforces Unicode minimum, provider byte limit, exact confirmation and mutation IDs", () => {
    expect(signupSchema.safeParse({ ...signupBody, password: "😀".repeat(8), passwordConfirmation: "😀".repeat(8) }).success).toBe(true);
    for (const value of ["😀".repeat(7), "😀".repeat(19), "abc\u0000defghi", "abc\uD800defghi"]) {
      expect(signupSchema.safeParse({ ...signupBody, password: value, passwordConfirmation: value }).success).toBe(false);
    }
    const mismatch = signupSchema.safeParse({ ...signupBody, passwordConfirmation: `${password} ` });
    expect(mismatch.error?.issues).toEqual([expect.objectContaining({ path: ["passwordConfirmation"] })]);
    expect(signupSchema.safeParse({ ...signupBody, requestId: "" }).success).toBe(false);
    expect(signupSchema.safeParse({ ...signupBody, role: "admin" }).success).toBe(false);
    expect(signupSchema.safeParse({ ...signupBody, email: "not-an-email" }).success).toBe(false);
    expect(verifySignupSchema.safeParse({ ...confirmationBody, code }).success).toBe(true);
    for (const value of [123456, "12345", "1234567", "１２３４５６", " 123456", "123456\n"]) {
      expect(verifySignupSchema.safeParse({ ...confirmationBody, code: value }).success).toBe(false);
    }
    expect(verifySignupSchema.safeParse({ requestId, email, code }).success).toBe(false);
    expect(loginSchema.safeParse({ email, password: "x" }).success).toBe(true);
  });

  it("validates origin, feature flag and body before making provider calls", async () => {
    for (const [handler, path, body] of [[signup, "signup", signupBody], [resend, "resend", confirmationBody], [verify, "verify", { ...confirmationBody, code }]] as const) {
      vi.stubEnv("FEATURE_SIGNUP", "true");
      expect((await handler(request(path, body, "https://foreign.example.test"))).status).toBe(403);
      expect((await handler(request(path, {}))).status).toBe(400);
      vi.stubEnv("FEATURE_SIGNUP", undefined);
      expect((await handler(request(path, body))).status).toBe(404);
    }
    expect(providerFetch).not.toHaveBeenCalled();
  });

  it("creates an unconfirmed account after the budget without sending or setting cookies", async () => {
    const response = await signup(request("signup", { ...signupBody, email: `  ${email.toUpperCase()}  ` }));
    expect(response.status).toBe(202);
    expect(response.headers.get("set-cookie")).toBeNull();
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect((await response.json()).data).toEqual(pending);
    const [budget, create, identity, mail] = calls();
    expect(calls().map(call => call.path)).toEqual([budgetPath, createPath, identityPath, resendPath]);
    expect(budget.body).toEqual({
      p_email_hash: expect.stringMatching(/^[a-f0-9]{64}$/), p_network_hash: expect.stringMatching(/^[a-f0-9]{64}$/),
      p_request_id: requestId, p_kind: "signup",
    });
    expect(budget.body.p_email_hash).not.toBe(budget.body.p_network_hash);
    expect(create.body).toEqual({ email, password, email_confirm: false, app_metadata: { yeobek_signup_request_id: requestId } });
    expect(identity.body).toEqual({ p_email: email, p_signup_request_id: requestId });
    expect(mail.body).toMatchObject({ email, type: "signup" });
    for (const item of [budget, create, identity, mail]) expect(item.headers.has("cookie")).toBe(false);
    expect(create.headers.get("apikey")).toBe("worker-test-key");
    expect(mail.headers.get("apikey")).toBe("publishable-test-key");
  });

  it("preserves a duplicate account and only resumes email confirmation for its original request", async () => {
    mockProvider({ [createPath]: () => providerError(422, "email_exists"), [identityPath]: () => Response.json(null) });
    const duplicate = await signup(request("signup", signupBody));
    expect(duplicate.status).toBe(202);
    expect((await duplicate.json()).data).toEqual(pending);
    expect(calls().map(call => call.path)).toEqual([budgetPath, createPath, identityPath]);

    mockProvider({ [createPath]: () => providerError(422, "email_exists") });
    const resumed = await signup(request("signup", signupBody));
    expect(resumed.status).toBe(202);
    expect(resumed.headers.get("set-cookie")).toBeNull();
    expect((await resumed.json()).data).toEqual(pending);
    const budgets = calls().filter(call => call.path === budgetPath);
    expect(budgets).toHaveLength(2);
    expect(budgets[0].body).toEqual(budgets[1].body);
    expect(calls().at(-1)?.path).toBe(resendPath);
  });

  it("keeps unknown and confirmed resend results generic and requires a matching attempt to verify", async () => {
    mockProvider({ [identityPath]: () => Response.json(null) });
    const mail = await resend(request("resend", confirmationBody));
    expect(mail.status).toBe(202);
    expect((await mail.json()).data).toEqual(pending);
    const verification = await verify(request("verify", { ...confirmationBody, code }));
    expect(verification.status).toBe(400);
    expect(verification.headers.get("set-cookie")).toBeNull();
    expect((await verification.json()).error.code).toBe("INVALID_VERIFICATION_CODE");
    expect(calls().map(call => call.path)).toEqual([budgetPath, identityPath, budgetPath, identityPath]);
    expect(calls()[0].body).toMatchObject({ p_kind: "resend" });
    expect(calls()[2].body).toMatchObject({ p_kind: "verify" });
  });

  it("revokes only the session created by verification and withholds both tokens", async () => {
    const result = await verify(request("verify", { ...confirmationBody, code }));
    expect(result.status).toBe(200);
    expect(result.headers.get("set-cookie")).toBeNull();
    expect((await result.json()).data).toEqual({ status: "verified", authenticated: false });
    const [, identity, otp, revoke] = calls();
    expect(calls().map(call => call.path)).toEqual([budgetPath, identityPath, verifyPath, revokePath]);
    expect(identity.body).toEqual({ p_email: email, p_signup_request_id: signupRequestId });
    expect(otp.body).toMatchObject({ email, token: code, type: "signup" });
    expect(otp.headers.get("apikey")).toBe("publishable-test-key");
    expect(revoke.headers.get("authorization")).toBe(`Bearer ${accessToken}`);
    expect(revoke.headers.get("apikey")).toBe("worker-test-key");
    expect(otp.headers.has("cookie")).toBe(false);
    expect(revoke.headers.has("cookie")).toBe(false);
  });

  it("sanitizes failures and reserves 202 for a known outcome", async () => {
    mockProvider({ [budgetPath]: () => providerError(400, "P1040") });
    const denied = await signup(request("signup", signupBody));
    expect(denied.status).toBe(429);
    expect(denied.headers.get("retry-after")).toBe("60");
    expect(calls().map(call => call.path)).toEqual([budgetPath]);

    for (const [path, code, status, expected] of [
      [createPath, "unexpected_failure", 500, 503], [createPath, "not_admin", 403, 503],
      [identityPath, "unexpected_failure", 500, 503], [resendPath, "unexpected_failure", 500, 503],
      [resendPath, "over_email_send_rate_limit", 429, 429],
    ] as const) {
      mockProvider({ [path]: () => providerError(status, code) });
      const failed = await signup(request("signup", signupBody));
      expect(failed.status).toBe(expected);
      expect(failed.headers.get("set-cookie")).toBeNull();
      expect(await failed.text()).not.toContain("private provider details");
    }

    mockProvider({ [identityPath]: () => Response.json(null) });
    expect((await signup(request("signup", signupBody))).status).toBe(503);
  });

  it("returns 503 for invalid service configuration without contacting the provider", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "invalid-url");
    const result = await signup(request("signup", signupBody));
    expect(result.status).toBe(503);
    expect((await result.json()).error.code).toBe("SERVER_CONFIGURATION_ERROR");
    expect(providerFetch).not.toHaveBeenCalled();
  });

  it("handles expired OTPs, unexpected verifier identities and revocation failures", async () => {
    mockProvider({ [verifyPath]: () => providerError(403, "otp_expired") });
    const expired = await verify(request("verify", { ...confirmationBody, code }));
    expect(expired.status).toBe(400);
    expect((await expired.json()).error.code).toBe("INVALID_VERIFICATION_CODE");

    const failures: (typeof providerResponses)[] = [
      { [revokePath]: () => providerError(500) },
      { [identityPath]: () => Response.json(signupRequestId) },
    ];
    for (const overrides of failures) {
      mockProvider(overrides);
      const failed = await verify(request("verify", { ...confirmationBody, code }));
      expect(failed.status).toBe(503);
      expect(failed.headers.get("set-cookie")).toBeNull();
      const body = await failed.text();
      for (const secret of [accessToken, refreshToken, email, userId, "private provider details"]) expect(body).not.toContain(secret);
      expect(calls().at(-1)?.path).toBe(revokePath);
    }
  });

  it("reports existing session status even when signup is disabled and preserves configuration failures", async () => {
    vi.stubEnv("FEATURE_SIGNUP", "false");
    const context = vi.mocked(authenticatedContext);
    context.mockResolvedValueOnce({} as Awaited<ReturnType<typeof authenticatedContext>>);
    expect((await (await session()).json()).data).toEqual({ authenticated: true });
    context.mockRejectedValueOnce(new ApiError(401, "UNAUTHENTICATED", "로그인이 필요합니다."));
    expect((await (await session()).json()).data).toEqual({ authenticated: false });
    context.mockRejectedValueOnce(new ApiError(503, "SERVER_CONFIGURATION_ERROR", "서비스 설정을 확인해 주세요."));
    expect((await session()).status).toBe(503);
  });
});
