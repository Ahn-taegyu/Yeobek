import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({ rpc: vi.fn(), worker: vi.fn(), materials: vi.fn(), audio: vi.fn(), visitorAudio: vi.fn() }));
vi.mock("@/lib/api/db", () => ({ rpc: mocks.rpc }));
vi.mock("@/lib/api/publication", () => ({ decodeDatabase: (schema: { parse: (value: unknown) => unknown }, raw: unknown) => schema.parse(raw) }));
vi.mock("@/lib/supabase/worker", () => ({ createWorkerSupabase: mocks.worker }));
vi.mock("@/lib/storage/materials", () => ({ cleanupMaterials: mocks.materials }));
vi.mock("@/lib/storage/audio", () => ({ cleanupAudio: mocks.audio }));
vi.mock("@/lib/storage/visitor-audio", () => ({ cleanupVisitorAudio: mocks.visitorAudio }));
import { GET, HEAD, POST } from "@/app/api/cron/purge/route";

const secret = "local-unit-only-0123456789abcdef012345";
const worker = {};
const cleanup = { attempted: 2, completed: 1 };
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("CRON_SECRET", secret);
  mocks.worker.mockReturnValue(worker);
  mocks.rpc.mockResolvedValue({ answers: 1, gaps: 2, jobs: 3 });
  mocks.materials.mockResolvedValue(cleanup);
  mocks.audio.mockResolvedValue(cleanup);
  mocks.visitorAudio.mockResolvedValue(cleanup);
});
afterEach(() => vi.unstubAllEnvs());

it("rejects HEAD without running cleanup", async () => {
  const response = HEAD();
  expect(response.status).toBe(405);
  expect(response.headers.get("allow")).toBe("GET, POST");
  expect(response.headers.get("cache-control")).toContain("no-store");
  expect(mocks.worker).not.toHaveBeenCalled();
  expect(mocks.rpc).not.toHaveBeenCalled();
  expect(mocks.materials).not.toHaveBeenCalled();
  expect(mocks.audio).not.toHaveBeenCalled();
  expect(mocks.visitorAudio).not.toHaveBeenCalled();
});

describe.each([["GET", GET], ["POST", POST]] as const)("purge %s", (method, handler) => {
  it("rejects unauthorized requests before performing cleanup", async () => {
    const response = await handler(new Request("http://localhost/api/cron/purge", { method }));
    expect(response.status).toBe(404);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(mocks.worker).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(mocks.materials).not.toHaveBeenCalled();
    expect(mocks.audio).not.toHaveBeenCalled();
    expect(mocks.visitorAudio).not.toHaveBeenCalled();
  });

  it("runs the existing purge and storage cleanup for each authorized request", async () => {
    for (let i = 0; i < 2; i++) {
      const response = await handler(new Request("http://localhost/api/cron/purge", {
        method, headers: { authorization: `Bearer ${secret}` },
      }));
      expect(response.status).toBe(200);
      expect(response.headers.get("cache-control")).toContain("no-store");
      expect((await response.json()).data).toEqual({ answers: 1, gaps: 2, jobs: 3, materials: cleanup, audio: cleanup, visitorAudio: cleanup });
    }
    expect(mocks.worker).toHaveBeenCalledWith({ timeoutMs: 15_000 });
    expect(mocks.rpc).toHaveBeenCalledTimes(2);
    expect(mocks.rpc).toHaveBeenCalledWith(worker, "purge_expired", {});
    expect(mocks.materials).toHaveBeenCalledTimes(2);
    expect(mocks.audio).toHaveBeenCalledTimes(2);
    expect(mocks.visitorAudio).toHaveBeenCalledTimes(2);
  });
});
