import "server-only";
import { createHash } from "node:crypto";
import type { z } from "zod";
import { rpc } from "../api/db";
import { ApiError } from "../api/errors";
import { decodeDatabase } from "../api/publication";
import { transcriptionResult, voiceReservation } from "../contracts/voice";
import { AI_LIMITS, codepoints } from "../contracts/chat";
import type { readTranscription } from "../api/multipart";
import { createWorkerSupabase } from "../supabase/worker";
import { abortable, createDeadline } from "./deadline";
import { AiError } from "./errors";
import { normalizeAiOutcome } from "./outcome";
import { capabilitiesFor, DOCENT_COPY } from "./plugin";
import { startPlaybook } from "./playbook";
import { isMockMode } from "./routing";
import { createConfiguredTranscriptionProvider } from "./runtime";
import type { VoiceRunResult } from "./visitor-voice-types";

type Reservation = z.infer<typeof voiceReservation>;
class TranscriptionReplay extends Error {}
function rejectReplay(row: Reservation) {
  if (row.status === "running") throw new ApiError(409, "REQUEST_IN_PROGRESS", "음성을 인식하고 있습니다. 잠시 후 같은 요청으로 확인해 주세요.", undefined, 2);
  if (row.status !== "failed") return;
  const code = row.failureCode ?? "AI_GENERATION_FAILED";
  const statuses: Record<string, number> = { REQUEST_TIMEOUT: 504, REQUEST_CANCELLED: 499,
    RATE_LIMITED: 429, SERVER_CONFIGURATION_ERROR: 503, PROVIDER_UNAVAILABLE: 503,
    AI_INVALID_OUTPUT: 502, AI_GENERATION_FAILED: 502, INTERNAL_ERROR: 500,
    CONTENT_CHANGED: 404, NOT_FOUND: 404, INVALID_INPUT: 400 };
  throw new ApiError(statuses[code] ?? 502, code, DOCENT_COPY.systemError);
}

/** Returns an editable transcript only. It never submits a chat turn or stores the recording. */
export async function transcribeVisitor(input: Awaited<ReturnType<typeof readTranscription>>, sessionHash: string, signal?: AbortSignal) {
  const worker = createWorkerSupabase({ timeoutMs: 15_000 });
  const deadline = createDeadline(60_000, signal);
  const flow = startPlaybook("visitor-transcribe");
  const started = performance.now();
  let row: Reservation | undefined;
  let mock = false;
  let inputHash = "";
  let originalError: unknown;
  const result: VoiceRunResult = { result: null, failureCode: null, usage: [], elapsedMs: 0, steps: [] };
  const active = () => { if (deadline.signal.aborted) throw new AiError(deadline.timedOut() ? "timeout" : "cancelled"); };
  const caps = capabilitiesFor("visitor-transcribe", { voice: {
    async reserve() {
      active();
      row = decodeDatabase(voiceReservation, await rpc(worker, "reserve_visitor_voice", {
        p_session_hash: sessionHash, p_exhibition_id: input.exhibitionId, p_request_id: input.requestId,
        p_input_hash: inputHash, p_kind: "transcription", p_mock: mock,
      }));
      if (!row.claimed) throw new TranscriptionReplay();
      active(); // A late reservation must still reach failure settlement.
    },
    async complete(value) {
      row = decodeDatabase(voiceReservation, await rpc(worker, "complete_visitor_voice", {
        p_session_hash: sessionHash, p_id: row!.id, p_result: value.result, p_failure_code: value.failureCode,
      }));
    },
    async read() { throw new Error("transcription_has_no_answer"); },
    async store() { throw new Error("recordings_are_not_stored"); },
  } });
  const load = async () => {
    active();
    const raw = await rpc(worker, "load_visitor_voice", { p_session_hash: sessionHash, p_id: row!.id });
    active();
    if (!raw) throw new ApiError(404, "NOT_FOUND", "인식 결과를 사용할 수 없습니다.");
    const transcript = decodeDatabase(transcriptionResult, raw);
    return { ...transcript, overLimit: codepoints(transcript.transcript) > AI_LIMITS.question };
  };
  try {
    try {
      await flow.step("request.validate", async () => {
        active();
        mock = isMockMode();
        const audioHash = createHash("sha256").update(new Uint8Array(await input.file.arrayBuffer())).digest("hex");
        inputHash = createHash("sha256").update(JSON.stringify({ kind: "transcription", exhibitionId: input.exhibitionId,
          audioHash, mime: input.file.type })).digest("hex");
        active();
      });
      await flow.step("voice.reserve", caps["voice.reserve"]);
      const output = await flow.step("model.transcribe", async () => {
        active();
        const response = await abortable(deadline.signal, current =>
          createConfiguredTranscriptionProvider().transcribe({ audio: input.file,
            filename: input.filename, language: "ko", signal: current }));
        result.usage.push(response.trace);
        active();
        return response;
      });
      await flow.step("output.validate", () => {
        active();
        const parsed = transcriptionResult.safeParse({ requestId: input.requestId, transcript: output.text, mock });
        if (!parsed.success || Boolean(output.trace.mock) !== mock) throw new AiError("invalid_response");
        result.result = parsed.data;
      });
    } catch (error) {
      if (error instanceof TranscriptionReplay) {
        flow.fail(error);
        rejectReplay(row!);
        return await load();
      }
      originalError = error;
      const failure = normalizeAiOutcome(deadline.signal.aborted ? new AiError(deadline.timedOut() ? "timeout" : "cancelled") : error);
      if (!row?.claimed) {
        flow.fail(error);
        if (error instanceof ApiError) throw error;
        throw new ApiError(failure.status, failure.code, DOCENT_COPY.systemError);
      }
      result.result = null;
      result.failureCode = failure.code;
    }
    let steps;
    try {
      steps = await flow.settleStep("voice.complete", async currentSteps => {
        await caps["voice.complete"]({ ...result, steps: currentSteps, elapsedMs: Math.round(performance.now() - started) });
      });
    } catch (error) {
      // A rejected completion must not leave a known claimed request running.
      // If the success committed but its response was lost, the DB rejects this
      // conflicting failure and retains the original success for replay.
      const failure = normalizeAiOutcome(error);
      try { await caps["voice.complete"]({ ...result, result: null, failureCode: failure.code }); }
      catch { console.error("visitor_transcription_settlement_failure", { requestId: input.requestId }); }
      if (error instanceof ApiError) throw error;
      throw new ApiError(failure.status, failure.code, DOCENT_COPY.systemError);
    }
    try {
      await rpc(worker, "record_visitor_execution", { p_session_hash: sessionHash, p_id: row!.id,
        p_steps: steps, p_usage: result.usage, p_elapsed_ms: Math.min(300_000, Math.round(performance.now() - started)) });
    } catch { console.error("visitor_transcription_metadata_failure", { requestId: input.requestId }); }
    if (originalError instanceof ApiError) throw originalError;
    rejectReplay(row!);
    return await load();
  } finally { deadline.dispose(); }
}
