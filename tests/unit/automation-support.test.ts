import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { capabilitiesFor } from "@/lib/ai/plugin";
import type { AiTextProvider } from "@/lib/ai/providers/types";
import { runSupportReply } from "@/lib/automation/support";
import { ids } from "../fixtures/ai";

const context = {
  eventId: ids.request,
  question: "작품을 어떻게 등록하나요?",
  evidence: [
    { id: "help-register", kind: "help", body: "전시 관리 화면에서 작품을 등록할 수 있습니다." },
    { id: "status-public", kind: "status", body: "전시가 게시되었습니다." },
  ],
  revision: "ab".repeat(32),
};
const draft = { answer: "전시 관리 화면에서 작품을 등록해 주세요.", citations: ["help-register"], category: "usage" };
const trace = { provider: "liner" as const, model: "fake", usage: { totalTokens: 20 } };
const steps = ["support.read", "evidence.select", "model.generate", "output.validate", "support.recheck"];
const request = () => ({
  text: { generate: vi.fn<AiTextProvider["generate"]>().mockResolvedValue({ output: draft, trace }) },
  readContext: vi.fn<() => Promise<unknown>>().mockResolvedValue(context),
});

afterEach(() => vi.useRealTimers());

describe("operator support reply playbook", () => {
  it("exposes only the scoped read capability", () => {
    expect(Object.keys(capabilitiesFor("ops-support-reply", { support: { read: vi.fn() } })))
      .toEqual(["support.read"]);
  });

  it.each([draft, { answer: "전시가 게시되었습니다.", citations: ["status-public"], category: "status" }])(
    "generates one grounded $category draft using only the question and evidence", async output => {
      const deps = request();
      deps.text.generate.mockResolvedValue({ output, trace });
      expect(await runSupportReply(context.eventId, deps)).toMatchObject({
        state: "processed", resultCode: "SUPPORT_REPLY_READY", usage: [trace],
        steps: steps.map(id => ({ id, status: "done" })),
        elapsedMs: expect.any(Number),
      });
      expect(deps.text.generate).toHaveBeenCalledOnce();
      expect(deps.readContext).toHaveBeenCalledTimes(2);
      const [call] = deps.text.generate.mock.calls[0];
      expect(JSON.parse(call.input)).toEqual({ question: context.question, evidence: context.evidence });
    },
  );

  it("emits only the reply channel, category and body", async () => {
    const result = await runSupportReply(context.eventId, request());
    expect(result.outbound).toEqual({ channel: "support", category: "usage", body: draft.answer });
  });

  it.each([
    ["NO_EVIDENCE", { evidence: [] }],
    ["SENSITIVE_QUESTION", { question: "ＲＥＦＵＮＤ 부탁드립니다." }],
    ["SENSITIVE_QUESTION", { question: "작품 삭\u200b제해 주세요." }],
    ["SENSITIVE_QUESTION", { question: "저작권 이용을 요청합니다." }],
  ] as const)("escalates %s without calling a model", async (resultCode, patch) => {
    const deps = request();
    deps.readContext.mockResolvedValue({ ...context, ...patch });
    expect(await runSupportReply(context.eventId, deps)).toMatchObject({
      state: "escalated", resultCode, outbound: null, usage: [],
    });
    expect(deps.text.generate).not.toHaveBeenCalled();
  });

  it.each([
    { channelId: "external-binding" },
    { eventId: ids.other },
    { revision: "other" },
    { question: "가".repeat(2001) },
    { evidence: Array.from({ length: 2 }, (_, i) => ({ id: String(i), kind: "help", body: "가".repeat(4001) })) },
    { evidence: [{ ...context.evidence[0], userId: ids.other }] },
  ])("fails closed on invalid scoped context", async patch => {
    const deps = request();
    deps.readContext.mockResolvedValue({ ...context, ...patch });
    expect(await runSupportReply(context.eventId, deps)).toMatchObject({
      state: "failed", resultCode: "AI_INVALID_OUTPUT", outbound: null, usage: [],
    });
    expect(deps.text.generate).not.toHaveBeenCalled();
  });

  it.each([
    { recipient: "forged" },
    { citations: [] },
    { citations: ["help-register", "help-register"] },
    { citations: ["help-register", "unknown"] },
    { category: "status" },
    { category: "escalate", answer: "", citations: ["help-register"] },
    { answer: "링크는 https://example.invalid 입니다." },
    { answer: "메일은 person@example.invalid 입니다." },
    { answer: "<p>작품을 등록해 주세요.</p>" },
    { answer: "작품을 등록해 주세요.\u0000" },
    { answer: "근거는 HELP-REGISTER 입니다." },
    { answer: `내부 식별자는 ${ids.request}입니다.` },
  ])("retains charged usage and fails closed on invalid output", async patch => {
    const deps = request();
    deps.text.generate.mockResolvedValue({ output: { ...draft, ...patch }, trace });
    expect(await runSupportReply(context.eventId, deps)).toMatchObject({
      state: "failed", resultCode: "AI_INVALID_OUTPUT", outbound: null, usage: [trace],
    });
    expect(deps.text.generate).toHaveBeenCalledOnce();
    expect(deps.readContext).toHaveBeenCalledOnce();
  });

  it("returns a validated model escalation with no outbound response", async () => {
    const deps = request();
    deps.text.generate.mockResolvedValue({ output: { answer: "", citations: [], category: "escalate" }, trace });
    expect(await runSupportReply(context.eventId, deps)).toMatchObject({
      state: "escalated", resultCode: "MODEL_ESCALATED", outbound: null, usage: [trace],
    });
  });

  it("suppresses a missing binding without calling the model", async () => {
    const deps = request();
    deps.readContext.mockResolvedValueOnce(null);
    expect(await runSupportReply(context.eventId, deps)).toMatchObject({
      state: "suppressed", resultCode: "STALE_CONTEXT", outbound: null, usage: [],
    });
    expect(deps.text.generate).not.toHaveBeenCalled();
  });

  it.each([
    null,
    { ...context, revision: "cd".repeat(32) },
    { ...context, question: "공개했나요?" },
    { ...context, evidence: [{ ...context.evidence[0], body: "변경된 근거입니다." }] },
  ])("suppresses a reply when the rechecked context has changed", async latest => {
    const deps = request();
    deps.readContext.mockResolvedValueOnce(context).mockResolvedValueOnce(latest);
    expect(await runSupportReply(context.eventId, deps)).toMatchObject({
      state: "suppressed", resultCode: "STALE_CONTEXT", outbound: null, usage: [trace],
    });
  });

  it("accepts equivalent context objects with reordered keys", async () => {
    const deps = request();
    deps.readContext.mockResolvedValueOnce(context).mockResolvedValueOnce({
      revision: context.revision,
      evidence: context.evidence.map(({ body, kind, id }) => ({ body, kind, id })),
      question: context.question,
      eventId: context.eventId,
    });
    expect(await runSupportReply(context.eventId, deps)).toMatchObject({ state: "processed" });
  });

  it("times out one generation attempt and skips the reread", async () => {
    vi.useFakeTimers();
    const deps = request();
    deps.text.generate.mockImplementation(() => new Promise(() => undefined));
    const result = runSupportReply(context.eventId, deps);
    await vi.advanceTimersByTimeAsync(30_000);
    expect(await result).toMatchObject({ state: "failed", resultCode: "REQUEST_TIMEOUT", outbound: null });
    expect(deps.text.generate).toHaveBeenCalledOnce();
    expect(deps.readContext).toHaveBeenCalledOnce();
  });
});
