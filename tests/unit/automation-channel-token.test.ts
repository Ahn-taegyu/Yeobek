import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { createChannelTokenAdapter } from "@/lib/automation/adapters/channel-token";

const pair = { accessToken: "access-1.jwt", refreshToken: "refresh-1.jwt", expiresIn: 3600 };

describe("Channel AppStore token transport", () => {
  it("issues for the requested channel and refreshes using the previous refresh token", async () => {
    const fetcher = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json({ result: { ...pair, extra: "discard" } }))
      .mockResolvedValueOnce(Response.json({ result: { ...pair, refreshToken: "refresh-2.jwt" } }));
    const adapter = createChannelTokenAdapter({ fetch: fetcher });
    expect(await adapter.issueToken("synthetic-secret", "channel-1")).toEqual(pair);
    expect(await adapter.refreshToken(pair.refreshToken)).toEqual({ ...pair, refreshToken: "refresh-2.jwt" });
    const requests = fetcher.mock.calls.map(([url, init]) => {
      expect(url).toBe("https://app-store-api.channel.io/general/v1/native/functions");
      expect(init).toMatchObject({ method: "PUT", cache: "no-store", redirect: "error" });
      expect(init?.headers).toEqual({ "Content-Type": "application/json" });
      return JSON.parse(init?.body as string);
    });
    expect(requests).toEqual([
      { method: "issueToken", params: { secret: "synthetic-secret", channelId: "channel-1" } },
      { method: "refreshToken", params: { refreshToken: pair.refreshToken } },
    ]);
  });

  it.each([
    {},
    { result: pair, error: { code: 403 } },
    { result: pair, error: null },
    ...[0, -1, 0.5, "3600", 31536001, Number.MAX_SAFE_INTEGER].map(expiresIn => ({ result: { ...pair, expiresIn } })),
    ...["", "abc\r\n", "abc\t", "a b", "abc,def", "한글", "x".repeat(8193)].map(accessToken => ({ result: { ...pair, accessToken } })),
  ])("rejects malformed or conflicting token envelopes", async body => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json(body));
    await expect(createChannelTokenAdapter({ fetch: fetcher }).refreshToken("old-token"))
      .rejects.toMatchObject({ code: "invalid_response", message: "invalid_response" });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("rejects invalid credentials before fetching", async () => {
    const fetcher = vi.fn<typeof fetch>();
    const adapter = createChannelTokenAdapter({ fetch: fetcher });
    await expect(adapter.issueToken("secret", "channel-1\n")).rejects.toThrow("invalid_input");
    await expect(adapter.refreshToken("invalid token")).rejects.toThrow("invalid_input");
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("discards provider error bodies and transport exceptions", async () => {
    const cancel = vi.fn();
    const fetcher = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(new ReadableStream({ cancel }), { status: 429 }))
      .mockResolvedValueOnce(Response.json({ error: { code: 401, message: "private response", data: pair } }))
      .mockRejectedValueOnce(new Error("private transport data"));
    const adapter = createChannelTokenAdapter({ fetch: fetcher });
    await expect(adapter.refreshToken("old-token")).rejects.toMatchObject({ code: "rate_limited", message: "rate_limited" });
    expect(cancel).toHaveBeenCalledOnce();
    await expect(adapter.refreshToken("old-token")).rejects.toMatchObject({ code: "rejected", message: "rejected" });
    await expect(adapter.refreshToken("old-token")).rejects.toMatchObject({ code: "unavailable", message: "unavailable" });
    expect(fetcher).toHaveBeenCalledTimes(3);
  });

  it("enforces the body size while streaming and cancels the remainder", async () => {
    const cancel = vi.fn();
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(new ReadableStream({
      start(controller) {
        controller.enqueue(new Uint8Array(65536));
        controller.enqueue(new Uint8Array(1));
      },
      cancel,
    }), { headers: { "Content-Type": "application/json" } }));
    await expect(createChannelTokenAdapter({ fetch: fetcher }).refreshToken("old-token")).rejects.toThrow("invalid_response");
    expect(cancel).toHaveBeenCalledOnce();
  });

  it("times out a stalled body and cancels its reader", async () => {
    const cancel = vi.fn();
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(new ReadableStream({ cancel }), {
      headers: { "Content-Type": "application/json" },
    }));
    await expect(createChannelTokenAdapter({ fetch: fetcher, timeoutMs: 5 }).refreshToken("old-token"))
      .rejects.toMatchObject({ code: "timeout", message: "timeout" });
    expect(cancel).toHaveBeenCalledOnce();
    expect(fetcher.mock.calls[0][1]?.signal?.aborted).toBe(true);
  });

  it("sanitizes caller cancellation and cancels a response arriving after it", async () => {
    let respond!: (response: Response) => void;
    const fetcher = vi.fn<typeof fetch>(() => new Promise<Response>(resolve => { respond = resolve; }));
    const controller = new AbortController();
    const adapter = createChannelTokenAdapter({ fetch: fetcher });
    const pending = adapter.refreshToken("old-token", controller.signal);
    controller.abort(new Error("private abort reason"));
    await expect(pending).rejects.toMatchObject({ code: "cancelled", message: "cancelled" });
    const cancel = vi.fn();
    respond(new Response(new ReadableStream({ cancel })));
    await vi.waitFor(() => expect(cancel).toHaveBeenCalledOnce());
    await expect(adapter.refreshToken("old-token", controller.signal)).rejects.toThrow("cancelled");
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
