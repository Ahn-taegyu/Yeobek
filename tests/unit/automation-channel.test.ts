import { createHmac } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { createChannelTalkAdapter } from "@/lib/automation/adapters/channeltalk";
import { verifyChannelSignature } from "@/lib/automation/channel-signature";

const config = { channelId: "channel-1", getChannelToken: async () => "test-token" };
const message = { channelId: "channel-1", chatId: "chat-1", text: "승인 후 게시해 주세요." };
describe("Channel app native message boundary", () => {
  it("preserves reviewed whitespace and code points and rejects NUL before sending", async () => {
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async () => Response.json({ result: { message: {} } }));
    const adapter = createChannelTalkAdapter(config, { fetch: fetcher });
    for (const text of ["  승인한 문구\n", "🌿".repeat(2000)]) {
      expect((await adapter.reply({ ...message, text })).status).toBe("accepted");
      expect(JSON.parse(fetcher.mock.calls.at(-1)![1]!.body as string).params.dto.plainText).toBe(text);
    }
    await expect(adapter.reply({ ...message, text: "문구\0" })).rejects.toMatchObject({ code: "invalid_input" });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it("uses scoped token and reviewed native DTO; strips other response fields", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ result: { message: { id: "msg-1", privateField: "discard" } } }));
    expect(await createChannelTalkAdapter(config, { fetch: fetcher }).reply(message)).toEqual({
      status: "accepted", code: "accepted", mock: false, providerMessageId: "msg-1",
    });
    const [url, init] = fetcher.mock.calls[0];
    expect(url).toBe("https://app-store-api.channel.io/general/v1/native/functions");
    expect(init).toMatchObject({ method: "PUT", redirect: "error", headers: { "x-access-token": "test-token" } });
    expect(JSON.parse(init?.body as string)).toEqual({ method: "writeUserChatMessage", params: {
      channelId: "channel-1", userChatId: "chat-1", dto: { plainText: message.text },
    } });
  });
  it("rejects another channel and input extras before token acquisition", async () => {
    const getChannelToken = vi.fn(config.getChannelToken);
    const adapter = createChannelTalkAdapter({ ...config, getChannelToken });
    await expect(adapter.reply({ ...message, channelId: "other" })).rejects.toMatchObject({ code: "invalid_input" });
    await expect(adapter.reply({ ...message, rawSource: "private" } as typeof message)).rejects.toMatchObject({ code: "invalid_input" });
    expect(getChannelToken).not.toHaveBeenCalled();
  });
  it.each([{ error: { code: 4 } }, {}, { result: { message: {} }, error: {} }])("ambiguous RPC envelopes are never safe to resend", async body => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json(body));
    expect((await createChannelTalkAdapter(config, { fetch: fetcher }).reply(message)).status).toBe("unknown");
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("lost response after dispatch is unknown; token error stays pre-dispatch", async () => {
    const fetcher = vi.fn<typeof fetch>().mockRejectedValue(new Error("private transport data"));
    expect((await createChannelTalkAdapter(config, { fetch: fetcher }).reply(message)).status).toBe("unknown");
    const getChannelToken = async () => { throw new Error("private credential data"); };
    await expect(createChannelTalkAdapter({ ...config, getChannelToken }, { fetch: fetcher }).reply(message)).rejects.toMatchObject({ message: "unavailable" });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it.each([408, 499])("gateway %i is unknown, not a definitive refusal", async status => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status }));
    expect((await createChannelTalkAdapter(config, { fetch: fetcher }).reply(message)).status).toBe("unknown");
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("limits streamed receipt bytes and does not retain response content", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(" ".repeat(65537), { headers: { "Content-Type": "application/json" } }));
    expect((await createChannelTalkAdapter(config, { fetch: fetcher }).reply(message)).status).toBe("unknown");
  });
  it("cancels a stalled receipt stream at deadline", async () => {
    const cancel = vi.fn();
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(new ReadableStream({ cancel }), { headers: { "Content-Type": "application/json" } }));
    expect((await createChannelTalkAdapter(config, { fetch: fetcher, timeoutMs: 5 }).reply(message)).status).toBe("unknown");
    expect(cancel).toHaveBeenCalled();
  });
  it("a token arriving after cancellation cannot send a message", async () => {
    let resolve!: (token: string) => void;
    const fetcher = vi.fn<typeof fetch>();
    const getChannelToken = () => new Promise<string>(done => { resolve = done; });
    const pending = createChannelTalkAdapter({ ...config, getChannelToken }, { fetch: fetcher, timeoutMs: 5 }).reply(message);
    await expect(pending).rejects.toMatchObject({ code: "timeout" });
    resolve("late-token");
    await new Promise(done => setTimeout(done, 0));
    expect(fetcher).not.toHaveBeenCalled();
  });
});

describe("Channel app signature", () => {
  const key = Buffer.alloc(32, 7).toString("hex");
  const body = Buffer.from('{"method":"test"}');
  const signature = createHmac("sha256", Buffer.from(key, "hex")).update(body).digest("base64");
  it("matches official hex-key/raw-body/base64 protocol", () => {
    expect(() => verifyChannelSignature(body, signature, key)).not.toThrow();
    expect(() => verifyChannelSignature(Buffer.from("changed"), signature, key)).toThrow("rejected");
  });
  it("rejects missing/invalid signatures and malformed config", () => {
    expect(() => verifyChannelSignature(body, null, key)).toThrow("rejected");
    expect(() => verifyChannelSignature(body, "bad", key)).toThrow("rejected");
    expect(() => verifyChannelSignature(body, signature, key + "x")).toThrow("not_configured");
  });
});
