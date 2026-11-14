import { createHmac } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { sendSignupEmail } from "../../supabase/functions/stibee-signup-email/handler";

const secret = Buffer.alloc(60, 42);
const email = "artist@example.test";
const signup = {
  user: { email, app_metadata: { yeobek_signup_request_id: "8484b834-f29e-4af2-bf42-80644d154f76" } },
  email_data: { email_action_type: "signup", token: "004012", token_hash: "not-for-stibee" },
};
const settings: Record<string, string> = {
  SEND_EMAIL_HOOK_SECRET: `v1,whsec_${secret.toString("base64")}`,
  STIBEE_API_KEY: "test-key",
  STIBEE_SIGNUP_LIST_ID: "123",
  STIBEE_SIGNUP_URL: "https://stibee.com/api/v1.0/auto/signup-template",
};
const env = (name: string) => settings[name];

function request(body: unknown = signup, timestamp = Math.floor(Date.now() / 1000), mutate = (text: string) => text, key = secret) {
  const id = "msg_0123";
  const text = JSON.stringify(body);
  const signature = createHmac("sha256", key).update(`${id}.${timestamp}.${text}`).digest("base64");
  return new Request("https://example.test/hook", {
    method: "POST", body: mutate(text),
    headers: { "webhook-id": id, "webhook-timestamp": String(timestamp), "webhook-signature": `v1,${signature}` },
  });
}

describe("Supabase signup email via Stibee", () => {
  it("registers an authentication-only recipient, then sends only the address and code", async () => {
    const send = vi.fn<typeof fetch>().mockResolvedValueOnce(new Response("ok")).mockResolvedValueOnce(new Response("ok"));
    const response = await sendSignupEmail(request(), env, send);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({});
    expect(send.mock.calls.map(([url, options]) => [url, JSON.parse(String(options?.body))])).toEqual([
      ["https://api.stibee.com/v2/lists/123/subscribers", {
        subscriber: { email, status: "subscribed", marketingAllowed: false }, updateEnabled: false,
      }],
      [settings.STIBEE_SIGNUP_URL, { subscriber: email, yeobek_code: "004012" }],
    ]);
    const registration = send.mock.calls[0][1];
    expect(registration).toMatchObject({ redirect: "error", headers: { AccessToken: "test-key" } });
    expect(send.mock.calls[1][1]?.signal).toBe(registration?.signal);
  });

  it("handles resend without modifying existing address-book preferences", async () => {
    const send = vi.fn<typeof fetch>().mockResolvedValueOnce(
      Response.json({ code: "Errors.List.AlreadyExistEmail" }, { status: 400 }),
    ).mockResolvedValueOnce(new Response("ok"));
    expect((await sendSignupEmail(request(), env, send)).status).toBe(200);
    expect(send).toHaveBeenCalledTimes(2);
  });

  it("also accepts the documented 32-byte secret format", async () => {
    const key = Buffer.alloc(32, 43);
    const getSetting = (name: string) => name === "SEND_EMAIL_HOOK_SECRET" ? `v1,whsec_${key.toString("base64")}` : env(name);
    const send = vi.fn<typeof fetch>().mockResolvedValueOnce(new Response("ok")).mockResolvedValueOnce(new Response("ok"));
    expect((await sendSignupEmail(request(signup, undefined, undefined, key), getSetting, send)).status).toBe(200);
  });

  it("rejects tampered, stale, oversized, and unsupported messages before making any provider calls", async () => {
    const send = vi.fn<typeof fetch>();
    expect((await sendSignupEmail(request(signup, undefined, text => text.replace("004012", "004013")), env, send)).status).toBe(401);
    expect((await sendSignupEmail(request(signup, Math.floor(Date.now() / 1000) - 301), env, send)).status).toBe(401);
    expect((await sendSignupEmail(request({ ...signup, padding: "a".repeat(21 * 1024) }), env, send)).status).toBe(401);
    expect((await sendSignupEmail(request({ ...signup, email_data: { ...signup.email_data, email_action_type: "recovery" } }), env, send)).status).toBe(400);
    expect((await sendSignupEmail(request({ ...signup, user: { email } }), env, send)).status).toBe(400);
    expect(send).not.toHaveBeenCalled();
  });

  it("stops on registration failure and reports trigger failure without retrying or exposing secrets", async () => {
    const send = vi.fn<typeof fetch>().mockResolvedValueOnce(Response.json({ code: "Errors.Data.InvalidRequest" }, { status: 400 }));
    expect((await sendSignupEmail(request(), env, send)).status).toBe(502);
    expect(send).toHaveBeenCalledTimes(1);
    send.mockReset().mockResolvedValueOnce(new Response("ok")).mockResolvedValueOnce(new Response("private data", { status: 500 }));
    const failed = await sendSignupEmail(request(), env, send);
    expect(failed.status).toBe(502);
    expect(await failed.text()).not.toContain("private data");
    expect(send).toHaveBeenCalledTimes(2);
  });
});
