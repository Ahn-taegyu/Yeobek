import "server-only";
import { createHash } from "node:crypto";
import { z } from "zod";
import { rpc, type DbClient } from "../api/db";
import { ApiError } from "../api/errors";
import { decodeDatabase } from "../api/publication";
import { audioJobResponse, generateAudioSchema, type AudioJob, type RetryJob } from "../contracts/jobs";
import { createWorkerSupabase } from "../supabase/worker";
import { speechIdentity } from "./voice";
import { createConfiguredSpeechProvider } from "./runtime";
import { capabilitiesFor } from "./plugin";
import { startPlaybook } from "./playbook";
import { createDeadline } from "./deadline";
import { AiError } from "./errors";
import { normalizeAiOutcome } from "./outcome";
import type { AudioRunResult } from "./audio-types";

const sha256 = (data: string | Uint8Array) => createHash("sha256").update(data).digest("hex");
const hash = z.string().regex(/^[a-f0-9]{64}$/);
const audioContext = z.strictObject({ assetId: z.uuid(), storageKey: z.string().min(1), text: z.string().min(1), textHash: hash,
  approvalId: z.uuid(), voiceConfigVersion: z.number().int().positive(), voiceFingerprint: hash, mock: z.boolean() });
const reservation = z.object({ job: audioJobResponse, claimed: z.boolean() });
class AudioReplay extends Error { constructor(readonly job: AudioJob) { super("audio_job_replay"); } }

async function executeAudio(ownerId: string, claim: (worker: DbClient, fingerprint: string, mock: boolean) => Promise<unknown>, signal?: AbortSignal) {
  const worker = createWorkerSupabase({ timeoutMs: 15_000 });
  const deadline = createDeadline(120_000, signal);
  const flow = startPlaybook("narration-audio");
  const start = performance.now();
  let job: AudioJob | undefined;
  let claimed = false;
  let settled = false;
  let identity: ReturnType<typeof speechIdentity>;
  let result: AudioRunResult = { status: "failed", resultCode: "INTERNAL_ERROR", routing: "operator", elapsedMs: 0, usage: [], steps: [] };
  const active = () => {
    if (deadline.signal.aborted) throw new AiError(deadline.timedOut() ? "timeout" : "cancelled");
  };
  const caps = capabilitiesFor("narration-audio", {
    jobs: {
      async reserve() {
        active();
        const reserved = decodeDatabase(reservation, await claim(worker, identity.fingerprint, identity.mock));
        job = reserved.job;
        claimed = reserved.claimed;
        if (!claimed) throw new AudioReplay(job);
        active(); // A late reservation still reaches failure settlement below.
      },
      async complete(value) {
        job = decodeDatabase(audioJobResponse, await rpc(worker, "complete_audio_job", {
          p_owner: ownerId, p_job_id: job!.id, p_attempt: job!.attempt, p_result: value,
        }));
        settled = true;
      },
    },
    audio: {
      async read() {
        active();
        const context = decodeDatabase(audioContext, await rpc(worker, "get_audio_context", {
          p_owner: ownerId, p_job_id: job!.id, p_attempt: job!.attempt,
        }));
        active();
        if (context.voiceFingerprint !== identity.fingerprint || context.mock !== identity.mock ||
          sha256(context.text) !== context.textHash) throw new AiError("invalid_response");
        return context;
      },
      async store(context, audio) {
        active();
        const contentHash = sha256(audio.audio);
        const { error } = await worker.storage.from("artist-audio").upload(context.storageKey, audio.audio,
          { contentType: "audio/mpeg", upsert: false });
        if (error) {
          // A retry of the same Storage operation may find its previous result.
          if (!("status" in error && error.status === 409) && !("statusCode" in error && String(error.statusCode) === "409")) {
            throw new ApiError(503, "STORAGE_UNAVAILABLE", "음성 파일을 저장하지 못했습니다.");
          }
          const saved = await worker.storage.from("artist-audio").download(context.storageKey);
          if (saved.error || !saved.data || saved.data.size !== audio.audio.length ||
            sha256(new Uint8Array(await saved.data.arrayBuffer())) !== contentHash) throw new AiError("invalid_response");
        }
        active();
        return { contentHash, byteSize: audio.audio.length };
      },
    },
  });
  try {
    identity = await flow.step("request.validate", () => { active(); return speechIdentity(); });
    await flow.step("job.reserve", () => caps["job.reserve"]!());
    const context = await flow.step("audio.read", () => caps["audio.read"]());
    const audio = await flow.step("model.synthesize", async () => {
      active();
      const output = await createConfiguredSpeechProvider().synthesize({ text: context.text, signal: deadline.signal });
      result.usage = [output.trace];
      active();
      return output;
    });
    await flow.step("output.validate", () => {
      const bytes = audio.audio;
      const id3 = bytes.length >= 10 && bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33;
      const frame = bytes.length >= 4 && bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0;
      if (audio.contentType !== "audio/mpeg" || bytes.length > 8 * 1024 * 1024 || (!id3 && !frame) ||
        Boolean(audio.trace.mock) !== identity.mock) throw new AiError("invalid_response");
    });
    await flow.step("audio.recheck", async () => {
      const current = await caps["audio.read"]();
      if (current.assetId !== context.assetId || current.textHash !== context.textHash) throw new AiError("invalid_response");
    });
    const metadata = await flow.step("audio.store", () => caps["audio.store"](context, audio));
    active(); // Observe cancellation before starting the authoritative completion transaction.
    result = { ...result, ...metadata, status: "succeeded", resultCode: "OK", routing: "none" };
  } catch (error) {
    if (error instanceof AudioReplay) { flow.fail(error); deadline.dispose(); return { job: error.job, created: false }; }
    const failure = normalizeAiOutcome(error);
    if (!claimed) {
      flow.fail(error);
      deadline.dispose();
      if (error instanceof ApiError) throw error;
      throw new ApiError(failure.status, failure.code, "음성 작업을 시작하지 못했습니다.");
    }
    result = { ...result, status: failure.code === "REQUEST_CANCELLED" ? "cancelled" : "failed",
      resultCode: failure.code, routing: failure.routing };
  }
  try {
    await flow.settleJob(async steps => caps["job.complete"]!({ ...result, elapsedMs: Math.round(performance.now() - start), steps }));
    if (!job || !settled) throw new ApiError(500, "INTERNAL_ERROR", "음성 작업 결과를 확인하지 못했습니다.");
    return { job, created: true };
  } finally { deadline.dispose(); }
}

