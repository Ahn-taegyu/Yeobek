import "server-only";
import { z } from "zod";
import { abortable, createDeadline } from "../../ai/deadline";
import { AutomationError } from "../errors";

const endpoint = "https://app-store-api.channel.io/general/v1/native/functions";
const maxBodyBytes = 64 * 1024;

export function isChannelToken(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 8192 &&
    !/[^A-Za-z0-9._~+/=-]/.test(value);
}

const token = z.custom<string>(isChannelToken);
export const channelTokenPairSchema = z.object({
  accessToken: token,
  refreshToken: token,
  expiresIn: z.number().int().positive().max(31536000),
});
const envelopeSchema = z.object({
  result: channelTokenPairSchema.optional(),
  error: z.object({ code: z.number().int() }).optional(),
});

/** expiresIn is the access token lifetime in seconds. */
export type ChannelTokenPair = z.infer<typeof channelTokenPairSchema>;

export interface ChannelTokenPort {
  issueToken(secret: string, channelId: string, signal?: AbortSignal): Promise<ChannelTokenPair>;
  refreshToken(refreshToken: string, signal?: AbortSignal): Promise<ChannelTokenPair>;
}

type TokenRequest =
  | { method: "issueToken"; params: { secret: string; channelId: string } }
  | { method: "refreshToken"; params: { refreshToken: string } };

async function readEnvelope(response: Response, signal: AbortSignal): Promise<unknown> {
  if (!response.body || Number(response.headers.get("content-length")) > maxBodyBytes ||
      response.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json") {
    throw new AutomationError("invalid_response");
  }
  const reader = response.body.getReader();
  const cancel = () => { void reader.cancel().catch(() => {}); };
  signal.addEventListener("abort", cancel, { once: true });
  try {
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      signal.throwIfAborted();
      const part = await reader.read();
      signal.throwIfAborted();
      if (part.done) break;
      size += part.value.byteLength;
      if (size > maxBodyBytes) throw new AutomationError("invalid_response");
      chunks.push(part.value);
    }
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks, size)));
  } finally {
    signal.removeEventListener("abort", cancel);
    cancel();
    reader.releaseLock();
  }
}

export function createChannelTokenAdapter(options: { fetch?: typeof fetch; timeoutMs?: number } = {}): ChannelTokenPort {
  const timeoutMs = options.timeoutMs ?? 15000;
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 15000) {
    throw new AutomationError("invalid_input");
  }

  async function request(payload: TokenRequest, signal?: AbortSignal): Promise<ChannelTokenPair> {
    const deadline = createDeadline(timeoutMs, signal);
    try {
      return await abortable(deadline.signal, async active => {
        const response = await (options.fetch ?? fetch)(endpoint, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
          signal: active,
          cache: "no-store",
          redirect: "error",
        }).catch(() => { throw new AutomationError("unavailable"); });

        try {
          active.throwIfAborted();
          if (response.status === 429) throw new AutomationError("rate_limited");
          if ([400, 401, 403, 404, 422].includes(response.status)) throw new AutomationError("rejected");
          if (!response.ok) throw new AutomationError("unavailable");

          const body = await readEnvelope(response, active).catch(() => { throw new AutomationError("invalid_response"); });
          const envelope = envelopeSchema.safeParse(body);
          if (!envelope.success || (envelope.data.result && envelope.data.error)) {
            throw new AutomationError("invalid_response");
          }
          if (envelope.data.error) {
            throw new AutomationError(envelope.data.error.code === 429 ? "rate_limited" : "rejected");
          }
          const result = envelope.data.result;
          if (!result) {
            throw new AutomationError("invalid_response");
          }
          return result;
        } finally {
          if (!response.bodyUsed) void response.body?.cancel().catch(() => {});
        }
      });
    } catch (error) {
      if (deadline.timedOut()) throw new AutomationError("timeout");
      if (signal?.aborted) throw new AutomationError("cancelled");
      if (error instanceof AutomationError) throw new AutomationError(error.code);
      throw new AutomationError("unavailable");
    } finally {
      deadline.dispose();
    }
  }

  return {
    async issueToken(secret, channelId, signal) {
      if (typeof secret !== "string" || !secret.trim() || secret.length > 8192 ||
          typeof channelId !== "string" || channelId.length < 1 || channelId.length > 200 || /[^A-Za-z0-9_-]/.test(channelId)) {
        throw new AutomationError("invalid_input");
      }
      return request({ method: "issueToken", params: { secret, channelId } }, signal);
    },
    async refreshToken(refreshToken, signal) {
      if (!isChannelToken(refreshToken)) throw new AutomationError("invalid_input");
      return request({ method: "refreshToken", params: { refreshToken } }, signal);
    },
  };
}
