import "server-only";

import { AI_REQUEST_TIMEOUT_MS } from "../config";
import { AiError } from "../errors";
import type { AiProviderOptions, AiProviderTrace, AiUsage } from "./types";

const MAX_JSON_REQUEST_BYTES = 128 * 1024;
const MAX_JSON_RESPONSE_BYTES = 256 * 1024;
const MAX_SPEECH_RESPONSE_BYTES = 8 * 1024 * 1024;

interface ProviderRequest {
  url: string;
  body: BodyInit;
  headers: Record<string, string>;
  signal?: AbortSignal;
}

export function objectValue(value: unknown): Record<string, unknown> | undefined {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
}

export function parseJson(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new AiError("invalid_response");
  }
}

export function jsonBody(data: Record<string, unknown>): string {
  try {
    const body = JSON.stringify(data);
    if (Buffer.byteLength(body, "utf8") <= MAX_JSON_REQUEST_BYTES) return body;
  } catch {
    // Serialization errors can include application input.
  }
  throw new AiError("invalid_input");
}

function tokenCount(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isSafeInteger(value) && value >= 0) return value;
}

export function providerTrace(
  provider: AiProviderTrace["provider"],
  config: { model: string; apiKey: string },
  response?: Record<string, unknown>,
): AiProviderTrace {
  const reportedModel = response?.model;
  const model = typeof reportedModel === "string" &&
    /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/.test(reportedModel) &&
    !reportedModel.includes(config.apiKey)
    ? reportedModel
    : config.model;
  const trace: AiProviderTrace = { provider, model };
  const tokens = objectValue(response?.usage);
  const usage: AiUsage = {};
  const input = tokenCount(provider === "liner" ? tokens?.prompt_tokens : tokens?.input_tokens);
  const output = tokenCount(provider === "liner" ? tokens?.completion_tokens : tokens?.output_tokens);
  const total = tokenCount(tokens?.total_tokens);
  if (input !== undefined) usage.inputTokens = input;
  if (output !== undefined) usage.outputTokens = output;
  if (total !== undefined) usage.totalTokens = total;
  if (Object.keys(usage).length) trace.usage = usage;
  return trace;
}

async function readBoundedBody(response: Response, limit: number, signal: AbortSignal): Promise<Uint8Array> {
  if (!response.body) throw new AiError("invalid_response");

  const contentLength = response.headers.get("content-length");
  if (contentLength !== null && Number(contentLength) > limit) {
    throw new AiError("response_too_large");
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  let complete = false;
  const cancel = () => { void reader.cancel().catch(() => {}); };
  signal.addEventListener("abort", cancel, { once: true });
  try {
    while (!complete) {
      signal.throwIfAborted();
      const result = await reader.read();
      signal.throwIfAborted();
      if (result.done) {
        complete = true;
        break;
      }
      size += result.value.byteLength;
      if (size > limit) throw new AiError("response_too_large");
      chunks.push(result.value);
    }
  } finally {
    signal.removeEventListener("abort", cancel);
    if (!complete && !signal.aborted) cancel();
    reader.releaseLock();
  }

  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

async function request(
  input: ProviderRequest,
  options: AiProviderOptions,
  expectedTypes: readonly string[],
  maxBytes: number,
): Promise<Uint8Array> {
  if (input.signal?.aborted) throw new AiError("cancelled");
  const timeout = new AbortController();
  const timeoutMs = options.timeoutMs ?? AI_REQUEST_TIMEOUT_MS;
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > AI_REQUEST_TIMEOUT_MS) {
    throw new AiError("invalid_input");
  }
  const signal = input.signal ? AbortSignal.any([input.signal, timeout.signal]) : timeout.signal;
  const abortError = () => new AiError(input.signal?.aborted ? "cancelled" : "timeout");

  let onAbort: () => void = () => {};
  const aborted = new Promise<never>((_, reject) => {
    onAbort = () => reject(abortError());
    signal.addEventListener("abort", onAbort, { once: true });
  });

  const timer = setTimeout(() => timeout.abort(), timeoutMs);
  async function run() {
    const response = await (options.fetch ?? fetch)(input.url, {
      method: "POST",
      headers: input.headers,
      body: input.body,
      signal,
      cache: "no-store",
      redirect: "error",
    });
    try {
      signal.throwIfAborted();
      if (response.status === 429) throw new AiError("rate_limited");
      if (response.status === 503) throw new AiError("provider_unavailable");
      if (!response.ok) throw new AiError("provider_rejected");
      const contentType = response.headers.get("content-type")?.split(";")[0].trim().toLowerCase();
      if (!contentType || !expectedTypes.includes(contentType)) throw new AiError("invalid_response");
      return await readBoundedBody(response, maxBytes, signal);
    } finally {
      if (response.body && !response.bodyUsed) {
        void response.body.cancel().catch(() => {});
      }
    }
  }

  try {
    return await Promise.race([run(), aborted]);
  } catch (error) {
    if (signal.aborted) throw abortError();
    if (error instanceof AiError) throw error;
    // Transport exceptions can include request details or the caller's abort reason.
    throw new AiError("network_error");
  } finally {
    clearTimeout(timer);
    signal.removeEventListener("abort", onAbort);
  }
}

export async function requestJson(
  input: ProviderRequest,
  options: AiProviderOptions,
): Promise<Record<string, unknown>> {
  const bytes = await request(input, options, ["application/json"], MAX_JSON_RESPONSE_BYTES);
  let json: string;
  try {
    json = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new AiError("invalid_response");
  }
  const parsed = objectValue(parseJson(json));
  if (!parsed) throw new AiError("invalid_response");
  return parsed;
}

export const SPEECH_CONTENT_TYPE = "audio/mpeg";

export async function requestSpeech(
  input: ProviderRequest,
  options: AiProviderOptions,
  expectedTypes: readonly string[] = [SPEECH_CONTENT_TYPE],
): Promise<Uint8Array> {
  const audio = await request(input, options, expectedTypes, MAX_SPEECH_RESPONSE_BYTES);
  const hasId3 = audio.length >= 10 && audio[0] === 0x49 && audio[1] === 0x44 && audio[2] === 0x33;
  const hasFrameSync = audio.length >= 4 && audio[0] === 0xff && (audio[1] & 0xe0) === 0xe0;
  if (!hasId3 && !hasFrameSync) throw new AiError("invalid_response");
  return audio;
}

export function validateSpeechText(text: string): void {
  if (typeof text !== "string" || !text.trim() || text.length > 2000) {
    throw new AiError("invalid_input");
  }
}
