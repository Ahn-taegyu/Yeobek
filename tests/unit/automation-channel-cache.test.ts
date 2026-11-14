import { expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { createChannelTokenCache, type ChannelTokenStore } from "@/lib/automation/channel-token-cache";
import type { ChannelTokenPort } from "@/lib/automation/adapters/channel-token";

const config = { appId: "app-a", channelId: "channel-a", appSecret: "secret-fixture", encryptionKey: "ab".repeat(32) };
const pair = { accessToken: "access-fixture", refreshToken: "refresh-fixture", expiresIn: 3600 };
function fixture() {
  const store = { claim: vi.fn<ChannelTokenStore["claim"]>().mockResolvedValue({ state: "refresh", sealed: null }),
    complete: vi.fn<ChannelTokenStore["complete"]>().mockResolvedValue(true) };
  const provider = { issueToken: vi.fn<ChannelTokenPort["issueToken"]>().mockResolvedValue(pair),
    refreshToken: vi.fn<ChannelTokenPort["refreshToken"]>().mockResolvedValue(pair) };
  return { store, provider };
}
it("persists only ciphertext and reuses it without another token request", async () => {
  const deps = fixture();
  const get = createChannelTokenCache(config, deps);
  expect(await get()).toBe(pair.accessToken);
  const [app, channel, claim, sealed, seconds] = deps.store.complete.mock.calls[0];
  expect([app, channel, seconds]).toEqual([config.appId, config.channelId, 3600]);
  expect(claim).toBe(deps.store.claim.mock.calls[0][2]);
  for (const value of [pair.accessToken, pair.refreshToken, config.appSecret]) expect(sealed).not.toContain(value);
  deps.store.claim.mockResolvedValue({ state: "cached", sealed });
  expect(await get()).toBe(pair.accessToken);
  expect(deps.provider.issueToken).toHaveBeenCalledOnce();
  expect(deps.store.complete).toHaveBeenCalledOnce();
});
it("renews using the stored refresh token rather than reissuing with the app secret", async () => {
  const deps = fixture();
  const get = createChannelTokenCache(config, deps);
  await get();
  deps.store.claim.mockResolvedValue({ state: "refresh", sealed: deps.store.complete.mock.calls[0][3] });
  await get();
  expect(deps.provider.refreshToken).toHaveBeenCalledWith(pair.refreshToken, expect.any(AbortSignal));
  expect(deps.provider.issueToken).toHaveBeenCalledOnce();
  expect(deps.store.complete.mock.calls[1][3]).not.toBe(deps.store.complete.mock.calls[0][3]);
});
it("rejects ciphertext copied across app/channel scopes or a changed encryption key", async () => {
  const deps = fixture();
  await createChannelTokenCache(config, deps)();
  const sealed = deps.store.complete.mock.calls[0][3];
  deps.store.claim.mockResolvedValue({ state: "cached", sealed });
  for (const changed of [{ channelId: "other" }, { appId: "other" }, { encryptionKey: "cd".repeat(32) }]) {
    await expect(createChannelTokenCache({ ...config, ...changed }, deps)()).rejects.toMatchObject({ code: "not_configured" });
  }
  deps.store.claim.mockResolvedValue({ state: "cached", sealed: sealed.replace(/^v1/, "v2") });
  await expect(createChannelTokenCache(config, deps)()).rejects.toMatchObject({ code: "not_configured" });
  expect(deps.provider.issueToken).toHaveBeenCalledOnce();
});
it.each([["busy", "not_ready"], ["limited", "rate_limited"]])("does not issue when the DB says %s", async (state, code) => {
  const deps = fixture();
  deps.store.claim.mockResolvedValue({ state });
  await expect(createChannelTokenCache(config, deps)()).rejects.toMatchObject({ code });
  expect(deps.provider.issueToken).not.toHaveBeenCalled();
  expect(deps.store.complete).not.toHaveBeenCalled();
});
it("never releases a lease or returns credentials after failed or ambiguous persistence", async () => {
  const deps = fixture();
  deps.store.complete.mockResolvedValueOnce(false).mockRejectedValueOnce(new Error("private credential details"));
  const get = createChannelTokenCache(config, deps);
  await expect(get()).rejects.toMatchObject({ code: "stale_source" });
  await expect(get()).rejects.toMatchObject({ message: "unavailable" });
  expect(deps.provider.issueToken).toHaveBeenCalledTimes(2); // separate explicit calls, no internal retry
});
it("bounds non-cooperative stores and prevents late token acquisition", async () => {
  const deps = fixture();
  let finish!: (value: unknown) => void;
  deps.store.claim.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
  const get = createChannelTokenCache(config, { ...deps, timeoutMs: 5 });
  await expect(get()).rejects.toMatchObject({ code: "timeout" });
  finish({ state: "refresh", sealed: null });
  await Promise.resolve();
  expect(deps.provider.issueToken).not.toHaveBeenCalled();
});
it("prevents a late provider result from being persisted after cancellation", async () => {
  const deps = fixture();
  let finish!: (value: typeof pair) => void;
  deps.provider.issueToken.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
  await expect(createChannelTokenCache(config, { ...deps, timeoutMs: 5 })()).rejects.toMatchObject({ code: "timeout" });
  finish(pair);
  await Promise.resolve();
  expect(deps.store.complete).not.toHaveBeenCalled();
});
it("validates configuration before accessing storage", () => {
  const deps = fixture();
  expect(() => createChannelTokenCache({ ...config, encryptionKey: "bad" }, deps)).toThrow("not_configured");
  expect(deps.store.claim).not.toHaveBeenCalled();
});
it("does not return a token that expired during durable completion", async () => {
  const deps = fixture();
  deps.provider.issueToken.mockResolvedValue({ ...pair, expiresIn: 1 });
  await expect(createChannelTokenCache(config, deps)()).rejects.toMatchObject({ code: "stale_source" });
});
it("cancellation during an ambiguous write never returns credentials", async () => {
  const deps = fixture();
  let finish!: (value: boolean) => void;
  deps.store.complete.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
  await expect(createChannelTokenCache(config, { ...deps, timeoutMs: 5 })()).rejects.toMatchObject({ code: "timeout" });
  finish(true);
  await Promise.resolve();
  expect(deps.store.complete).toHaveBeenCalledOnce();
  expect(deps.provider.issueToken).toHaveBeenCalledOnce();
});
