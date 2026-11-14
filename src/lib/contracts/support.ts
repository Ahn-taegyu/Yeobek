import { z } from "zod";
import { uuid } from "./requests";

export const channelIdentifier = z.string().min(1).max(200).refine(value => !/[^A-Za-z0-9_-]/.test(value));
export const channelWebhookSchema = z.object({ event: z.string().max(40), type: z.string().max(40), entity: z.record(z.string(), z.unknown()) });
export const channelMessageSchema = z.object({
  id: channelIdentifier, channelId: channelIdentifier, chatId: channelIdentifier, personId: channelIdentifier,
  chatType: z.literal("userChat"), personType: z.literal("user"),
  createdAt: z.number().int().nonnegative().max(8640000000000000),
  plainText: z.string().optional(),
});
export const channelWebhookResponse = z.object({ accepted: z.literal(true), duplicate: z.boolean().optional(), ignored: z.boolean().optional() });
export const supportBindingSchema = z.strictObject({
  userId: channelIdentifier, ownerId: uuid, enabled: z.boolean(), expectedRevision: z.number().int().min(0).max(2147483647),
});
export const supportBindingResponse = z.object({ revision: z.number().int().positive() });
const count = z.number().int().nonnegative();
export const supportRunResponse = z.object({
  mock: z.boolean(), dispatchReady: z.boolean(), processed: count, suppressed: count, escalated: count, failed: count, persistenceFailures: count,
  dispatch: z.object({ claimed: count, accepted: count, rejected: count, unknown: count, failed: count, skipped: count, persistenceFailures: count }),
});
