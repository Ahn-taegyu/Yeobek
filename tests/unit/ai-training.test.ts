import { beforeEach, describe, expect, it, vi } from "vitest";
import { createTrainingBatch, loadTrainingBatch, runTrainingTarget } from "@/lib/ai/training-service";
import type { DbClient } from "@/lib/api/db";
import { ids } from "../fixtures/ai";

const { rpc, runReservedNarration, runExpectedQa } = vi.hoisted(() => ({
  rpc: vi.fn(), runReservedNarration: vi.fn(), runExpectedQa: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/api/db", () => ({ rpc }));
vi.mock("@/lib/supabase/worker", () => ({ createWorkerSupabase: () => worker }));
vi.mock("@/lib/ai/author-service", () => ({ runReservedNarration }));
vi.mock("@/lib/ai/expected-qa-service", () => ({ runExpectedQa }));

const db = {} as DbClient;
const worker = {} as DbClient;
const batchId = ids.publication;
const targetId = ids.evidence;
const target = { id: targetId, kind: "narration", scope: "artwork", artworkId: ids.artwork, targetName: "작품",
  jobId: null, status: "queued", attempt: null, resultCode: null };
const batch = { id: batchId, exhibitionId: ids.exhibition, exhibitionName: "전시", artistName: "작가", status: "queued", targets: [target] };
const now = "2026-11-14T04:00:00Z";
const nomination = { id: ids.other, kind: "narration", artworkId: ids.artwork, documentId: ids.artwork, requestId: ids.request,
  mock: false, expectedRevision: 2, expectedDocumentRevision: 3, attempt: 1, strategy: "single", status: "running", routing: "none",
  resultCode: null, result: null, createdAt: now, updatedAt: now, expiresAt: now };

beforeEach(() => {
  rpc.mockReset().mockResolvedValue(batch);
  runReservedNarration.mockReset();
  runExpectedQa.mockReset();
});

describe("exhibition training batch execution", () => {
  it("creates and reads the manifest without a model call", async () => {
    await expect(createTrainingBatch(ids.owner, ids.exhibition, { requestId: ids.request, expectedRevision: 2 }, false)).resolves.toEqual(batch);
    await expect(loadTrainingBatch(db, batchId)).resolves.toEqual(batch);
    expect(rpc.mock.calls).toEqual([
      [worker, "create_training_batch", { p_owner: ids.owner, p_exhibition_id: ids.exhibition, p_request_id: ids.request,
        p_expected_revision: 2, p_include_exhibition_qa: false }], [db, "get_training_batch", { p_batch_id: batchId }],
    ]);
    expect(runReservedNarration).not.toHaveBeenCalled();
    expect(runExpectedQa).not.toHaveBeenCalled();
  });

  it("claims only the requested narration target, runs the existing harness, and reloads persisted status", async () => {
    const later = { ...batch, status: "completed", targets: [{ ...target, status: "succeeded", jobId: nomination.id, attempt: 1 }] };
    const reserved = { claimed: true, job: nomination, context: null };
    rpc.mockResolvedValueOnce(batch).mockResolvedValueOnce(reserved).mockResolvedValueOnce(later);
    await expect(runTrainingTarget(db, ids.owner, batchId, targetId, { requestId: ids.request, expectedAttempt: 0 }, false)).resolves.toEqual(later);
    expect(rpc.mock.calls.map(call => call[1])).toEqual(["get_training_batch", "claim_training_target", "get_training_batch"]);
    expect(rpc.mock.calls[1][2]).toMatchObject({ p_target_id: targetId, p_expected_attempt: 0, p_owner: ids.owner });
    expect(runReservedNarration).toHaveBeenCalledWith(db, ids.owner, reserved, undefined);
    expect(runExpectedQa).not.toHaveBeenCalled();
  });

  it("rejects disabled exhibition targets before claim and skips the model when replaying a reservation", async () => {
    rpc.mockResolvedValueOnce({ ...batch, targets: [{ ...target, kind: "expected_qa", scope: "exhibition", artworkId: null }] });
    await expect(runTrainingTarget(db, ids.owner, batchId, targetId, { requestId: ids.request, expectedAttempt: 0 }, false)).rejects.toMatchObject({ status: 404 });
    expect(rpc).toHaveBeenCalledOnce();
    rpc.mockResolvedValueOnce(batch).mockResolvedValueOnce({ claimed: false, job: nomination, context: null });
    await runTrainingTarget(db, ids.owner, batchId, targetId, { requestId: ids.request, expectedAttempt: 0 }, true);
    expect(runReservedNarration).not.toHaveBeenCalled();
    expect(runExpectedQa).not.toHaveBeenCalled();
  });
});
