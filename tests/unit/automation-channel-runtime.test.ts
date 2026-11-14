import { afterEach, beforeEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({ worker: vi.fn(), cache: vi.fn(), channel: vi.fn(), provider: vi.fn(), mock: vi.fn() }));
vi.mock("@/lib/supabase/worker", () => ({ createWorkerSupabase: mocks.worker }));
vi.mock("@/lib/automation/channel-token-cache", () => ({ createChannelTokenCache: mocks.cache }));
vi.mock("@/lib/automation/adapters/channeltalk", () => ({ createChannelTalkAdapter: mocks.channel }));
vi.mock("@/lib/automation/adapters/channel-token", () => ({ createChannelTokenAdapter: mocks.provider }));
vi.mock("@/lib/automation/adapters/mock", () => ({ createMockAutomationAdapters: mocks.mock }));
import { createConfiguredSupportPort } from "@/lib/automation/channel-runtime";
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("CHANNEL_TALK_CHANNEL_ID", "channel-1");
  vi.stubEnv("AI_PROVIDER_MODE", "live");
});
afterEach(() => vi.unstubAllEnvs());
it("rejects a model-supplied foreign channel before initializing credentials", () => {
  expect(() => createConfiguredSupportPort("other")).toThrow("not_configured");
  expect(mocks.cache).not.toHaveBeenCalled();
  expect(mocks.worker).not.toHaveBeenCalled();
});
it("keeps development mock independent of real credentials and denies production mock", () => {
  vi.stubEnv("AI_PROVIDER_MODE", "mock");
  const support = { reply: vi.fn() };
  mocks.mock.mockReturnValue({ support });
  expect(createConfiguredSupportPort("channel-1")).toBe(support);
  expect(mocks.cache).not.toHaveBeenCalled();
  vi.stubEnv("NODE_ENV", "production");
  expect(() => createConfiguredSupportPort("channel-1")).toThrow(expect.objectContaining({ code: "not_configured" }));
});
it("wires service-only RPC calls to the same channel cache and respects abort signals", async () => {
  const rpc = vi.fn();
  const abortSignal = vi.fn().mockResolvedValue({ data: true, error: null });
  rpc.mockReturnValue({ abortSignal });
  mocks.worker.mockReturnValue({ rpc });
  createConfiguredSupportPort("channel-1");
  expect(mocks.worker).not.toHaveBeenCalled();
  const { store } = mocks.cache.mock.calls[0][1];
  const signal = new AbortController().signal;
  await store.claim("app-1", "channel-1", "claim-id", signal);
  await expect(store.complete("app-1", "channel-1", "claim-id", "ciphertext", 3600, signal)).resolves.toBe(true);
  expect(rpc.mock.calls[1]).toEqual(["complete_channel_token", {
    p_app_id: "app-1", p_channel_id: "channel-1", p_claim: "claim-id", p_sealed: "ciphertext", p_expires_in: 3600,
  }]);
  expect(abortSignal).toHaveBeenCalledWith(signal);
  expect(mocks.worker).toHaveBeenCalledOnce();
  abortSignal.mockResolvedValue({ data: null, error: { message: "secret provider details" } });
  await expect(store.claim("app-1", "channel-1", "claim-id", signal)).rejects.toMatchObject({ message: "unavailable" });
});
