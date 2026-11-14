import { z } from "zod";
import { handleApi, readJson } from "@/lib/api/http";
import { ApiError } from "@/lib/api/errors";
import { createWorkerSupabase } from "@/lib/supabase/worker";
import { channelWebhookSchema } from "@/lib/contracts/support";
import { authenticateChannelWebhook, channelInquiry } from "@/lib/automation/channel-webhook";
import { isMockMode } from "@/lib/ai/routing";
import { abortable, createDeadline } from "@/lib/ai/deadline";

export const maxDuration = 15;
export function POST(request: Request) {
  return handleApi(async () => {
    const channelId = authenticateChannelWebhook(request);
    const mock = isMockMode();
    const deadline = createDeadline(10000, request.signal);
    try {
      return await abortable(deadline.signal, async signal => {
        const init: RequestInit & { duplex: "half" } = { method: request.method, headers: request.headers, body: request.body, signal, duplex: "half" };
        const inquiry = channelInquiry(await readJson(new Request(request.url, init), channelWebhookSchema), channelId);
        if (!inquiry) return { accepted: true, ignored: true };
        signal.throwIfAborted();
        const worker = createWorkerSupabase({ timeoutMs: 5000 });
        const { data, error } = await worker.rpc("receive_support_inquiry", {
          p_channel_id: inquiry.channelId, p_user_id: inquiry.userId, p_chat_id: inquiry.chatId, p_message_id: inquiry.messageId,
          // SQL normalizes an empty question to NULL for unsupported inquiries.
          p_question: inquiry.question ?? "", p_truncated: inquiry.truncated, p_created_at: inquiry.createdAt, p_mock: mock,
        }).abortSignal(signal);
        signal.throwIfAborted();
        if (error) {
          if (error.code === "P1005") throw new ApiError(409, "REQUEST_ID_CONFLICT", "중복 메시지의 내용이 다릅니다.");
          if (error.code === "22023") throw new ApiError(400, "INVALID_INPUT", "메시지 입력을 확인해 주세요.");
          throw new ApiError(503, "TEMPORARILY_UNAVAILABLE", "잠시 후 다시 시도해 주세요.");
        }
        const receipt = z.object({ accepted: z.literal(true), duplicate: z.boolean() }).safeParse(data);
        if (!receipt.success) throw new ApiError(503, "TEMPORARILY_UNAVAILABLE", "잠시 후 다시 시도해 주세요.");
        return receipt.data; // Never expose owner, internal event IDs or the inquiry text.
      });
    } catch (error) {
      if (request.signal.aborted || deadline.timedOut()) throw new ApiError(408, "REQUEST_TIMEOUT", "잠시 후 다시 시도해 주세요.");
      throw error;
    } finally { deadline.dispose(); }
  });
}
