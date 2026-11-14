import "server-only";
import { createCipheriv, createDecipheriv, randomBytes, randomUUID } from "node:crypto";
import { z } from "zod";
import { abortable, createDeadline } from "../ai/deadline";
import { AutomationError } from "./errors";
import { channelTokenPairSchema, type ChannelTokenPort, type ChannelTokenPair } from "./adapters/channel-token";

const identifier = z.string().min(1).max(200).refine(value => !/[^A-Za-z0-9_-]/.test(value));
const token = z.string().min(1).max(8192).regex(/^[\x21-\x7e]+$/);
const pairSchema = channelTokenPairSchema.strict();
const claimSchema = z.discriminatedUnion("state", [
  z.object({ state: z.literal("cached"), sealed: z.string().min(1).max(32768) }).strict(),
  z.object({ state: z.literal("refresh"), sealed: z.string().min(1).max(32768).nullable() }).strict(),
  z.object({ state: z.literal("busy") }).strict(),
  z.object({ state: z.literal("limited") }).strict(),
]);

/** Implementations must bound their own I/O and honor the signal. The database
 * reserves issuance quota and a lease before an external request is possible. */
export interface ChannelTokenStore {
  claim(appId: string, channelId: string, claimId: string, signal: AbortSignal): Promise<unknown>;
  complete(appId: string, channelId: string, claimId: string, sealed: string, expiresIn: number, signal: AbortSignal): Promise<boolean>;
}

/** No in-process token cache: independent workers share the DB lease and quota.
 * Database payloads contain only authenticated ciphertext bound to app+channel.
 * A lost refresh response is not retried automatically or replaced by issuance. */
export function createChannelTokenCache(config: {
  appId: string; channelId: string; appSecret: string; encryptionKey: string;
}, dependencies: { store: ChannelTokenStore; provider: ChannelTokenPort; timeoutMs?: number }) {
  if (!identifier.safeParse(config.appId).success || !identifier.safeParse(config.channelId).success ||
      !token.safeParse(config.appSecret).success || !/^[a-fA-F0-9]{64}$/.test(config.encryptionKey)) {
    throw new AutomationError("not_configured");
  }
  const timeoutMs = dependencies.timeoutMs ?? 15000;
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 15000) throw new AutomationError("invalid_input");
  const key = Buffer.from(config.encryptionKey, "hex");
  const aad = Buffer.from(JSON.stringify(["yeobek-channel-token-v1", config.appId, config.channelId]));
  function seal(pair: ChannelTokenPair) {
    const parsed = pairSchema.safeParse(pair);
    if (!parsed.success) throw new AutomationError("invalid_response");
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", key, iv);
    cipher.setAAD(aad);
    const ciphertext = Buffer.concat([cipher.update(JSON.stringify(parsed.data), "utf8"), cipher.final()]);
    return ["v1", iv.toString("base64url"), ciphertext.toString("base64url"), cipher.getAuthTag().toString("base64url")].join(".");
  }
  function open(sealed: string) {
    try {
      const parts = sealed.split(".");
      if (parts.length !== 4 || parts[0] !== "v1" || !/^[A-Za-z0-9_-]{16}$/.test(parts[1]) ||
          !/^[A-Za-z0-9_-]+$/.test(parts[2]) || !/^[A-Za-z0-9_-]{22}$/.test(parts[3])) throw new Error();
      const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(parts[1], "base64url"));
      decipher.setAAD(aad);
      decipher.setAuthTag(Buffer.from(parts[3], "base64url"));
      const plaintext = Buffer.concat([decipher.update(Buffer.from(parts[2], "base64url")), decipher.final()]);
      return pairSchema.parse(JSON.parse(plaintext.toString("utf8")));
    } catch { throw new AutomationError("not_configured"); }
  }
  return async function getChannelToken(signal?: AbortSignal): Promise<string> {
    if (signal?.aborted) throw new AutomationError("cancelled");
    const deadline = createDeadline(timeoutMs, signal);
    try {
      return await abortable(deadline.signal, async active => {
        const startedAt = performance.now();
        const claimId = randomUUID();
        const parsed = claimSchema.safeParse(await dependencies.store.claim(config.appId, config.channelId, claimId, active));
        active.throwIfAborted();
        if (!parsed.success) throw new AutomationError("invalid_response");
        const claimed = parsed.data;
        if (claimed.state === "busy") throw new AutomationError("not_ready");
        if (claimed.state === "limited") throw new AutomationError("rate_limited");
        if (claimed.state === "cached") return open(claimed.sealed).accessToken;
        const pair = claimed.sealed === null
          ? await dependencies.provider.issueToken(config.appSecret, config.channelId, active)
          : await dependencies.provider.refreshToken(open(claimed.sealed).refreshToken, active);
        active.throwIfAborted();
        const sealed = seal(pair);
        const saved = await dependencies.store.complete(config.appId, config.channelId, claimId, sealed, pair.expiresIn, active);
        active.throwIfAborted();
        if (!saved) throw new AutomationError("stale_source");
        // The DB starts expiry at claim time, before the provider request. Never
        // return a token that elapsed while its durable write was in progress.
        if (pair.expiresIn * 1000 <= performance.now() - startedAt + 1000) throw new AutomationError("stale_source");
        return pair.accessToken;
      });
    } catch (error) {
      if (signal?.aborted) throw new AutomationError("cancelled");
      if (deadline.timedOut()) throw new AutomationError("timeout");
      if (error instanceof AutomationError) throw new AutomationError(error.code);
      throw new AutomationError("unavailable");
    } finally { deadline.dispose(); }
  };
}
