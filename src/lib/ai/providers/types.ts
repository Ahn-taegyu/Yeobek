export interface AiUsage {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
}

export interface AiProviderTrace {
  provider: "openai" | "liner" | "typecast" | "exaone" | "mock";
  mock?: true;
  model: string;
  usage?: AiUsage;
}

export interface AiTextRequest {
  system: string;
  input: string;
  schema: { name: string; definition: Record<string, unknown> };
  signal?: AbortSignal;
  maxOutputTokens?: number;
  /** Server-owned bytes only. Never accept a model-selected URL or file ID. */
  media?: { contentType: "application/pdf" | "image/jpeg" | "image/png" | "image/webp"; data: Uint8Array };
}

export interface AiTextResponse {
  output: unknown;
  trace: AiProviderTrace;
}

export interface AiTextProvider {
  generate(request: AiTextRequest): Promise<AiTextResponse>;
}

export interface AiTranscriptionRequest {
  audio: Blob;
  filename: string;
  language?: string;
  signal?: AbortSignal;
}

export interface AiTranscriptionResponse {
  text: string;
  trace: AiProviderTrace;
}

export interface AiTranscriptionProvider {
  transcribe(request: AiTranscriptionRequest): Promise<AiTranscriptionResponse>;
}

export interface AiSpeechRequest {
  text: string;
  signal?: AbortSignal;
}

export interface AiSpeechResponse {
  audio: Uint8Array;
  contentType: string;
  trace: AiProviderTrace;
}

export interface AiSpeechProvider {
  synthesize(request: AiSpeechRequest): Promise<AiSpeechResponse>;
}

export interface AiProviderOptions {
  fetch?: typeof fetch;
  timeoutMs?: number;
}
