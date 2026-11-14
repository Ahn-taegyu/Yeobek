import { beforeEach, describe, expect, it, vi } from "vitest";
import { authenticatedContext } from "@/lib/api/db";

const { getUser, getClaims } = vi.hoisted(() => ({ getUser: vi.fn(), getClaims: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({ createServerSupabase: async () => ({ auth: { getUser, getClaims } }) }));

const userId = "85be7816-0894-435b-8950-9f0d6efe522c";
const user = { id: userId, email_confirmed_at: "2026-11-14T04:00:00Z", app_metadata: { yeobek_signup_request_id: "signup-id" } };

beforeEach(() => {
  getUser.mockReset().mockResolvedValue({ data: { user }, error: null });
  getClaims.mockReset();
});

describe("signed artist signup sessions", () => {
  it("accepts password AMR for the same confirmed signup account", async () => {
    getClaims.mockResolvedValue({ data: { claims: { sub: userId, amr: [{ method: "password", timestamp: 42 }] } }, error: null });
    await expect(authenticatedContext()).resolves.toMatchObject({ user });
  });

  it("denies provider verification sessions and claims for another subject", async () => {
    for (const claims of [
      { sub: userId, amr: [{ method: "otp" }] }, { sub: userId, amr: [] },
      { sub: userId }, { sub: "different-user", amr: [{ method: "password" }] },
    ]) {
      getClaims.mockResolvedValueOnce({ data: { claims }, error: null });
      await expect(authenticatedContext()).rejects.toMatchObject({ status: 401, code: "UNAUTHENTICATED" });
    }
  });

  it("does not admit an unconfirmed signup account and keeps legacy access compatible", async () => {
    getUser.mockResolvedValueOnce({ data: { user: { ...user, email_confirmed_at: null } }, error: null });
    await expect(authenticatedContext()).rejects.toMatchObject({ status: 401, code: "UNAUTHENTICATED" });
    getUser.mockResolvedValueOnce({ data: { user: { ...user, app_metadata: {} } }, error: null });
    await expect(authenticatedContext()).resolves.toMatchObject({ user: { id: userId } });
    expect(getClaims).not.toHaveBeenCalled();
  });

  it("keeps signing-provider outages distinct from rejected claims", async () => {
    getClaims.mockResolvedValueOnce({ data: null, error: { status: 503 } });
    await expect(authenticatedContext()).rejects.toMatchObject({ status: 503, code: "SERVICE_UNAVAILABLE" });
    getClaims.mockResolvedValueOnce({ data: null, error: { status: 400 } });
    await expect(authenticatedContext()).rejects.toMatchObject({ status: 401, code: "UNAUTHENTICATED" });
  });
});
