import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({ rpc: vi.fn(), upload: vi.fn(), download: vi.fn(), synthesize: vi.fn() }));
vi.mock("@/lib/api/db", () => ({ rpc: mocks.rpc }));
vi.mock("@/lib/api/publication", () => ({ decodeDatabase: (schema: { parse: (raw: unknown) => unknown }, raw: unknown) => schema.parse(raw) }));
vi.mock("@/lib/supabase/worker", () => ({ createWorkerSupabase: () => ({ storage: { from: () => ({ upload: mocks.upload, download: mocks.download }) } }) }));
vi.mock("@/lib/ai/voice", () => ({ speechIdentity: () => ({ fingerprint: "a".repeat(64), mock: true }) }));
vi.mock("@/lib/ai/runtime", () => ({ createConfiguredSpeechProvider: () => ({ synthesize: mocks.synthesize }) }));

import { retryAudio } from "@/lib/ai/audio-service";
import { ApiError } from "@/lib/api/errors";
import type { AudioJob } from "@/lib/contracts/jobs";
import type { AudioRunResult } from "@/lib/ai/audio-types";

const id = "00000000-0000-4000-8000-000000000001";
const now = "2026-11-14T00:00:00Z";
const text = "승인된 문구 그대로입니다.";
const textHash = createHash("sha256").update(text).digest("hex");
const job: AudioJob = { id, kind: "audio", artworkId: id, documentId: id, requestId: id,
  mock: true, expectedRevision: 1, expectedDocumentRevision: 1, attempt: 2, strategy: null,
  status: "running", routing: "none", resultCode: null, result: null, createdAt: now, updatedAt: now, expiresAt: now };
const context = { assetId: id, storageKey: `${id}/audio/${id}/2.mp3`, text, textHash,
  approvalId: id, voiceConfigVersion: 1, voiceFingerprint: "a".repeat(64), mock: true };
const bytes = Uint8Array.from([0xff, 0xfb, 0x10, 0xc4]);
let completion: AudioRunResult | undefined;

beforeEach(() => {
  vi.resetAllMocks();
  completion = undefined;
  mocks.upload.mockResolvedValue({ error: null });
  mocks.synthesize.mockResolvedValue({ audio: bytes, contentType: "audio/mpeg", trace: { provider: "mock", model: "mock-speech", mock: true } });
  mocks.rpc.mockImplementation(async (_db, name, args) => {
    if (name === "retry_audio_job") return { job, claimed: true };
    if (name === "get_audio_context") return context;
    if (name === "complete_audio_job") {
      completion = args.p_result;
      return { ...job, status: completion!.status, resultCode: completion!.resultCode, routing: completion!.routing,
        result: completion!.status === "succeeded" ? { assetId: id, approvalId: id, textHash, voiceConfigVersion: 1, mock: true } : null };
    }
    throw new Error(`Unexpected RPC ${name}`);
  });
});
const run = (signal?: AbortSignal) => retryAudio(id, id, { requestId: id, expectedAttempt: 1 }, signal);

describe("approved narration audio worker", () => {
  it("preserves reservation errors including retry guidance and field details", async () => {
    const error = new ApiError(429, "AUTHOR_JOB_LIMIT", "한도 안내", { requestId: ["재시도 안내"] }, 60);
    mocks.rpc.mockRejectedValueOnce(error);
    await expect(run()).rejects.toBe(error);
    expect(mocks.synthesize).not.toHaveBeenCalled();
    expect(completion).toBeUndefined();
  });

  it("replays a job without synthesis, Storage or another completion", async () => {
    mocks.rpc.mockResolvedValueOnce({ job, claimed: false });
    expect(await run()).toEqual({ job, created: false });
    expect(mocks.synthesize).not.toHaveBeenCalled();
    expect(mocks.upload).not.toHaveBeenCalled();
    expect(completion).toBeUndefined();
  });

  it("synthesizes exact approved text and persists usage and ordered steps", async () => {
    expect((await run()).job.status).toBe("succeeded");
    expect(mocks.synthesize).toHaveBeenCalledWith({ text, signal: expect.any(AbortSignal) });
    expect(completion).toMatchObject({ status: "succeeded", byteSize: bytes.length,
      contentHash: createHash("sha256").update(bytes).digest("hex"), usage: [{ provider: "mock", mock: true }] });
    expect(completion!.steps.map(step => step.id)).toEqual([
      "request.validate", "job.reserve", "audio.read", "model.synthesize", "output.validate", "audio.recheck", "audio.store",
    ]);
  });

  it("settles cancellation observed after upload as cancelled, never ready", async () => {
    const controller = new AbortController();
    mocks.upload.mockImplementation(async () => { controller.abort(); return { error: null }; });
    expect((await run(controller.signal)).job.status).toBe("cancelled");
    expect(completion).toMatchObject({ resultCode: "REQUEST_CANCELLED", routing: "none" });
  });

  it("settles a claimed reservation even when cancellation arrives with its response", async () => {
    const controller = new AbortController();
    mocks.rpc.mockImplementationOnce(async () => { controller.abort(); return { job, claimed: true }; });
    expect((await run(controller.signal)).job.status).toBe("cancelled");
    expect(mocks.synthesize).not.toHaveBeenCalled();
    expect(completion!.steps.find(step => step.id === "job.reserve")?.status).toBe("failed");
  });

  it("rejects a stored collision whose bytes differ instead of overwriting it", async () => {
    mocks.upload.mockResolvedValue({ error: { statusCode: "409" } });
    mocks.download.mockResolvedValue({ data: new Blob([new Uint8Array([0xff, 0xfb, 0x10, 0xc5])]), error: null });
    expect((await run()).job.resultCode).toBe("AI_INVALID_OUTPUT");
    expect(mocks.upload).toHaveBeenCalledTimes(1);
    expect(completion!.status).toBe("failed");
  });

  it("accepts an exact stored collision and preserves immutable upload semantics", async () => {
    mocks.upload.mockResolvedValue({ error: { status: 409 } });
    mocks.download.mockResolvedValue({ data: new Blob([bytes]), error: null });
    expect((await run()).job.status).toBe("succeeded");
    expect(mocks.upload).toHaveBeenCalledWith(context.storageKey, bytes, { contentType: "audio/mpeg", upsert: false });
  });

  it("does not upload when approval becomes unavailable after synthesis", async () => {
    mocks.synthesize.mockImplementation(async () => {
      mocks.rpc.mockRejectedValueOnce(new ApiError(409, "REVISION_CONFLICT", "승인 변경"));
      return { audio: bytes, contentType: "audio/mpeg", trace: { provider: "mock", model: "mock-speech", mock: true } };
    });
    expect((await run()).job.resultCode).toBe("REVISION_CONFLICT");
    expect(mocks.upload).not.toHaveBeenCalled();
    expect(completion!.usage).toHaveLength(1);
  });
});
