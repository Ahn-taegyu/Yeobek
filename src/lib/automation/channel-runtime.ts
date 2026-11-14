import "server-only";
import { createWorkerSupabase } from "../supabase/worker";
import { isMockMode } from "../ai/routing";
import { createChannelTokenAdapter } from "./adapters/channel-token";
import { createChannelTalkAdapter } from "./adapters/channeltalk";
import { createMockAutomationAdapters } from "./adapters/mock";
import { createChannelTokenCache } from "./channel-token-cache";
import { AutomationError } from "./errors";
import type { SupportPort } from "./ports";

/** Server configuration owns the channel. A verified inquiry binding must still
 * authorize the chat before dispatch; this factory does not establish identity. */
export function createConfiguredSupportPort(channelId: string): SupportPort {
  const mock = isMockMode();
  if (!channelId || channelId !== process.env.CHANNEL_TALK_CHANNEL_ID) throw new AutomationError("not_configured");
  if (mock) return createMockAutomationAdapters().support;
  // Validate all secrets before constructing the DB client or reserving quota.
  let worker: ReturnType<typeof createWorkerSupabase> | undefined;
  const db = () => worker ??= createWorkerSupabase({ timeoutMs: 5000 });
  const getChannelToken = createChannelTokenCache({
    appId: process.env.CHANNEL_TALK_APP_ID ?? "", channelId,
    appSecret: process.env.CHANNEL_TALK_APP_SECRET ?? "",
    encryptionKey: process.env.CHANNEL_TALK_TOKEN_KEY ?? "",
  }, {
    provider: createChannelTokenAdapter({ timeoutMs: 10000 }),
    store: {
      async claim(appId, channel, claimId, signal) {
        const { data, error } = await db().rpc("claim_channel_token", {
          p_app_id: appId, p_channel_id: channel, p_claim: claimId,
        }).abortSignal(signal);
        if (error) throw new AutomationError("unavailable");
        return data;
      },
      async complete(appId, channel, claimId, sealed, expiresIn, signal) {
        const { data, error } = await db().rpc("complete_channel_token", {
          p_app_id: appId, p_channel_id: channel, p_claim: claimId, p_sealed: sealed, p_expires_in: expiresIn,
        }).abortSignal(signal);
        if (error || typeof data !== "boolean") throw new AutomationError("unavailable");
        return data;
      },
    },
  });
  return createChannelTalkAdapter({ channelId, getChannelToken });
}
