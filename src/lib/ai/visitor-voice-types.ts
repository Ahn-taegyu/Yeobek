import type { SavedVisitorReply } from "../contracts/visitor";
import type { AiProviderTrace, AiSpeechResponse } from "./providers/types";
import type { PlaybookStepRecord } from "./playbook";

export type VoiceRunResult = { result: Record<string, unknown> | null; failureCode: string | null;
  usage: AiProviderTrace[]; elapsedMs: number; steps: readonly PlaybookStepRecord[] };
export interface VisitorVoiceStore {
  reserve(): Promise<void>;
  complete(result: VoiceRunResult): Promise<void>;
  read(): Promise<SavedVisitorReply>;
  store(audio: AiSpeechResponse, reply: SavedVisitorReply): Promise<Record<string, unknown>>;
}