export async function generateAudio(db: DbClient, ownerId: string, artworkId: string, input: z.infer<typeof generateAudioSchema>, signal?: AbortSignal) {
  await rpc(db, "get_artwork", { p_id: artworkId });
  return executeAudio(ownerId, (worker, fingerprint, mock) => rpc(worker, "reserve_audio_job", {
    p_owner: ownerId, p_artwork_id: artworkId, p_approval_id: input.approvalId, p_expected_revision: input.expectedRevision,
    p_request_id: input.requestId, p_voice_fingerprint: fingerprint, p_mock: mock,
  }), signal);
}
export async function retryAudio(ownerId: string, id: string, input: RetryJob, signal?: AbortSignal) {
  return executeAudio(ownerId, (worker, fingerprint, mock) => rpc(worker, "retry_audio_job", {
    p_owner: ownerId, p_job_id: id, p_request_id: input.requestId, p_expected_attempt: input.expectedAttempt,
    p_voice_fingerprint: fingerprint, p_mock: mock,
  }), signal);
}

export type NarrationAudioOutcome = "ready" | "no_approval" | "running" | "failed";
const reviewAudio = z.object({
  artwork: z.object({ revision: z.number().int().positive() }).passthrough(),
  approval: z.object({ id: z.uuid() }).passthrough().nullable(),
  audio: z.object({ approvalId: z.uuid(), state: z.enum(["pending", "ready", "failed", "revoked"]) }).passthrough().nullable(),
}).passthrough();

function stableRequestId(...parts: string[]) {
  const h = sha256(parts.join(":"));
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-${(8 | (parseInt(h[16], 16) & 3)).toString(16)}${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

/**
 * Prepare the basic intro audio for the current approved narration so visitors never wait for live TTS.
 * Idempotent per approval and voice: concurrent callers share one job. Never throws; text publishing stays
 * available when speech is not configured or fails (publication only attaches audio that is ready).
 */
export async function ensureNarrationAudio(db: DbClient, ownerId: string, artworkId: string,
  { signal, waitMs = 0 }: { signal?: AbortSignal; waitMs?: number } = {}): Promise<NarrationAudioOutcome> {
  try {
    const read = async () => decodeDatabase(reviewAudio, await rpc(db, "get_review_bundle", { p_artwork_id: artworkId }));
    const review = await read();
    if (!review.approval) return "no_approval";
    if (review.audio?.approvalId === review.approval.id && review.audio.state === "ready") return "ready";
    let identity: ReturnType<typeof speechIdentity>;
    try { identity = speechIdentity(); } catch { return "failed"; }
    const input = { approvalId: review.approval.id, expectedRevision: review.artwork.revision };
    const fresh = async () => (await generateAudio(db, ownerId, artworkId, { ...input, requestId: crypto.randomUUID() }, signal)).job;
    let job: AudioJob;
    try {
      job = (await generateAudio(db, ownerId, artworkId, { ...input, requestId: stableRequestId("narration-audio",
        input.approvalId, String(input.expectedRevision), identity.fingerprint, String(identity.mock)) }, signal)).job;
    } catch (error) {
      if (signal?.aborted) throw error;
      job = await fresh(); // The shared job expired or no longer matches; start one new attempt.
    }
    // A shared job that already failed is retried once with a fresh request.
    if (job.status === "failed" || job.status === "cancelled") job = await fresh();
    const until = Date.now() + waitMs;
    while (job.status === "running" && Date.now() < until && !signal?.aborted) {
      await new Promise(resolve => setTimeout(resolve, 2000));
      const current = await read();
      if (current.audio?.approvalId === input.approvalId && current.audio.state === "ready") return "ready";
      if (current.audio?.approvalId === input.approvalId && current.audio.state === "failed") return "failed";
    }
    return job.status === "succeeded" ? "ready" : job.status === "running" ? "running" : "failed";
  } catch {
    console.error("narration_audio_prepare_failed", { artworkId });
    return "failed";
  }
}
