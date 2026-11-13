import { createHmac } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { createStibeeAdapter } from "@/lib/automation/adapters/stibee";
import { verifyAltSignature } from "@/lib/automation/alt-signature";

const config = { apiKey: "test-key-not-real", templates: {
  transactional: "https://stibee.com/api/v1.0/auto/transactional",
  marketing: "https://stibee.com/api/v1.0/auto/marketing",
}, paragraphField: "yeobek_paragraph" };
const mail = { recipient: "artist@example.test", template: "transactional" as const, paragraph: '검수가 필요합니다. <script>"&' };

describe("Stibee dispatch boundary", () => {
  it("sends only recipient and escaped configured paragraph; 200 is accepted, not delivered", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response("private receipt", { status: 200 }));
    const result = await createStibeeAdapter(config, { fetch: fetcher }).send(mail);
    expect(result).toEqual({ status: "accepted", code: "accepted", mock: false });
    const [url, init] = fetcher.mock.calls[0];
    expect(url).toBe(config.templates.transactional);
    expect(init?.redirect).toBe("error");
    expect(init?.headers).toEqual({ AccessToken: config.apiKey, "Content-Type": "application/json" });
    expect(JSON.parse(init?.body as string)).toEqual({ subscriber: mail.recipient, yeobek_paragraph: "검수가 필요합니다. &lt;script&gt;&quot;&amp;" });
  });
  it.each([400, 401, 403, 429])("explicit %i refusal is rejected without retry", async status => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response("sensitive", { status }));
    expect(await createStibeeAdapter(config, { fetch: fetcher }).send(mail)).toEqual({
      status: "rejected", code: status === 429 ? "rate_limited" : "provider_rejected", mock: false,
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it.each([202, 302, 408, 499, 500, 503])("undocumented %i result remains unknown without retry", async status => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status }));
    expect((await createStibeeAdapter(config, { fetch: fetcher }).send(mail)).status).toBe("unknown");
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("does not resend a possibly submitted request after transport failure", async () => {
    const fetcher = vi.fn<typeof fetch>().mockRejectedValue(new Error("secret recipient provider details"));
    expect(await createStibeeAdapter(config, { fetch: fetcher }).send(mail)).toEqual({ status: "unknown", code: "ambiguous_transport", mock: false });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("bounds a signal-ignoring fetch and treats in-flight timeout as unknown", async () => {
    const fetcher = vi.fn<typeof fetch>().mockImplementation(() => new Promise(() => {}));
    expect((await createStibeeAdapter(config, { fetch: fetcher, timeoutMs: 5 }).send(mail)).status).toBe("unknown");
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("pre-cancellation and invalid payloads do not dispatch", async () => {
    const fetcher = vi.fn<typeof fetch>();
    const adapter = createStibeeAdapter(config, { fetch: fetcher });
    await expect(adapter.send(mail, AbortSignal.abort())).rejects.toMatchObject({ code: "cancelled" });
    await expect(adapter.send({ ...mail, paragraph: "" })).rejects.toMatchObject({ code: "invalid_input" });
    await expect(adapter.send({ ...mail, privateSource: "raw" } as typeof mail)).rejects.toMatchObject({ code: "invalid_input" });
    expect(fetcher).not.toHaveBeenCalled();
  });
  it.each(["https://evil.test/api/v1.0/auto/x", "http://stibee.com/api/v1.0/auto/x", "https://stibee.com/api/v1.0/auto/x?q=a", "https://user@stibee.com/api/v1.0/auto/x"])("rejects nonfixed template endpoint %s", url => {
    expect(() => createStibeeAdapter({ ...config, templates: { ...config.templates, transactional: url } })).toThrow("not_configured");
  });
  it("cannot override recipient with a custom field", () => {
    expect(() => createStibeeAdapter({ ...config, paragraphField: "subscriber" })).toThrow("not_configured");
  });
  it("requires distinct transactional and marketing templates", () => {
    expect(() => createStibeeAdapter({ ...config, templates: { ...config.templates, marketing: config.templates.transactional } })).toThrow("not_configured");
  });
});

describe("Alt webhook authentication", () => {
  const key = Buffer.alloc(32, 19);
  const secret = `whsec_${key.toString("base64url")}`;
  const raw = Buffer.from('{"event_id":"evt-123", "data":{"note_id":"note-1"}}');
  const now = 1794600000000;
  function signed(body = raw, timestamp = String(now / 1000)) {
    const signature = createHmac("sha256", key).update(`evt-123.${timestamp}.`).update(body).digest("base64");
    return new Headers({ "webhook-id": "evt-123", "webhook-timestamp": timestamp, "webhook-signature": `v1,${signature}` });
  }
  it("accepts raw bytes and a valid key-rotation signature among others", () => {
    const headers = signed();
    headers.set("webhook-signature", `v1,${Buffer.alloc(32).toString("base64")} ${headers.get("webhook-signature")}`);
    expect(verifyAltSignature(raw, headers, secret, now)).toBe("evt-123");
  });
  it("rejects reserialized or altered bodies", () => {
    expect(() => verifyAltSignature(Buffer.from(JSON.stringify(JSON.parse(raw.toString()))), signed(), secret, now)).toThrow("rejected");
  });
  it.each([-301, 301])("rejects timestamp offset %i even with valid HMAC", offset => {
    expect(() => verifyAltSignature(raw, signed(raw, String(now / 1000 + offset)), secret, now)).toThrow("rejected");
  });
  it("rejects changed ID, malformed signature and oversized body", () => {
    const headers = signed();
    headers.set("webhook-id", "evt-other");
    expect(() => verifyAltSignature(raw, headers, secret, now)).toThrow("rejected");
    headers.set("webhook-signature", "v1,abcd");
    expect(() => verifyAltSignature(raw, headers, secret, now)).toThrow("rejected");
    const large = Buffer.alloc(65537);
    expect(() => verifyAltSignature(large, signed(large), secret, now)).toThrow("rejected");
  });
});
