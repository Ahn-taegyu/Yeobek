import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DbClient } from "@/lib/api/db";
import { extractMaterial } from "@/lib/ai/material-service";
import { rpc } from "@/lib/api/db";
import { downloadMaterialForRead } from "@/lib/storage/materials";
import { readMaterial } from "@/lib/ai/material-reader";
import { generateProposal } from "@/lib/ai/organization-service";
import { requireFeature } from "@/lib/features";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/api/db", () => ({ rpc: vi.fn() }));
vi.mock("@/lib/supabase/worker", () => ({ createWorkerSupabase: vi.fn(() => ({})) }));
vi.mock("@/lib/storage/materials", () => ({ downloadMaterialForRead: vi.fn() }));
vi.mock("@/lib/ai/material-reader", () => ({ readMaterial: vi.fn() }));
vi.mock("@/lib/ai/organization-service", () => ({ generateProposal: vi.fn() }));
vi.mock("@/lib/ai/runtime", () => ({ createConfiguredTextProvider: vi.fn() }));
vi.mock("@/lib/ai/routing", () => ({ isMockMode: () => true }));
vi.mock("@/lib/features", () => ({ requireFeature: vi.fn() }));

const id = "10000000-0000-4000-8000-000000000001";
const db = {} as DbClient;
const input = { requestId: id, documentId: id, expectedVersion: 1, expectedDocumentRevision: 1, consentToRead: true as const };
const read = { id, status: "running", mock: true, pageCount: 1, chunkCount: 0, method: null, resultCode: null };
const success = { ...read, status: "succeeded", chunkCount: 1, method: "text_pdf", resultCode: "OK" };
const reservation = { read, claimed: true, storageKey: "private-key", contentHash: "a".repeat(64), contentType: "application/pdf", byteSize: 4, maxPages: 20 };
beforeEach(() => { vi.resetAllMocks(); });

describe("explicit material read orchestration", () => {
  it("settles a read before requesting a W2 proposal and does not apply it", async () => {
    vi.mocked(rpc).mockResolvedValueOnce(reservation).mockResolvedValueOnce(success);
    vi.mocked(downloadMaterialForRead).mockResolvedValue(new Uint8Array(4));
    vi.mocked(readMaterial).mockResolvedValue({ method: "text_pdf", chunks: [{ pageStart: 1, pageEnd: 1, text: "Private original" }], usage: [], steps: [] });
    vi.mocked(generateProposal).mockResolvedValue({ job: { id } as never, created: true });
    expect(await extractMaterial(db, id, id, input)).toMatchObject({ read: success, proposalJob: { id } });
    expect(rpc).toHaveBeenNthCalledWith(2, expect.anything(), "complete_material_read", expect.objectContaining({
      p_chunks: [{ pageStart: 1, pageEnd: 1, text: "Private original" }], p_result_code: "OK",
    }));
    expect(generateProposal).toHaveBeenCalledWith(db, id, id, { requestId: id, expectedDocumentRevision: 1 }, expect.any(AbortSignal));
    expect(vi.mocked(rpc).mock.calls.map(call => call[1])).toEqual(["reserve_material_read", "complete_material_read"]);
  });
  it("reuses cached extraction without downloading or reading again", async () => {
    vi.mocked(rpc).mockResolvedValue({ ...reservation, claimed: false, read: success, storageKey: null, contentHash: null });
    vi.mocked(generateProposal).mockResolvedValue({ job: { id } as never, created: false });
    await extractMaterial(db, id, id, input);
    expect(downloadMaterialForRead).not.toHaveBeenCalled(); expect(readMaterial).not.toHaveBeenCalled();
    expect(rpc).toHaveBeenCalledOnce(); expect(generateProposal).toHaveBeenCalledOnce();
  });
  it("leaves a concurrent running read for polling instead of invoking another provider", async () => {
    vi.mocked(rpc).mockResolvedValue({ ...reservation, claimed: false });
    expect(await extractMaterial(db, id, id, input)).toEqual({ read, proposalJob: null });
    expect(readMaterial).not.toHaveBeenCalled(); expect(generateProposal).not.toHaveBeenCalled();
  });
  it("persists a generic failure without provider content and never generates a proposal", async () => {
    vi.mocked(rpc).mockResolvedValueOnce(reservation).mockResolvedValueOnce({ ...read, status: "failed", resultCode: "READ_FAILED" });
    vi.mocked(downloadMaterialForRead).mockRejectedValue(new Error("private source and URL must not escape"));
    expect(await extractMaterial(db, id, id, input)).toMatchObject({ read: { status: "failed" }, proposalJob: null });
    expect(rpc).toHaveBeenLastCalledWith(expect.anything(), "complete_material_read", expect.objectContaining({ p_chunks: [], p_method: null, p_result_code: "READ_FAILED" }));
    expect(JSON.stringify(vi.mocked(rpc).mock.calls)).not.toContain("private source and URL");
    expect(generateProposal).not.toHaveBeenCalled();
  });
  it("rejects a disabled feature before reserving work", async () => {
    vi.mocked(requireFeature).mockImplementation(() => { throw new Error("disabled"); });
    await expect(extractMaterial(db, id, id, input)).rejects.toThrow("disabled");
    expect(rpc).not.toHaveBeenCalled();
  });
});
