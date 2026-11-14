import { dispatchOutbox } from "@/lib/automation/dispatch";
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
  it("preserves approved whitespace and Unicode in the escaped outbound paragraph", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 200 }));
    const paragraph = "  가🖼️ &\n ";
    await createStibeeAdapter(config, { fetch: fetcher }).send({ ...mail, paragraph });
    expect(JSON.parse(String(fetcher.mock.calls[0][1]?.body)).yeobek_paragraph).toBe("  가🖼️ &amp;\n ");
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

describe("outbox dispatch", () => {
  const item = { id: "dbe48811-59a8-4348-84c9-460687880e34", attempt: "dbe48811-59a8-4348-84c9-460687880e35", mock: true };
  const permit = { ...item, channel: "mail", category: "transactional", body: "자료를 확인해 주세요.",
    recipient: "artist@example.test", channelId: null, chatId: null };
  const options = { limit: 1, deadlineMs: 500, mock: true };
  function setup() {
    const check = vi.fn().mockResolvedValue(permit);
    const complete = vi.fn().mockResolvedValue(null);
    const send = vi.fn().mockResolvedValue({ status: "accepted", code: "accepted", mock: true });
    const reply = vi.fn();
    const deps = { store: { claim: vi.fn().mockResolvedValue([item]), check, complete }, mail: { send }, support: { reply } };
    return { deps, check, complete, send, reply };
  }

  it("only dispatches the database permit and persists receipt once", async () => {
    const s = setup();
    expect(await dispatchOutbox(s.deps, options)).toMatchObject({ claimed: 1, accepted: 1, persistenceFailures: 0 });
    expect(s.check).toHaveBeenCalledWith(item.id, item.attempt, true);
    expect(s.send).toHaveBeenCalledExactlyOnceWith({ recipient: permit.recipient, template: "transactional",
      paragraph: permit.body }, expect.any(AbortSignal));
    expect(s.complete).toHaveBeenCalledExactlyOnceWith(item.id, item.attempt, "accepted", null, "ACCEPTED");
  });

  it("routes support to the pinned chat, omitting mail fields", async () => {
    const s = setup();
    s.check.mockResolvedValue({ ...permit, channel: "support", category: "status", recipient: null, channelId: "channel", chatId: "chat" });
    s.reply.mockResolvedValue({ status: "accepted", code: "accepted", providerMessageId: "msg", mock: true });
    expect(await dispatchOutbox(s.deps, options)).toMatchObject({ accepted: 1 });
    expect(s.reply).toHaveBeenCalledExactlyOnceWith({ channelId: "channel", chatId: "chat", text: permit.body }, expect.any(AbortSignal));
    expect(s.send).not.toHaveBeenCalled();
    expect(s.complete).toHaveBeenCalledExactlyOnceWith(item.id, item.attempt, "accepted", "msg", "ACCEPTED");
  });

  it("does not dispatch a suppressed, incorrect-mode, or invalid permit", async () => {
    const s = setup();
    s.check.mockResolvedValueOnce(null).mockResolvedValueOnce({ ...permit, mock: false }).mockResolvedValueOnce({ ...permit, recipient: null });
    expect(await dispatchOutbox(s.deps, options)).toMatchObject({ skipped: 1 });
    expect(await dispatchOutbox(s.deps, options)).toMatchObject({ failed: 1 });
    expect(await dispatchOutbox(s.deps, options)).toMatchObject({ failed: 1 });
    expect(s.send).not.toHaveBeenCalled();
    expect(s.complete).toHaveBeenCalledTimes(2);
  });

  it("preserves ambiguous transport and does not repeat a delivery if persisting the receipt fails", async () => {
    const s = setup();
    s.send.mockRejectedValue(new Error("private provider body"));
    s.complete.mockRejectedValue(new Error("database unavailable"));
    expect(await dispatchOutbox(s.deps, options)).toMatchObject({ unknown: 1, persistenceFailures: 1 });
    expect(s.send).toHaveBeenCalledOnce();
    expect(s.complete).toHaveBeenCalledExactlyOnceWith(item.id, item.attempt, "unknown", null, "AMBIGUOUS_TRANSPORT");
  });

  it("does not accept a receipt whose mock mode disagrees with the claim", async () => {
    const s = setup();
    s.send.mockResolvedValue({ status: "accepted", code: "accepted", mock: false });
    expect(await dispatchOutbox(s.deps, options)).toMatchObject({ unknown: 1 });
  });

  it("settles a late claim if cancelled before the DB permit", async () => {
    const s = setup();
    const controller = new AbortController();
    s.deps.store.claim.mockImplementation(async () => { controller.abort(); return [item]; });
    expect(await dispatchOutbox(s.deps, { ...options, signal: controller.signal })).toMatchObject({ failed: 1 });
    expect(s.check).not.toHaveBeenCalled();
    expect(s.send).not.toHaveBeenCalled();
    expect(s.complete).toHaveBeenCalledExactlyOnceWith(item.id, item.attempt, "failed", null, "CANCELLED_BEFORE_DISPATCH");
  });

  it("treats a provider that ignores cancellation as unknown", async () => {
    const s = setup();
    const controller = new AbortController();
    s.send.mockImplementation(() => new Promise(() => { controller.abort(); }));
    expect(await dispatchOutbox(s.deps, { ...options, signal: controller.signal })).toMatchObject({ unknown: 1 });
    expect(s.send).toHaveBeenCalledOnce();
  });
  it("stops on a repeated ID without dispatching it again", async () => {
    const s = setup();
    expect(await dispatchOutbox(s.deps, { ...options, limit: 5 })).toMatchObject({ claimed: 1, accepted: 1, skipped: 1 });
    expect(s.deps.store.claim.mock.calls).toEqual([[1, true], [1, true]]);
    expect(s.send).toHaveBeenCalledOnce();
  });

  it("leaves a pacing-deferred message approved for the next batch without reclaiming its lease", async () => {
    const s = setup();
    let state = "approved";
    s.deps.store.claim.mockImplementation(async () => { state = "sending"; return [item]; });
    // check_notification_dispatch returns an unissued, paced claim to approved.
    s.check.mockImplementation(async () => { state = "approved"; return null; });
    const result = await dispatchOutbox(s.deps, { ...options, limit: 5 });
    expect(state).toBe("approved");
    expect(result).toMatchObject({ skipped: 1, accepted: 0 });
    expect(s.deps.store.claim).toHaveBeenCalledOnce();
    expect(s.send).not.toHaveBeenCalled();
    expect(s.complete).not.toHaveBeenCalled();
    s.check.mockResolvedValue(permit);
    expect(await dispatchOutbox(s.deps, { ...options, limit: 1 })).toMatchObject({ accepted: 1 });
    expect(s.send).toHaveBeenCalledOnce();
  });

  it("does not check or send a claim from the other mode", async () => {
    const s = setup();
    s.deps.store.claim.mockResolvedValue([{ ...item, mock: false }]);
    expect(await dispatchOutbox(s.deps, options)).toMatchObject({ skipped: 1 });
    expect(s.check).not.toHaveBeenCalled();
    expect(s.send).not.toHaveBeenCalled();
  });

  it("settles a failed DB check without calling the provider", async () => {
    const s = setup();
    s.check.mockRejectedValue(new Error("database unavailable"));
    expect(await dispatchOutbox(s.deps, options)).toMatchObject({ failed: 1 });
    expect(s.send).not.toHaveBeenCalled();
    expect(s.complete).toHaveBeenCalledExactlyOnceWith(item.id, item.attempt, "failed", null, "DISPATCH_CHECK_FAILED");
  });

  it("settles cancellation after the DB check without calling the provider", async () => {
    const s = setup();
    const controller = new AbortController();
    s.check.mockImplementation(async () => { controller.abort(); return permit; });
    expect(await dispatchOutbox(s.deps, { ...options, signal: controller.signal })).toMatchObject({ failed: 1 });
    expect(s.send).not.toHaveBeenCalled();
    expect(s.complete).toHaveBeenCalledExactlyOnceWith(item.id, item.attempt, "failed", null, "CANCELLED_BEFORE_DISPATCH");
  });

  it("persists a definitive rejection without retry", async () => {
    const s = setup();
    s.send.mockResolvedValue({ status: "rejected", code: "rate_limited", mock: true });
    expect(await dispatchOutbox(s.deps, options)).toMatchObject({ rejected: 1 });
    expect(s.send).toHaveBeenCalledOnce();
    expect(s.complete).toHaveBeenCalledExactlyOnceWith(item.id, item.attempt, "rejected", null, "RATE_LIMITED");
  });

  it("paces sequential mail starts and preserves the checked Unicode body", async () => {
    const s = setup();
    const second = { ...item, id: "dbe48811-59a8-4348-84c9-460687880e37" };
    const body = "  가🖼️\n  ";
    const starts: number[] = [];
    s.deps.store.claim.mockResolvedValueOnce([item]).mockResolvedValueOnce([second]);
    s.check.mockResolvedValueOnce({ ...permit, body }).mockResolvedValueOnce({ ...permit, ...second, body });
    s.send.mockImplementation(async () => {
      starts.push(performance.now());
      return { status: "accepted", code: "accepted", mock: true };
    });
    expect(await dispatchOutbox(s.deps, { ...options, limit: 2, deadlineMs: 2000 })).toMatchObject({ accepted: 2 });
    expect(starts[1] - starts[0]).toBeGreaterThanOrEqual(330);
    expect(s.send.mock.calls.map(([value]) => value.paragraph)).toEqual([body, body]);
  });

});
