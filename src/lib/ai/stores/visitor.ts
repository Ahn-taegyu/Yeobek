import "server-only";
import type { z } from "zod";
import { rpc, type DbClient } from "../../api/db";
import { ApiError } from "../../api/errors";
import { decodeDatabase } from "../../api/publication";
import { savedVisitorReply, visitorReservation, type SavedVisitorReply } from "../../contracts/visitor";
import type { DocentReply, SpeechSourceStore } from "../contracts";
import { assertNotCancelled } from "../context";
import type { PlaybookStepRecord } from "../playbook";
import type { AiProviderTrace } from "../providers/types";

export type VisitorReservation = z.infer<typeof visitorReservation>;
export class VisitorReplay extends Error {
  constructor(readonly reservation: VisitorReservation) { super("Visitor request replay"); }
}
export function createVisitorStore(worker: DbClient, sessionHash: string) {
  return {
    async reserve(exhibitionId: string, requestId: string, inputHash: string, mock: boolean) {
      return decodeDatabase(visitorReservation, await rpc(worker, "reserve_visitor_request", {
        p_session_hash: sessionHash, p_exhibition_id: exhibitionId, p_request_id: requestId, p_input_hash: inputHash, p_mock: mock,
      }));
    },
    async complete(id: string, result: SavedVisitorReply | null, failureCode: string | null = null) {
      return decodeDatabase(visitorReservation, await rpc(worker, "complete_visitor_request", {
        p_session_hash: sessionHash, p_id: id, p_result: result, p_failure_code: failureCode,
      }));
    },
    async recordGap(requestId: string, question: string, enabled: boolean) {
      return await rpc(worker, "record_gap", { p_session_hash: sessionHash, p_request_id: requestId, p_question: question, p_enabled: enabled }) === true;
    },
    async load(id: string) {
      const raw = await rpc(worker, "load_visitor_answer", { p_session_hash: sessionHash, p_id: id });
      if (!raw) throw new ApiError(404, "NOT_FOUND", "답변을 사용할 수 없습니다.");
      return decodeDatabase(savedVisitorReply, raw);
    },
    async recordExecution(id: string, steps: readonly PlaybookStepRecord[], usage: readonly AiProviderTrace[], elapsedMs: number) {
      await rpc(worker, "record_visitor_execution", { p_session_hash: sessionHash, p_id: id,
        p_steps: steps, p_usage: usage, p_elapsed_ms: elapsedMs });
    },
  };
}

/** Speech caller supplies the server session hash, never a browser session ID. */
export function createSpeechSourceStore(worker: DbClient, sessionHash: string): SpeechSourceStore {
  return {
    async loadAnswer(sessionId, answerId, signal) {
      assertNotCancelled(signal);
      if (sessionId !== sessionHash) return null;
      const raw = await rpc(worker, "load_visitor_answer", { p_session_hash: sessionHash, p_id: answerId });
      assertNotCancelled(signal);
      if (!raw) return null;
      const reply = decodeDatabase(savedVisitorReply, raw);
      // Execution fingerprint is not needed for speaking a server-validated answer.
      const { answer, citations, outcome, publication, source, requestId, contextSequence, inputMode, outputMode } = reply;
      return { answer, citations, outcome, publication, source, requestId, contextSequence, inputMode, outputMode,
        promptVersion: "persisted-validated-answer" } satisfies Omit<DocentReply, "steps">;
    },
  };
}
