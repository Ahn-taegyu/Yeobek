import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  worker: vi.fn(),
  rpc: vi.fn<(worker: unknown, name: string, args: unknown) => Promise<unknown>>(),
  reply: vi.fn(),
  generate: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/worker", () => ({ createWorkerSupabase: mocks.worker }));
vi.mock("@/lib/api/db", () => ({ rpc: mocks.rpc }));
vi.mock("@/lib/ai/runtime", () => ({ createConfiguredTextProvider: () => ({ generate: mocks.generate }) }));
vi.mock("@/lib/automation/channel-runtime", () => ({ createConfiguredSupportPort: () => ({ reply: mocks.reply }) }));

import { runSupportBatch } from "@/lib/automation/support-runner";
import { ids } from "../fixtures/ai";

const channel = "configured-channel";
const job = ids.other;
const event = ids.request;
const message = ids.artwork;
const sendAttempt = ids.exhibition;
const revision = "ab".repeat(32);
const answer = "전시 관리 화면에서 작품을 등록해 주세요.";

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("NODE_ENV", "test");
  vi.stubEnv("AI_PROVIDER_MODE", "mock");
  vi.stubEnv("CHANNEL_TALK_CHANNEL_ID", channel);
  mocks.worker.mockReturnValue({
    from: () => ({ select: () => ({ in: () => Promise.resolve({ data: [
      { key: "automation_batch_events", value: 1 },
      { key: "automation_batch_dispatch", value: 1 },
    ] }) }) }),
  });
  mocks.generate.mockResolvedValue({
    output: { answer, citations: ["help-register"], category: "usage" },
    trace: { provider: "mock", model: "mock-automation", usage: { totalTokens: 20 } },
  });
});

afterEach(() => vi.unstubAllEnvs());

function configureRpc(responses: Record<string, unknown>) {
  mocks.rpc.mockImplementation(async (_worker, name) => {
    if (!Object.hasOwn(responses, name)) throw new Error(`Unexpected RPC ${name}`);
    const value = responses[name];
    if (value instanceof Error) throw value;
    return value;
  });
}

const claimed = {
  claim_support_events: [{ id: event, kind: "support", attempt: 1, mock: true }],
  reserve_automation_job: { jobId: job, attempt: 1, claimed: true },
  get_support_context: {
    eventId: event, revision, question: "작품 등록은 어떻게 하나요?",
    evidence: [{ id: "help-register", kind: "help", body: "전시 관리 화면에서 작품을 등록할 수 있습니다." }],
  },
  claim_support_outbound: [],
};

describe("support automation runner", () => {
  it("leaves the queue untouched when the configured channel is missing", async () => {
    vi.stubEnv("CHANNEL_TALK_CHANNEL_ID", undefined);
    expect(await runSupportBatch()).toMatchObject({ dispatchReady: false, processed: 0 });
    expect(mocks.worker).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("rejects production mock mode before opening a queue connection", async () => {
    vi.stubEnv("NODE_ENV", "production");
    await expect(runSupportBatch()).rejects.toMatchObject({ code: "not_configured" });
    expect(mocks.worker).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("counts the authoritative database outcome when it suppresses a generated draft", async () => {
    configureRpc({ ...claimed, complete_support_job: { event: { state: "suppressed" } } });
    expect(await runSupportBatch()).toMatchObject({ processed: 0, suppressed: 1, persistenceFailures: 0 });
    expect(mocks.generate).toHaveBeenCalledOnce();
    expect(mocks.rpc).toHaveBeenCalledWith(expect.anything(), "complete_support_job", expect.objectContaining({
      p_event_id: event, p_job_id: job, p_attempt: 1, p_mock: true, p_context_revision: revision,
      p_state: "processed", p_body: answer, p_category: "usage",
    }));
  });

  it("records a lost completion without issuing a contradictory event completion", async () => {
    configureRpc({ ...claimed, complete_support_job: new Error("timed out") });
    expect(await runSupportBatch()).toMatchObject({ failed: 1, persistenceFailures: 1 });
    expect(mocks.rpc.mock.calls.map(([, name]) => name)).toEqual([
      "claim_support_events", "reserve_automation_job", "get_support_context", "get_support_context",
      "complete_support_job", "claim_support_outbound",
    ]);
  });

  it("scopes claims to the configured channel and sends only to the destination in the database permit", async () => {
    vi.stubEnv("AI_PROVIDER_MODE", "live");
    configureRpc({
      claim_support_events: [],
      claim_support_outbound: [{ id: message, attempt: sendAttempt, mock: false }],
      check_outbound_dispatch: {
        id: message, attempt: sendAttempt, mock: false, channel: "support", category: "usage",
        recipient: null, channelId: channel, chatId: "permitted-chat", body: answer,
      },
      complete_outbound_message: {},
    });
    mocks.reply.mockResolvedValue({ status: "accepted", code: "accepted", mock: false, providerMessageId: "provider-message" });
    expect(await runSupportBatch()).toMatchObject({ dispatchReady: true, dispatch: { claimed: 1, accepted: 1 } });
    expect(mocks.rpc.mock.calls.map(([, name, args]) => [name, args])).toEqual([
      ["claim_support_events", { p_limit: 1, p_mock: false, p_channel_id: channel }],
      ["claim_support_outbound", { p_limit: 1, p_mock: false, p_channel_id: channel }],
      ["check_outbound_dispatch", { p_id: message, p_attempt: sendAttempt, p_mock: false }],
      ["complete_outbound_message", {
        p_id: message, p_attempt: sendAttempt, p_status: "accepted",
        p_provider_id: "provider-message", p_result_code: "ACCEPTED",
      }],
    ]);
    expect(mocks.reply).toHaveBeenCalledExactlyOnceWith(
      { channelId: channel, chatId: "permitted-chat", text: answer }, expect.any(AbortSignal),
    );
  });
});
