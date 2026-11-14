import { afterEach, beforeEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({ worker: vi.fn(), rpc: vi.fn(), abortSignal: vi.fn() }));
vi.mock("@/lib/supabase/worker", () => ({ createWorkerSupabase: mocks.worker }));
import { authenticateChannelWebhook, channelInquiry } from "@/lib/automation/channel-webhook";
import { POST } from "@/app/api/webhooks/channeltalk/route";

const token = "synthetic-webhook-token-for-tests-only";
const now = Date.now();
const envelope = { event: "push", type: "message", entity: {
  id: "message-1", channelId: "channel-1", chatType: "userChat", chatId: "chat-1",
  personType: "user", personId: "user-1", createdAt: now, plainText: "전시 상태를 알려 주세요.",
} };
const request = (query = `token=${token}`, body: unknown = envelope) => new Request(`https://example.invalid/api/webhooks/channeltalk?${query}`, {
  method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
});
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("AI_PROVIDER_MODE", "mock");
  vi.stubEnv("CHANNEL_TALK_CHANNEL_ID", "channel-1");
  vi.stubEnv("CHANNEL_TALK_WEBHOOK_TOKEN", token);
  mocks.worker.mockReturnValue({ rpc: mocks.rpc });
  mocks.rpc.mockReturnValue({ abortSignal: mocks.abortSignal });
  mocks.abortSignal.mockResolvedValue({ data: { accepted: true, duplicate: false, eventId: "private-event" }, error: null });
});
afterEach(() => vi.unstubAllEnvs());

it("authenticates exactly one query token without creating a DB client on rejection", async () => {
  expect(authenticateChannelWebhook(request())).toBe("channel-1");
  for (const query of ["", "token=wrong", `token=${token}&token=${token}`]) {
    const response = await POST(request(query));
    expect(response.status).toBe(404);
    expect(await response.text()).not.toContain(token);
  }
  expect(mocks.worker).not.toHaveBeenCalled();
});
it("pins identity from provider fields and strips unrelated customer-supplied identity", async () => {
  const response = await POST(request(undefined, { ...envelope, ownerId: "attacker", entity: { ...envelope.entity, ownerId: "attacker" } }));
  expect(response.status).toBe(200);
  expect((await response.json()).data).toEqual({ accepted: true, duplicate: false });
  expect(mocks.rpc).toHaveBeenCalledWith("receive_support_inquiry", {
    p_channel_id: "channel-1", p_user_id: "user-1", p_chat_id: "chat-1", p_message_id: "message-1",
    p_question: envelope.entity.plainText, p_truncated: false, p_created_at: new Date(now).toISOString(), p_mock: true,
  });
});
it("ignores manager replies and updates without DB access, but rejects malformed user events", async () => {
  for (const body of [{ ...envelope, event: "update" }, { ...envelope, entity: { ...envelope.entity, personType: "manager" } }]) {
    expect((await (await POST(request(undefined, body))).json()).data).toEqual({ accepted: true, ignored: true });
  }
  expect((await POST(request(undefined, { ...envelope, entity: {} }))).status).toBe(400);
  expect(mocks.worker).not.toHaveBeenCalled();
});
it("rejects foreign channels and stale timestamps before persistence", () => {
  for (const entity of [{ ...envelope.entity, channelId: "other" }, { ...envelope.entity, createdAt: now + 300001 },
    { ...envelope.entity, createdAt: now - 30 * 86400000 - 1 }]) {
    expect(() => channelInquiry({ ...envelope, entity }, "channel-1", now)).toThrow();
  }
});
it("preserves Unicode within 2000 characters and escalates oversize or unsupported text", () => {
  const parse = (plainText: string) => channelInquiry({ ...envelope, entity: { ...envelope.entity, plainText } }, "channel-1", now);
  expect(parse("🖼".repeat(2000))).toMatchObject({ question: "🖼".repeat(2000), truncated: false });
  expect(parse("🖼".repeat(2001))).toMatchObject({ question: "🖼".repeat(2000), truncated: true });
  expect(parse("text\0hidden")).toMatchObject({ question: null, truncated: true });
  expect(parse("  ")).toMatchObject({ question: null, truncated: false });
});
it("persists unsupported inquiry with SQL-normalized empty question for escalation", async () => {
  expect((await POST(request(undefined, { ...envelope, entity: { ...envelope.entity, plainText: "" } }))).status).toBe(200);
  expect(mocks.rpc).toHaveBeenCalledWith("receive_support_inquiry", expect.objectContaining({ p_question: "", p_truncated: false }));
});
it("only acknowledges a valid durable receipt and maps duplicate conflicts separately", async () => {
  for (const [result, status] of [
    [{ data: null, error: null }, 503],
    [{ data: null, error: { code: "P1005" } }, 409],
    [{ data: null, error: { code: "22023" } }, 400],
    [{ data: null, error: { code: "unavailable", message: "secret" } }, 503],
  ] as const) {
    mocks.abortSignal.mockResolvedValueOnce(result);
    const response = await POST(request());
    expect(response.status).toBe(status);
    expect(await response.text()).not.toContain("secret");
  }
});
