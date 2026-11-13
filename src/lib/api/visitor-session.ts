import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";

const cookieName = "yeobek_visitor";
/** A random bearer cookie, never a request-body session ID. Only its hash is stored.
 * Conversation rendering/contextSequence belongs to each client tab; it does not
 * reset this browser's rate budget. Clearing cookies cannot evade the exhibit cap. */
export async function visitorSessionHash() {
  const jar = await cookies();
  const previous = jar.get(cookieName)?.value;
  const secret = previous && /^[a-f0-9]{64}$/.test(previous) ? previous : randomBytes(32).toString("hex");
  if (secret !== previous) jar.set(cookieName, secret, {
    httpOnly: true, sameSite: "strict", secure: process.env.NODE_ENV === "production",
    path: "/api", maxAge: 60 * 60 * 24,
  });
  return createHash("sha256").update(secret).digest("hex");
}
