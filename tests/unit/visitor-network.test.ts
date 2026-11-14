import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("../../src/lib/supabase/worker", () => ({ createWorkerSupabase: vi.fn() }));
vi.mock("../../src/lib/api/db", () => ({ rpc: vi.fn() }));
import { visitorNetworkHash } from "../../src/lib/api/visitor-network";

const env = { NODE_ENV: "production", VERCEL: "1", VISITOR_IP_HASH_SECRET: "test-only-secret-at-least-32-characters" };
const hash = (ip: string, extra: Record<string, string> = {}) => visitorNetworkHash(new Headers({ "x-forwarded-for": ip, ...extra }), env);
describe("visitor network identity", () => {
  it("ignores rotating cookies and unrelated forwarding headers", () => {
    const first = hash("192.0.2.1", { cookie: "yeobek_visitor=one", "x-real-ip": "192.0.2.3" });
    expect(hash("192.0.2.1", { cookie: "yeobek_visitor=two", "x-real-ip": "192.0.2.4" })).toBe(first);
    expect(hash("192.0.2.2")).not.toBe(first);
    expect(first).toMatch(/^[a-f0-9]{64}$/);
    expect(first).not.toContain("192.0.2.1");
  });
  it("canonicalizes IPv6 aliases and mapped IPv4", () => {
    expect(hash("2001:db8::1")).toBe(hash("2001:0db8:0:0:0:0:0:1"));
    expect(hash("::ffff:192.0.2.1")).toBe(hash("192.0.2.1"));
  });
  it("fails closed for invalid trusted headers and missing production secrets", () => {
    for (const ip of ["", "192.0.2.1, 192.0.2.2", "garbage", "fe80::1%eth0"]) {
      expect(() => hash(ip)).toThrowError(expect.objectContaining({ code: "SERVER_CONFIGURATION_ERROR" }));
    }
    expect(() => visitorNetworkHash(new Headers(), { NODE_ENV: "production" })).toThrow();
  });
  it("does not trust client forwarding headers on unverified platforms", () => {
    const shared = { ...env, VERCEL: undefined };
    expect(visitorNetworkHash(new Headers({ "x-forwarded-for": "192.0.2.1" }), shared))
      .toBe(visitorNetworkHash(new Headers({ "x-forwarded-for": "198.51.100.2" }), shared));
    expect(visitorNetworkHash(new Headers(), { NODE_ENV: "test" })).toMatch(/^[a-f0-9]{64}$/);
  });
});
