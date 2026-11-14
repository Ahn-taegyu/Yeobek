import "server-only";
import { createHmac } from "node:crypto";
import { isIP } from "node:net";
import { rpc } from "./db";
import { ApiError } from "./errors";
import { createWorkerSupabase } from "../supabase/worker";

/** Only the platform's overwritten header is authoritative. Unknown deployments
 * share a conservative bucket until their trusted proxy boundary is configured.
 * Raw addresses are never returned, persisted, or logged. */
export function visitorNetworkHash(headers: Headers, env: Readonly<Record<string, string | undefined>> = process.env) {
  const local = env.NODE_ENV === "development" || env.NODE_ENV === "test";
  const secret = env.VISITOR_IP_HASH_SECRET || (local ? "local-only-visitor-network-test-key" : "");
  if (secret.trim().length < 32) throw new ApiError(503, "SERVER_CONFIGURATION_ERROR", "서비스 연결 설정을 확인하고 있습니다.");
  let address = "unknown-network";
  if (env.VERCEL === "1") {
    const candidate = headers.get("x-forwarded-for")?.trim();
    if (!candidate || candidate.includes("%") || !isIP(candidate)) throw new ApiError(503, "SERVER_CONFIGURATION_ERROR", "서비스 연결 설정을 확인하고 있습니다.");
    // WHATWG URL canonicalizes IPv6 aliases; collapse mapped IPv4 to the same key.
    address = isIP(candidate) === 6 ? new URL(`http://[${candidate}]/`).hostname.slice(1, -1) : candidate;
    const mapped = address.match(/^::ffff:([0-9a-f]+):([0-9a-f]+)$/i);
    if (mapped) {
      const high = parseInt(mapped[1], 16), low = parseInt(mapped[2], 16);
      address = [high >> 8, high & 255, low >> 8, low & 255].join(".");
    }
  }
  return createHmac("sha256", secret).update("yeobek:visitor-network:v1\0" + address).digest("hex");
}

export async function consumeVisitorNetworkBudget(request: Request, sessionHash: string,
  exhibitionId: string, requestId: string, kind: "question" | "transcription" | "reply_audio") {
  const active = () => {
    if (request.signal.aborted) throw new ApiError(499, "REQUEST_CANCELLED", "요청이 취소되었습니다.");
  };
  active();
  try {
    await rpc(createWorkerSupabase({ timeoutMs: 5000 }), "consume_visitor_network_budget", {
      p_network_hash: visitorNetworkHash(request.headers), p_session_hash: sessionHash,
      p_exhibition_id: exhibitionId, p_request_id: requestId, p_kind: kind,
    }, request.signal);
  } catch (error) { active(); throw error; }
  active();
}
