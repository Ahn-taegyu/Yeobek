import "server-only";
import { createHash } from "node:crypto";
import { z } from "zod";
import { rpc, type DbClient } from "../api/db";
import { ApiError } from "../api/errors";
import type { readTranscription } from "../api/multipart";
import { decodeDatabase } from "../api/publication";
import { AI_LIMITS, codepoints } from "../contracts/chat";
import { transcriptionResult } from "../contracts/voice";
import { createWorkerSupabase } from "../supabase/worker";
import { abortable, createDeadline } from "./deadline";
import { AiError } from "./errors";
import { normalizeAiOutcome } from "./outcome";
import { loadPreviewAnswer } from "./preview-service";
import { isMockMode } from "./routing";
import { createConfiguredSpeechProvider, createConfiguredTranscriptionProvider } from "./runtime";
import { speechIdentity } from "./voice";

const sha = (value: string | Uint8Array) => createHash("sha256").update(value).digest("hex");
const reservation = z.object({ id: z.uuid(), claimed: z.boolean(), status: z.enum(["running", "succeeded", "failed"]), failureCode: z.string().nullable(), mock: z.boolean() });
const saved = z.object({ result: z.unknown().nullable(), audio: z.string().nullable(), mock: z.boolean() });
const statuses: Record<string, number> = { REQUEST_TIMEOUT: 504, REQUEST_CANCELLED: 499, RATE_LIMITED: 429,
  SERVER_CONFIGURATION_ERROR: 503, PROVIDER_UNAVAILABLE: 503, AI_INVALID_OUTPUT: 502, AI_GENERATION_FAILED: 502,
  AI_INVALID_CONTEXT: 500, INTERNAL_ERROR: 500, NOT_FOUND: 404, INVALID_INPUT: 400 };
const terminalFailure = (code: string | null): ApiError => new ApiError(statuses[code ?? "AI_GENERATION_FAILED"] ?? 502, "PREVIEW_VOICE_FAILED", "음성 요청을 처리하지 못했습니다.");
const completion = z.object({ status: z.enum(["succeeded", "failed"]), failureCode: z.string().nullable() });

type Work = { owner: string; exhibition: string; answer: string | null; request: string; kind: "transcription" | "speech"; hash: string; mock: boolean };
async function execute(work: Work, signal: AbortSignal | undefined,
  generate: (signal: AbortSignal) => Promise<{ result: unknown | null; audio: string | null }>) {
  const worker = createWorkerSupabase({ timeoutMs: 15_000 });
  const deadline = createDeadline(60_000, signal);
  let row: z.infer<typeof reservation> | undefined;
  const active = () => { if (deadline.signal.aborted) throw new AiError(deadline.timedOut() ? "timeout" : "cancelled"); };
  try {
    active();
    row = decodeDatabase(reservation, await rpc(worker, "reserve_preview_voice", { p_owner: work.owner, p_exhibition: work.exhibition,
      p_answer: work.answer, p_request: work.request, p_kind: work.kind, p_hash: work.hash, p_mock: work.mock }));
    if (row.claimed) {
      try {
        active();
        const output = await abortable(deadline.signal, generate);
        active();
        const completed = completion.parse(await rpc(worker, "complete_preview_voice", { p_owner: work.owner, p_id: row.id, p_result: output.result, p_audio: output.audio, p_failure: null }));
        if (completed.status === "failed") throw terminalFailure(completed.failureCode);
      } catch (error) {
        if (error instanceof ApiError && error.code === "PREVIEW_VOICE_FAILED") throw error;
        const failure = normalizeAiOutcome(deadline.signal.aborted ? new AiError(deadline.timedOut() ? "timeout" : "cancelled") : error);
        let settled: z.infer<typeof completion> | undefined;
        try {
          const result = await rpc(worker, "complete_preview_voice", { p_owner: work.owner, p_id: row.id, p_result: null, p_audio: null, p_failure: failure.code });
          const parsed = completion.safeParse(result);
          if (parsed.success) settled = parsed.data;
        } catch { console.error("preview_voice_settlement_failure", { requestId: work.request }); }
        if (settled?.status === "failed" && !deadline.signal.aborted) throw terminalFailure(settled.failureCode);
        if (error instanceof ApiError && !deadline.signal.aborted) throw error;
        throw new ApiError(failure.status, failure.code, "음성 요청을 처리하지 못했습니다.");
      }
    } else if (row.status === "running") throw new ApiError(409, "REQUEST_IN_PROGRESS", "음성을 처리하고 있습니다.", undefined, 2);
    else if (row.status === "failed") throw terminalFailure(row.failureCode);
    active();
    const data = decodeDatabase(saved, await rpc(worker, "load_preview_voice", { p_owner: work.owner, p_id: row.id }));
    active();
    return data;
  } catch (error) {
    if (deadline.signal.aborted) {
      const failure = normalizeAiOutcome(new AiError(deadline.timedOut() ? "timeout" : "cancelled"));
      throw new ApiError(failure.status, failure.code, "음성 요청을 처리하지 못했습니다.");
    }
    throw error;
  } finally { deadline.dispose(); }
}

