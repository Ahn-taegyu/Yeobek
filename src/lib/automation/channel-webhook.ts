import "server-only";
import { createHash, timingSafeEqual } from "node:crypto";
import { channelIdentifier, channelMessageSchema, type channelWebhookSchema } from "../contracts/support";
import { z } from "zod";
import { ApiError } from "../api/errors";

/** Legacy Open API webhook authentication. This token is NOT an AppStore
 * x-signature. The configured URL/token must be kept out of access logs. */
export function authenticateChannelWebhook(request: Request): string {
  const token = process.env.CHANNEL_TALK_WEBHOOK_TOKEN;
  const channelId = process.env.CHANNEL_TALK_CHANNEL_ID;
  if (!token || token.length < 32 || token.length > 256 || /\s/.test(token) || !channelIdentifier.safeParse(channelId).success) {
    throw new ApiError(503, "SERVER_CONFIGURATION_ERROR", "연결 설정을 확인하고 있습니다.");
  }
  const tokens = new URL(request.url).searchParams.getAll("token");
  const candidate = tokens[0];
  if (tokens.length !== 1 || !candidate || candidate.length > 256 ||
      !timingSafeEqual(createHash("sha256").update(candidate).digest(), createHash("sha256").update(token).digest())) {
    throw new ApiError(404, "NOT_FOUND", "요청을 찾을 수 없습니다.");
  }
  return channelId!;
}

export function channelInquiry(envelope: z.infer<typeof channelWebhookSchema>, channelId: string, now = Date.now()) {
  // Ignore bots/managers, group messages, updates and contacts to avoid reply loops.
  if (envelope.event !== "push" || envelope.type !== "message") return null;
  const kind = z.object({ chatType: z.enum(["userChat", "group"]), personType: z.enum(["user", "manager", "bot"]) }).parse(envelope.entity);
  if (kind.chatType !== "userChat" || kind.personType !== "user") return null;
  const message = channelMessageSchema.parse(envelope.entity);
  if (message.channelId !== channelId) throw new ApiError(404, "NOT_FOUND", "요청을 찾을 수 없습니다.");
  if (message.createdAt < now - 30 * 86400000 || message.createdAt > now + 300000) {
    throw new ApiError(400, "INVALID_INPUT", "메시지 시각을 확인해 주세요.");
  }
  const text = message.plainText?.trim() ?? "";
  const chars = Array.from(text);
  // Unsupported or oversized inquiries are retained for escalation, never sent
  // as a silently shortened question to the language model.
  const unsupported = /\0/.test(text);
  return { channelId, userId: message.personId, chatId: message.chatId, messageId: message.id,
    question: unsupported || !text ? null : chars.slice(0, 2000).join(""),
    truncated: unsupported || chars.length > 2000, createdAt: new Date(message.createdAt).toISOString() };
}
