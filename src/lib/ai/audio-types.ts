import type { AiProviderTrace, AiSpeechResponse } from "./providers/types";
import type { PlaybookStepRecord } from "./playbook";

export type ApprovedAudioContext = {
  assetId: string; storageKey: string; text: string; textHash: string;
  approvalId: string; voiceConfigVersion: number; voiceFingerprint: string; mock: boolean;
};
export type AudioRunResult = {
  status: "succeeded" | "failed" | "cancelled"; resultCode: string; routing: "author" | "operator" | "none";
  contentHash?: string; byteSize?: number; elapsedMs: number;
  usage: AiProviderTrace[]; steps: readonly PlaybookStepRecord[];
};
export interface AuthorAudioStore {
  read(): Promise<ApprovedAudioContext>;
  store(context: ApprovedAudioContext, audio: AiSpeechResponse): Promise<{ contentHash: string; byteSize: number }>;
}
