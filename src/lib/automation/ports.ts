/** Dispatch is allowed only after the outbox atomically claims an approved revision
 * and rechecks policy, identity binding and consent. Adapters are not authorization. */
export type DispatchResult = {
  status: "accepted" | "rejected" | "unknown";
  code: "accepted" | "provider_rejected" | "rate_limited" | "ambiguous_transport";
  mock: boolean;
  providerMessageId?: string;
};

export interface MailPort {
  send(input: { recipient: string; template: "transactional" | "marketing"; paragraph: string },
    signal?: AbortSignal): Promise<DispatchResult>;
}

export interface SupportPort {
  reply(input: { channelId: string; chatId: string; text: string }, signal?: AbortSignal): Promise<DispatchResult>;
}

export type TranscriptResult = {
  noteId: string;
  revision: number;
  text: string;
  segments: ReadonlyArray<{ startMs: number; endMs: number; text: string; speaker?: string | null }>;
  mock: boolean;
};

export interface TranscriptPort {
  read(noteId: string, signal?: AbortSignal): Promise<TranscriptResult>;
}
