import { createHmac, timingSafeEqual } from "node:crypto";
import { AutomationError } from "./errors";

/** AppStore Function signing, not the legacy Open API URL-token webhook.
 * The signed envelope has no timestamp guarantee; durable event dedupe is still required. */
export function verifyChannelSignature(raw: Uint8Array, signature: string | null, signingKey: string): void {
  if (!/^(?:[A-Fa-f0-9]{2}){16,128}$/.test(signingKey)) throw new AutomationError("not_configured");
  if (raw.length > 65536 || !signature || !/^[A-Za-z0-9+/]{43}=$/.test(signature)) throw new AutomationError("rejected");
  const expected = createHmac("sha256", Buffer.from(signingKey, "hex")).update(raw).digest("base64");
  if (!timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) throw new AutomationError("rejected");
}
