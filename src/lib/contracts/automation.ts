import { z } from "zod";
import { revision, uuid } from "./requests";
import { supportRunResponse } from "./support";

export const consentCategory = z.enum(["transactional", "marketing"]);
export const updateConsentSchema = z.strictObject({
  category: consentCategory, granted: z.boolean(), expectedRevision: z.number().int().min(0).max(2147483647),
});
export const consentResponse = z.object({
  category: consentCategory, granted: z.boolean(), revision: z.number().int().nonnegative(),
  updatedAt: z.iso.datetime({ offset: true }).nullable(),
});
export const consentListResponse = z.array(consentResponse).length(2);
export const decideOutboxSchema = z.strictObject({ expectedRevision: revision });
/** Preserve the exact reviewed text; validation must not trim or rewrite it. */
export const outboundBodySchema = z.string().refine(value =>
  value.trim().length > 0 && Array.from(value).length <= 2000 && !value.includes("\0"));
export const outboxResponse = z.object({
  id: uuid, eventId: uuid, channel: z.enum(["mail", "support"]),
  category: z.enum(["transactional", "marketing", "usage", "status"]),
  body: outboundBodySchema,
  state: z.enum(["draft", "approved", "sending", "accepted", "unknown", "rejected", "suppressed", "failed"]),
  revision, mock: z.boolean(), resultCode: z.string().nullable(), createdAt: z.iso.datetime({ offset: true }),
});
export const outboxListResponse = z.array(outboxResponse).max(100);
export const outboxQuery = z.strictObject({ cursor: uuid.optional(), state: z.enum([
  "all", "draft", "approved", "sending", "accepted", "unknown", "rejected", "suppressed", "failed",
]).default("draft") });
export const outboxPageResponse = z.object({ items: outboxListResponse, nextCursor: uuid.nullable() });
const count = z.number().int().nonnegative();
export const notificationRunResponse = z.strictObject({
  support: supportRunResponse.optional(),
  mock: z.boolean(), busy: z.boolean(), dispatchReady: z.boolean(), scheduled: count, discarded: count,
  processed: count, suppressed: count, escalated: count, failed: count, persistenceFailures: count,
  dispatch: z.strictObject({ claimed: count, accepted: count, rejected: count, unknown: count,
    failed: count, skipped: count, persistenceFailures: count }),
});
