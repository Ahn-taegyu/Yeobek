import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { authorizeCron } from "../../src/lib/api/cron";
afterEach(() => vi.unstubAllEnvs());
const secret = "local-unit-only-0123456789abcdef012345";
describe("scheduled cleanup authentication", () => {
  it("fails closed on absent or short server secrets", () => {
    for (const value of ["", "short"]) {
      vi.stubEnv("CRON_SECRET", value);
      expect(() => authorizeCron(new Request("http://localhost/api/cron/purge"))).toThrow(expect.objectContaining({ status: 503 }));
    }
  });
  it("accepts only the exact Bearer header", () => {
    vi.stubEnv("CRON_SECRET", secret);
    for (const value of ["", secret, `Bearer ${secret}x`, `Bearer ${secret.slice(0, -1)}z`]) {
      expect(() => authorizeCron(new Request("http://localhost/api/cron/purge", { headers: { authorization: value } })))
        .toThrow(expect.objectContaining({ status: 404 }));
    }
    expect(() => authorizeCron(new Request("http://localhost/api/cron/purge", { headers: { authorization: `Bearer ${secret}` } }))).not.toThrow();
  });
});
