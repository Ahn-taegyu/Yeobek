import "server-only";
import { createHash } from "node:crypto";
import { z } from "zod";
import { rpc } from "../api/db";
import { ApiError } from "../api/errors";
import { decodeDatabase } from "../api/publication";
import { speechRequest, voiceReservation } from "../contracts/voice";
import { publicationRefSchema, savedVisitorReply } from "../contracts/visitor";
import { createWorkerSupabase } from "../supabase/worker";
import { readPublicMedia, MissingPublicMedia } from "../storage/public-media";
import { readMaterialResponse } from "../storage/validate";
import { abortable, createDeadline } from "./deadline";
import { AiError } from "./errors";
import { speakVerifiedReply } from "./harness";
import { normalizeAiOutcome } from "./outcome";
import { startPlaybook } from "./playbook";
import { capabilitiesFor } from "./plugin";
import { createConfiguredSpeechProvider } from "./runtime";
import { isMockMode } from "./routing";
import { createPublicationStore } from "./stores/publications";
import { createSpeechSourceStore, createVisitorStore } from "./stores/visitor";
import type { AiProviderTrace } from "./providers/types";
import { speechIdentity } from "./voice";

const bucket = "visitor-audio";
const maxBytes = 8 * 1024 * 1024;
const hash = z.string().regex(/^[a-f0-9]{64}$/);
const metadata = z.strictObject({ storageKey: z.string().regex(/^requests\/[a-f0-9-]{36}\.mp3$/),
  contentHash: hash, byteSize: z.number().int().positive().max(maxBytes), contentType: z.literal("audio/mpeg"),
  textHash: hash, mock: z.boolean(), publication: publicationRefSchema.nullable() });
const sha256 = (value: Uint8Array | string) => createHash("sha256").update(value).digest("hex");
const unavailable = () => new ApiError(404, "NOT_FOUND", "낭독할 답변을 찾을 수 없습니다.");
const storageUnavailable = () => new ApiError(503, "STORAGE_UNAVAILABLE", "음성 파일을 불러오지 못했습니다.");
const failureStatuses: Record<string, number> = { CONTENT_CHANGED: 404, NOT_FOUND: 404, REQUEST_CANCELLED: 499,
  REQUEST_TIMEOUT: 504, RATE_LIMITED: 429, PROVIDER_UNAVAILABLE: 503, SERVER_CONFIGURATION_ERROR: 503,
  STORAGE_UNAVAILABLE: 503, AI_INVALID_OUTPUT: 502, AI_GENERATION_FAILED: 502, AI_INVALID_CONTEXT: 500, INTERNAL_ERROR: 500 };

function replayFailure(code: string | null): never {
  if (code === "CONTENT_CHANGED" || code === "NOT_FOUND") throw unavailable();
  if (code && Object.hasOwn(failureStatuses, code)) throw new ApiError(failureStatuses[code], code, "음성을 준비하지 못했습니다.");
  throw new ApiError(502, "AI_GENERATION_FAILED", "음성을 준비하지 못했습니다.");
}