export async function transcribePreview(owner: string, input: Awaited<ReturnType<typeof readTranscription>>, signal?: AbortSignal) {
  const mock = isMockMode();
  const audioHash = sha(new Uint8Array(await input.file.arrayBuffer()));
  const hash = sha(JSON.stringify({ kind: "transcription", exhibitionId: input.exhibitionId, audioHash, mime: input.file.type }));
  const data = await execute({ owner, exhibition: input.exhibitionId, answer: null, request: input.requestId, kind: "transcription", hash, mock }, signal,
    async current => {
      const output = await createConfiguredTranscriptionProvider().transcribe({ audio: input.file, filename: input.filename, language: "ko", signal: current });
      const parsed = transcriptionResult.safeParse({ requestId: input.requestId, transcript: output.text, mock });
      if (!parsed.success || Boolean(output.trace.mock) !== mock) throw new AiError("invalid_response");
      return { result: parsed.data, audio: null };
    });
  const transcript = decodeDatabase(transcriptionResult, data.result);
  return { ...transcript, overLimit: codepoints(transcript.transcript) > AI_LIMITS.question };
}

export async function speakPreview(db: DbClient, owner: string, answerId: string, requestId: string, signal?: AbortSignal) {
  if (signal?.aborted) throw new ApiError(499, "REQUEST_CANCELLED", "음성 요청이 취소되었습니다.");
  const source = await loadPreviewAnswer(db, answerId);
  if (source.status !== "succeeded" || !source.result) throw new ApiError(404, "NOT_FOUND", "미리보기 답변을 찾을 수 없습니다.");
  const identity = speechIdentity();
  if ((source.mock || source.result.mock) && !identity.mock) throw new ApiError(404, "NOT_FOUND", "미리보기 답변을 찾을 수 없습니다.");
  const text = source.result.answer;
  const hash = sha(JSON.stringify({ answerId, text, voice: identity.fingerprint }));
  const data = await execute({ owner, exhibition: source.exhibitionId, answer: answerId, request: requestId, kind: "speech", hash, mock: identity.mock }, signal,
    async current => {
      const output = await createConfiguredSpeechProvider().synthesize({ text, signal: current });
      const bytes = output.audio;
      const id3 = bytes.length >= 10 && bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33;
      const frame = bytes.length >= 4 && bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0 && (bytes[1] & 0x06) !== 0;
      if (output.contentType !== "audio/mpeg" || bytes.length > 2 * 1024 * 1024 || (!id3 && !frame) || Boolean(output.trace.mock) !== identity.mock)
        throw new AiError("invalid_response");
      return { result: null, audio: Buffer.from(bytes).toString("base64") };
    });
  if (!data.audio || data.mock !== identity.mock) throw new ApiError(404, "NOT_FOUND", "음성을 찾을 수 없습니다.");
  const bytes = Buffer.from(data.audio, "base64");
  const current = await loadPreviewAnswer(db, answerId);
  if (current.status !== "succeeded" || current.result?.answer !== text) throw new ApiError(404, "NOT_FOUND", "미리보기 답변을 찾을 수 없습니다.");
  if (signal?.aborted) throw new ApiError(499, "REQUEST_CANCELLED", "음성 요청이 취소되었습니다.");
  return new Response(new Uint8Array(bytes).buffer, { headers: { "Content-Type": "audio/mpeg", "Content-Length": String(bytes.length), "X-Yeobek-Mock": String(data.mock) } });
}
