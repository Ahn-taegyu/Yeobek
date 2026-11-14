import "server-only";
import { z } from "zod";
import { abortable, createDeadline } from "../../ai/deadline";
import { AutomationError } from "../errors";
import type { SupportPort, DispatchResult } from "../ports";
import { outboundBodySchema } from "../../contracts/automation";

const id = z.string().regex(/^[A-Za-z0-9_-]{1,200}$/);
const inputSchema = z.object({ channelId: id, chatId: id, text: outboundBodySchema }).strict();
const receipt = z.object({ result: z.object({ message: z.object({ id: id.optional() }) }) });

async function readReceipt(response: Response, signal: AbortSignal): Promise<unknown> {
  if (response.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json" ||
      Number(response.headers.get("content-length") ?? 0) > 65536 || !response.body) throw new AutomationError("invalid_response");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  const cancel = () => { void reader.cancel().catch(() => {}); };
  signal.addEventListener("abort", cancel, { once: true });
  try {
    while (true) {
      signal.throwIfAborted();
      const part = await reader.read();
      signal.throwIfAborted();
      if (part.done) break;
      size += part.value.length;
      if (size > 65536) throw new AutomationError("invalid_response");
      chunks.push(part.value);
    }
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks)));
  } finally {
    signal.removeEventListener("abort", cancel);
    cancel();
    reader.releaseLock();
  }
}

/** Reviewed public SDK contract: PUT native/functions → writeUserChatMessage.
 * Token lifecycle lives in the channel-scoped credential store, never in model output.
 * No internal retry: a lost response may already have created a message. */
export function createChannelTalkAdapter(config: {
  channelId: string;
  getChannelToken: (signal: AbortSignal) => Promise<string>;
}, options: { fetch?: typeof fetch; timeoutMs?: number } = {}): SupportPort {
  if (!id.safeParse(config.channelId).success) throw new AutomationError("not_configured");
  const timeoutMs = options.timeoutMs ?? 15000;
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 15000) throw new AutomationError("invalid_input");
  return {
    async reply(input, signal) {
      const parsed = inputSchema.safeParse(input);
      if (!parsed.success || parsed.data.channelId !== config.channelId || parsed.data.text.includes("\0")) throw new AutomationError("invalid_input");
      if (signal?.aborted) throw new AutomationError("cancelled");
      const deadline = createDeadline(timeoutMs, signal);
      let dispatched = false;
      try {
        return await abortable(deadline.signal, async active => {
          const token = await config.getChannelToken(active);
          active.throwIfAborted();
          if (!token || token.length > 8192 || /[\r\n]/.test(token)) throw new AutomationError("not_configured");
          dispatched = true;
          const response = await (options.fetch ?? fetch)("https://app-store-api.channel.io/general/v1/native/functions", {
            method: "PUT", headers: { "Content-Type": "application/json", "x-access-token": token },
            body: JSON.stringify({ method: "writeUserChatMessage", params: {
              channelId: parsed.data.channelId, userChatId: parsed.data.chatId, dto: { plainText: parsed.data.text },
            } }), signal: active, cache: "no-store", redirect: "error",
          });
          try {
            if (response.status === 429) return { status: "rejected", code: "rate_limited", mock: false } satisfies DispatchResult;
            if ([400, 401, 403, 404, 405, 413, 415, 422].includes(response.status)) return { status: "rejected", code: "provider_rejected", mock: false } satisfies DispatchResult;
            if (response.status !== 200) return { status: "unknown", code: "ambiguous_transport", mock: false } satisfies DispatchResult;
            const body = await readReceipt(response, active);
            // A malformed/conflicting envelope is ambiguous, not a safe resend signal.
            if (typeof body === "object" && body !== null && "error" in body) return { status: "unknown", code: "ambiguous_transport", mock: false } satisfies DispatchResult;
            const result = receipt.safeParse(body);
            if (!result.success) throw new AutomationError("invalid_response");
            return { status: "accepted", code: "accepted", mock: false,
              ...(result.data.result.message.id ? { providerMessageId: result.data.result.message.id } : {}) } satisfies DispatchResult;
          } finally {
            if (!response.bodyUsed) void response.body?.cancel().catch(() => {});
          }
        });
      } catch (error) {
        if (dispatched) return { status: "unknown", code: "ambiguous_transport", mock: false };
        if (signal?.aborted) throw new AutomationError("cancelled");
        if (deadline.timedOut()) throw new AutomationError("timeout");
        if (error instanceof AutomationError) throw error;
        throw new AutomationError("unavailable");
      } finally {
        deadline.dispose();
      }
    },
  };
}
