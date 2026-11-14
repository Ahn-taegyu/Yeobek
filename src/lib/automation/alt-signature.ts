import { createHmac, timingSafeEqual } from "node:crypto";
import { AutomationError } from "./errors";

/** Only authenticates the raw bytes. The caller must still validate the envelope,
 * match event_id to this returned ID, deduplicate and authorize its note binding. */
export function verifyAltSignature(raw: Uint8Array, headers: Headers, secret: string, nowMs = Date.now()): string {
  if (!/^whsec_[A-Za-z0-9_-]+={0,2}$/.test(secret)) throw new AutomationError("not_configured");
  const key = Buffer.from(secret.slice(6), "base64url");
  if (key.length < 16 || key.length > 128) throw new AutomationError("not_configured");
  const id = headers.get("webhook-id");
  const timestamp = headers.get("webhook-timestamp");
  const signatures = headers.get("webhook-signature");
  if (raw.length > 65536 || !id || !/^[A-Za-z0-9_-]{1,200}$/.test(id) ||
      !timestamp || !/^\d{1,12}$/.test(timestamp) || !Number.isFinite(nowMs) ||
      Math.abs(nowMs / 1000 - Number(timestamp)) > 300 || !signatures || signatures.length > 2048) {
    throw new AutomationError("rejected");
  }
  const expected = createHmac("sha256", key).update(`${id}.${timestamp}.`).update(raw).digest();
  const valid = signatures.split(/\s+/).some(signature => {
    if (!/^v1,[A-Za-z0-9+/]{43}=$/.test(signature)) return false;
    const supplied = Buffer.from(signature.slice(3), "base64");
    return supplied.length === expected.length && timingSafeEqual(supplied, expected);
  });
  if (!valid) throw new AutomationError("rejected");
  return id;
}
