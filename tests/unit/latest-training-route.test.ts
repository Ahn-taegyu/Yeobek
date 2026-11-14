import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "@/app/api/admin/exhibitions/[id]/training/latest/route";
import { ApiError } from "@/lib/api/errors";
import { ids } from "../fixtures/ai";

const { authenticatedDb, loadLatestTrainingBatch } = vi.hoisted(() => ({ authenticatedDb: vi.fn(), loadLatestTrainingBatch: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/api/db", () => ({ authenticatedDb }));
vi.mock("@/lib/ai/training-service", () => ({ loadLatestTrainingBatch }));
const db = {};
const get = (id = ids.exhibition) => GET(new Request("http://localhost/api/admin/exhibitions/" + id + "/training/latest"),
  { params: Promise.resolve({ id }) });
afterEach(() => vi.unstubAllEnvs());
beforeEach(() => {
  vi.stubEnv("FEATURE_EXPECTED_QA", "true");
  authenticatedDb.mockReset().mockResolvedValue(db);
  loadLatestTrainingBatch.mockReset().mockResolvedValue(null);
});

describe("latest training route", () => {
  it("returns a private empty result through the authenticated client", async () => {
    const response = await get();
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store, max-age=0");
    expect(await response.json()).toMatchObject({ data: null });
    expect(loadLatestTrainingBatch).toHaveBeenCalledWith(db, ids.exhibition);
  });
  it("keeps the disabled feature inaccessible before authentication", async () => {
    vi.stubEnv("FEATURE_EXPECTED_QA", "false");
    expect((await get()).status).toBe(404);
    expect(authenticatedDb).not.toHaveBeenCalled();
    expect(loadLatestTrainingBatch).not.toHaveBeenCalled();
  });
  it("rejects invalid IDs without querying the database", async () => {
    expect((await get("invalid")).status).toBe(400);
    expect(loadLatestTrainingBatch).not.toHaveBeenCalled();
  });
  it("keeps authentication and ownership errors private", async () => {
    authenticatedDb.mockRejectedValueOnce(new ApiError(401, "UNAUTHENTICATED", "Login required"));
    const unauthenticated = await get();
    expect(unauthenticated.status).toBe(401);
    expect(unauthenticated.headers.get("Cache-Control")).toContain("private, no-store");
    expect(loadLatestTrainingBatch).not.toHaveBeenCalled();
    loadLatestTrainingBatch.mockRejectedValueOnce(new ApiError(404, "NOT_FOUND", "Not found"));
    const foreign = await get();
    expect(foreign.status).toBe(404);
    expect(foreign.headers.get("Cache-Control")).toContain("private, no-store");
  });
});
