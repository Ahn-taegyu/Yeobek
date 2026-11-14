const maxBodyBytes = 20 * 1024;
const headers = { "Cache-Control": "no-store" };

function failure(status: number, message: string) {
  return Response.json({ error: { http_code: status, message } }, { status, headers });
}

async function readPayload(request: Request): Promise<Uint8Array<ArrayBuffer> | null> {
  const reader = request.body?.getReader();
  if (!reader) return null;
  const bytes = new Uint8Array(maxBodyBytes);
  let size = 0;
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) return bytes.subarray(0, size);
      if (size + next.value.length > maxBodyBytes) {
        void reader.cancel().catch(() => {});
        return null;
      }
      bytes.set(next.value, size);
      size += next.value.length;
    }
  } finally {
    reader.releaseLock();
  }
}

function base64(value: string) {
  return Uint8Array.from(atob(value), char => char.charCodeAt(0));
}

async function signed(request: Request, raw: Uint8Array<ArrayBuffer>, secret: string) {
  const id = request.headers.get("webhook-id") ?? "";
  const timestamp = request.headers.get("webhook-timestamp") ?? "";
  const signatures = request.headers.get("webhook-signature") ?? "";
  if (!/^[A-Za-z0-9_-]{1,200}$/.test(id) || !/^\d{1,12}$/.test(timestamp) ||
      Math.abs(Date.now() / 1000 - Number(timestamp)) > 300 || signatures.length > 2048) return false;

  const key = await crypto.subtle.importKey("raw", base64(secret), { name: "HMAC", hash: "SHA-256" }, false, ["verify"]);
  const prefix = new TextEncoder().encode(`${id}.${timestamp}.`);
  const input = new Uint8Array(prefix.length + raw.length);
  input.set(prefix);
  input.set(raw, prefix.length);
  for (const signature of signatures.split(/\s+/)) {
    if (/^v1,[A-Za-z0-9+/]{43}=$/.test(signature) &&
        await crypto.subtle.verify("HMAC", key, base64(signature.slice(3)), input)) return true;
  }
  return false;
}

export async function sendSignupEmail(
  request: Request, env: (key: string) => string | undefined, send: typeof fetch = fetch,
) {
  if (request.method !== "POST") return failure(405, "Method not allowed");
  const secret = env("SEND_EMAIL_HOOK_SECRET")?.match(/^v1,whsec_([A-Za-z0-9+/]{43}=)$/)?.[1];
  if (!secret) return failure(503, "Email delivery is not configured");

  const raw = await readPayload(request).catch(() => null);
  if (!raw || !await signed(request, raw, secret).catch(() => false)) {
    return failure(401, "Invalid hook signature");
  }

  let payload;
  try { payload = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(raw)); }
  catch { return failure(400, "Invalid hook payload"); }

  const email = payload?.user?.email;
  const signupRequestId = payload?.user?.app_metadata?.yeobek_signup_request_id;
  const code = payload?.email_data?.token;
  if (payload?.email_data?.email_action_type !== "signup" ||
      typeof signupRequestId !== "string" || !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(signupRequestId) ||
      typeof email !== "string" || email.length > 64 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
      typeof code !== "string" || !/^\d{6}$/.test(code)) {
    return failure(400, "Unsupported email event");
  }

  const apiKey = env("STIBEE_API_KEY")?.trim();
  const list = env("STIBEE_SIGNUP_LIST_ID") ?? "";
  const trigger = env("STIBEE_SIGNUP_URL") ?? "";
  if (!apiKey || /[\r\n]/.test(apiKey) || !/^[1-9]\d{0,15}$/.test(list) ||
      !/^https:\/\/stibee\.com\/api\/v1\.0\/auto\/[A-Za-z0-9_-]+$/.test(trigger)) {
    return failure(503, "Email delivery is not configured");
  }

  const options = {
    method: "POST", headers: { AccessToken: apiKey, "Content-Type": "application/json" },
    redirect: "error", signal: AbortSignal.timeout(4000),
  } satisfies RequestInit;
  try {
    const registration = await send(`https://api.stibee.com/v2/lists/${list}/subscribers`, {
      ...options, body: JSON.stringify({
        subscriber: { email, status: "subscribed", marketingAllowed: false }, updateEnabled: false,
      }),
    });
    const alreadyRegistered = registration.status === 400 &&
      (await registration.json().catch(() => null))?.code === "Errors.List.AlreadyExistEmail";
    if (registration.status !== 400) void registration.body?.cancel().catch(() => {});
    if (registration.status !== 200 && !alreadyRegistered) return failure(502, "Email delivery unavailable");

    // The code is a per-send field. It must never enter the address book or logs.
    const delivery = await send(trigger, {
      ...options, body: JSON.stringify({ subscriber: email, yeobek_code: code }),
    });
    void delivery.body?.cancel().catch(() => {});
    return delivery.status === 200 ? Response.json({}, { headers }) : failure(502, "Email delivery unavailable");
  } catch {
    return failure(502, "Email delivery unavailable");
  }
}