export async function speakVisitorAnswer(input: z.infer<typeof speechRequest>, sessionHash: string, signal?: AbortSignal,
  beforeReservation?: (exhibitionId: string) => Promise<void>) {
  const worker = createWorkerSupabase({ timeoutMs: 15_000 });
  const publications = createPublicationStore(worker);
  const answers = createSpeechSourceStore(worker, sessionHash);
  const execution = createVisitorStore(worker, sessionHash);
  const flow = startPlaybook("visitor-speech");
  const deadline = createDeadline(60_000, signal);
  const started = performance.now();
  const usage: AiProviderTrace[] = [];
  let identity: ReturnType<typeof speechIdentity>;
  let mock: boolean;
  let reply: z.infer<typeof savedVisitorReply>;
  let request: z.infer<typeof voiceReservation> | undefined;
  let result: z.infer<typeof metadata> | null = null;
  const elapsedMs = () => Math.min(300_000, Math.round(performance.now() - started));
  const active = () => {
    if (deadline.signal.aborted) throw new AiError(deadline.timedOut() ? "timeout" : "cancelled");
  };
  const load = async () => {
    active();
    const raw = await rpc(worker, "load_visitor_voice", { p_session_hash: sessionHash, p_id: request!.id });
    active();
    if (!raw) throw unavailable();
    const saved = decodeDatabase(metadata, raw);
    if (saved.mock !== mock || saved.textHash !== sha256(reply.answer) ||
      saved.publication?.publicationId !== reply.publication?.publicationId) throw unavailable();
    return saved;
  };
  const caps = capabilitiesFor("visitor-speech", { voice: {
    async read() {
      active();
      const raw = await rpc(worker, "load_visitor_answer", { p_session_hash: sessionHash, p_id: input.answerId });
      active();
      if (!raw) throw unavailable();
      const saved = decodeDatabase(savedVisitorReply, raw);
      if ((!saved.publication && saved.source !== "fixed") || (saved.mock && !mock)) throw unavailable();
      return saved;
    },
    async reserve() {
      active();
      identity = speechIdentity();
      const exhibitionId = reply.publication?.exhibitionId ?? await rpc(worker, "get_visitor_answer_exhibition", {
        p_session_hash: sessionHash, p_id: input.answerId,
      });
      if (typeof exhibitionId !== "string") throw unavailable();
      active();
      if (beforeReservation) await beforeReservation(exhibitionId);
      active();
      request = decodeDatabase(voiceReservation, await rpc(worker, "reserve_visitor_voice", {
        p_session_hash: sessionHash, p_exhibition_id: exhibitionId, p_request_id: input.requestId,
        p_input_hash: sha256(input.answerId), p_kind: "reply_audio", p_mock: identity.mock, p_answer_id: input.answerId,
        p_voice_fingerprint: identity.fingerprint,
      }));
      active();
    },
    async complete(value) {
      request = decodeDatabase(voiceReservation, await rpc(worker, "complete_visitor_voice", {
        p_session_hash: sessionHash, p_id: request!.id, p_result: value.result, p_failure_code: value.failureCode,
      }));
    },
    async store(audio, source) {
      active();
      const storageKey = `requests/${request!.id}.mp3`;
      const contentHash = sha256(audio.audio);
      const { error } = await worker.storage.from(bucket).upload(storageKey, audio.audio, { upsert: false, contentType: "audio/mpeg" });
      if (error) {
        if (!("status" in error && error.status === 409) && !("statusCode" in error && String(error.statusCode) === "409")) throw storageUnavailable();
        const existing = await worker.storage.from(bucket).download(storageKey);
        if (existing.error || !existing.data || existing.data.size !== audio.audio.length ||
          sha256(new Uint8Array(await existing.data.arrayBuffer())) !== contentHash) throw storageUnavailable();
      }
      active();
      return metadata.parse({ storageKey, contentHash, byteSize: audio.audio.length, contentType: "audio/mpeg",
        textHash: sha256(source.answer), publication: source.publication, mock: identity.mock });
    },
  } });
  const record = async (steps: Parameters<typeof execution.recordExecution>[1]) => {
    try { await execution.recordExecution(request!.id, steps, usage, elapsedMs()); }
    catch { console.error("visitor_speech_metadata_failure", { requestId: input.requestId }); }
  };
  try {
    try {
      mock = await flow.step("request.validate", () => { active(); return isMockMode(); });
      reply = await flow.step("answer.read", () => caps["voice.read"]());
      const reused = await flow.step("audio.reuse", async () => {
        if (reply.source !== "approved_narration") return null;
        let response: Response;
        try {
          response = await readPublicMedia(reply.publication!.publicationId, "audio", deadline.signal);
        } catch (error) {
          if (error instanceof MissingPublicMedia) return null;
          throw error;
        }
        const current = await caps["voice.read"]();
        if (current.answer !== reply.answer || current.publication?.publicationId !== reply.publication?.publicationId) throw unavailable();
        return response;
      });
      if (reused) {
        for (const step of ["voice.reserve", "model.synthesize", "output.validate", "answer.recheck", "audio.store", "voice.complete"] as const) flow.skip(step, "approved_audio");
        flow.finish();
        return reused;
      }
      await flow.step("voice.reserve", () => caps["voice.reserve"]());
      if (!request!.claimed) {
        await flow.step("model.synthesize", () => {
          if (request!.status === "running") throw new ApiError(409, "REQUEST_IN_PROGRESS", "음성을 준비하고 있습니다.", undefined, 2);
          if (request!.status === "failed") replayFailure(request!.failureCode);
        });
        for (const step of ["output.validate", "answer.recheck", "audio.store", "voice.complete"] as const) flow.skip(step, "cached_audio");
        flow.finish();
      } else {
        const audio = await flow.step("model.synthesize", async () => speakVerifiedReply({ sessionId: sessionHash, answerId: input.answerId },
          { answers, publications, speech: { async synthesize(value) {
            active();
            const output = await abortable(deadline.signal, current => createConfiguredSpeechProvider().synthesize({ ...value, signal: current }));
            usage.push(output.trace);
            active();
            return output;
          } } }, deadline.signal));
        await flow.step("output.validate", () => {
          const bytes = audio.audio;
          const id3 = bytes.length >= 10 && bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33;
          const frame = bytes.length >= 4 && bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0 && (bytes[1] & 0x06) !== 0;
          if (audio.contentType !== "audio/mpeg" || bytes.length > maxBytes || (!id3 && !frame) ||
            Boolean(audio.trace.mock) !== identity.mock || audio.textHash !== sha256(reply.answer)) throw new AiError("invalid_response");
        });
        await flow.step("answer.recheck", async () => {
          const current = await caps["voice.read"]();
          if (current.publication?.publicationId !== reply.publication?.publicationId ||
            current.answer !== reply.answer) throw unavailable();
        });
        await flow.step("audio.store", async () => {
          result = metadata.parse(await caps["voice.store"](audio, reply));
          active();
        });
        const steps = await flow.settleStep("voice.complete", async steps => caps["voice.complete"]({
          result, failureCode: null, usage, elapsedMs: elapsedMs(), steps,
        }));
        await record(steps);
        if (request!.status !== "succeeded") replayFailure(request!.failureCode);
      }
    } catch (error) {
      const failure = normalizeAiOutcome(deadline.signal.aborted ? new AiError(deadline.timedOut() ? "timeout" : "cancelled") : error);
      if (request?.claimed && request.status === "running") {
        try {
          const steps = await flow.settleStep("voice.complete", async steps => caps["voice.complete"]({
            result: null, failureCode: failure.code, usage, elapsedMs: elapsedMs(), steps,
          }));
          await record(steps);
        } catch {
          // If the successful completion RPC itself failed, the playbook has
          // already closed. Settle the lease independently without rerunning it.
          try { await caps["voice.complete"]({ result: null, failureCode: failure.code, usage, elapsedMs: elapsedMs(), steps: [] }); }
          catch { console.error("visitor_speech_settlement_failure", { requestId: input.requestId }); }
        }
      }
      if (error instanceof ApiError && !deadline.signal.aborted) throw error;
      throw new ApiError(failure.status, failure.code, "음성을 준비하지 못했습니다.");
    }

    const saved = await load();
    const signed = await worker.storage.from(bucket).createSignedUrl(saved.storageKey, 30);
    if (signed.error || !signed.data) throw storageUnavailable();
    const downloadTimeout = AbortSignal.timeout(15_000);
    let response: Response;
    let bytes: Uint8Array;
    try {
      response = await fetch(signed.data.signedUrl, { cache: "no-store", redirect: "error",
        signal: AbortSignal.any([deadline.signal, downloadTimeout]) });
      if (!response.ok || response.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "audio/mpeg") {
        await response.body?.cancel().catch(() => {});
        throw storageUnavailable();
      }
      bytes = await readMaterialResponse(response, saved.byteSize);
    } catch (error) {
      if (downloadTimeout.aborted && !deadline.signal.aborted) throw new ApiError(504, "REQUEST_TIMEOUT", "음성 응답 시간이 초과되었습니다.");
      if (deadline.signal.aborted) active();
      if (error instanceof ApiError && error.code === "STORAGE_UNAVAILABLE") throw error;
      throw storageUnavailable();
    }
    if (bytes.length !== saved.byteSize || sha256(bytes) !== saved.contentHash) throw storageUnavailable();
    const current = await load();
    if (current.storageKey !== saved.storageKey || current.contentHash !== saved.contentHash) throw unavailable();
    return new Response(bytes.buffer as ArrayBuffer, { headers: { "Content-Type": "audio/mpeg",
      "Content-Length": String(bytes.length), "X-Yeobek-Mock": String(saved.mock) } });
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if (deadline.signal.aborted) throw new ApiError(deadline.timedOut() ? 504 : 499,
      deadline.timedOut() ? "REQUEST_TIMEOUT" : "REQUEST_CANCELLED", "음성 요청이 중단되었습니다.");
    throw storageUnavailable();
  } finally { deadline.dispose(); }
}
