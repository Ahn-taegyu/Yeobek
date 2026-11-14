import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { AiError } from "@/lib/ai/errors";
import { capabilitiesFor } from "@/lib/ai/plugin";
import type { AiTextProvider } from "@/lib/ai/providers/types";
import { runNotification } from "@/lib/automation/notification";
import { ids } from "../fixtures/ai";

const eventId = ids.request;
const context = {
  eventId,
  trigger: "published",
  sourceRevision: 2,
  exhibitionId: ids.exhibition,
  exhibitionRevision: 3,
  exhibitionState: "published",
  artworkCount: 4,
  approvedCount: 3,
  publishedCount: 2,
};
const draft = { paragraph: "작품 두 점이 공개되었습니다.", citations: ["status:published:2"], outcome: "ready" };
const trace = { provider: "liner" as const, model: "fake", usage: { totalTokens: 20 } };
const steps = ["status.read", "model.generate", "output.validate", "status.recheck"];
const request = () => ({
  text: { generate: vi.fn<AiTextProvider["generate"]>().mockResolvedValue({ output: draft, trace }) },
  readContext: vi.fn<() => Promise<unknown>>().mockResolvedValue(context),
});

afterEach(() => vi.useRealTimers());

describe("operator notification playbook", () => {
  it.each(["exhibition_created", "draft_ready", "published"] as const)(
    "uses only status values for %s and wraps the text in the fixed mail template", async trigger => {
      const deps = request();
      const statusId = `status:${trigger}:2`;
      deps.readContext.mockResolvedValue({ ...context, trigger });
      const paragraph = {
        exhibition_created: "전시가 등록되었습니다.",
        draft_ready: "검토할 해설 초안이 준비되었습니다.",
        published: "작품 두 점이 공개되었습니다.",
      }[trigger];
      deps.text.generate.mockResolvedValue({ output: { ...draft, paragraph, citations: [statusId] }, trace });

      const result = await runNotification(eventId, deps);
      expect(result).toMatchObject({
        state: "processed", resultCode: "NOTIFICATION_READY", outbound: {
          channel: "mail", category: "transactional",
          body: `안녕하세요. 여백입니다.\n\n${paragraph}\n\n자세한 진행 상태는 여백의 작가 화면에서 확인해 주세요.`,
        }, usage: [trace], steps: steps.map(id => ({ id, status: "done" })), elapsedMs: expect.any(Number),
      });
      expect(deps.readContext).toHaveBeenCalledTimes(2);
      expect(deps.text.generate).toHaveBeenCalledOnce();
      const [call] = deps.text.generate.mock.calls[0];
      expect(call.schema.name).toBe("yeobek_ops_notification");
      expect(call.maxOutputTokens).toBe(1000);
      expect(JSON.parse(call.input)).toEqual({ statusId, trigger, exhibitionState: "published",
        artworkCount: 4, approvedCount: 3, publishedCount: 2 });
      expect(call.input).not.toContain(eventId);
      expect(call.input).not.toContain(context.exhibitionId);
    },
  );

  it("exposes exactly the status read capability", () => {
    const read = vi.fn();
    const capability = capabilitiesFor("ops-notify", { status: { read } });
    expect(Object.keys(capability)).toEqual(["status.read"]);
    // @ts-expect-error Operator notifications cannot write or send.
    expect(capability["job.complete"]).toBeUndefined();
  });

  it.each([
    { title: "private work" },
    { email: "private@example.invalid" },
    { text: "private source" },
    { question: "private visitor question" },
    { eventId: ids.other },
    { publishedCount: 5 },
    { trigger: "exhibition_ended" },
  ])("rejects unsafe or invalid context %o before calling a model", async change => {
    const deps = request();
    deps.readContext.mockResolvedValue({ ...context, ...change });
    expect(await runNotification(eventId, deps)).toMatchObject({
      state: "failed", resultCode: "AI_INVALID_OUTPUT", outbound: null, usage: [],
      steps: steps.map((id, index) => ({ id, status: index === 0 ? "failed" : "skipped" })),
    });
    expect(deps.text.generate).not.toHaveBeenCalled();
    expect(deps.readContext).toHaveBeenCalledOnce();
  });

  it("skips a missing context and suppresses after a stale reread", async () => {
    const deps = request();
    deps.readContext.mockResolvedValueOnce(null);
    expect(await runNotification(eventId, deps)).toMatchObject({
      state: "suppressed", resultCode: "STALE_CONTEXT", outbound: null, usage: [],
      steps: [{ id: "status.read", status: "done" }, ...steps.slice(1).map(id => ({ id, status: "skipped", reason: "stale_context" }))],
    });
    expect(deps.text.generate).not.toHaveBeenCalled();
    deps.readContext.mockResolvedValueOnce(context).mockResolvedValueOnce({ ...context, artworkCount: 5 });
    expect(await runNotification(eventId, deps)).toMatchObject({
      state: "suppressed", resultCode: "STALE_CONTEXT", outbound: null, usage: [trace],
      steps: steps.map(id => ({ id, status: "done" })),
    });
    expect(deps.text.generate).toHaveBeenCalledOnce();
  });

  it.each([
    { citations: ["status:published:3"] },
    { citations: [] },
    { citations: ["status:published:2", "status:published:2"] },
    { paragraph: "자료\u0000 확인" },
    { paragraph: "자료를 확인해 주세요. https://example.invalid" },
    { paragraph: "자료를 확인해 주세요. 예시.한국" },
    { paragraph: "연락 address@example.invalid" },
    { paragraph: "자료를 확인해 주세요. <strong>진행 안내</strong>" },
    { paragraph: "진행 안내 " + ids.exhibition },
    { paragraph: "진행 안내 STATUS:published:2" },
    { paragraph: "가".repeat(601) },
    { paragraph: "" },
    { outcome: "escalate", citations: [] },
    { extra: "제외할 출력" },
  ])("blocks invalid provider output %o and preserves usage", async change => {
    const deps = request();
    deps.text.generate.mockResolvedValue({ output: { ...draft, ...change }, trace });
    expect(await runNotification(eventId, deps)).toMatchObject({
      state: "failed", resultCode: "AI_INVALID_OUTPUT", outbound: null, usage: [trace],
      steps: [{ id: steps[0], status: "done" }, { id: steps[1], status: "done" },
        { id: steps[2], status: "failed" }, { id: steps[3], status: "skipped", reason: "previous_step_failed" }],
    });
    expect(deps.text.generate).toHaveBeenCalledOnce();
    expect(deps.readContext).toHaveBeenCalledOnce();
  });

  it("escalates without exposing model-written copy", async () => {
    const deps = request();
    deps.text.generate.mockResolvedValue({ output: { paragraph: "", citations: [], outcome: "escalate" }, trace });
    expect(await runNotification(eventId, deps)).toMatchObject({
      state: "escalated", resultCode: "MODEL_ESCALATED", outbound: null, usage: [trace],
      steps: steps.map(id => ({ id, status: "done" })),
    });
  });

  it("normalizes provider errors without a retry", async () => {
    const deps = request();
    deps.text.generate.mockRejectedValue(new AiError("rate_limited"));
    expect(await runNotification(eventId, deps)).toMatchObject({
      state: "failed", resultCode: "RATE_LIMITED", outbound: null, usage: [],
      steps: [{ id: steps[0], status: "done" }, { id: steps[1], status: "failed" },
        ...steps.slice(2).map(id => ({ id, status: "skipped" }))],
    });
    expect(deps.text.generate).toHaveBeenCalledOnce();
  });

  it("does not read a cancelled or invalid request", async () => {
    const deps = request();
    expect(await runNotification(eventId, deps, AbortSignal.abort("private caller detail")))
      .toMatchObject({ state: "failed", resultCode: "REQUEST_CANCELLED", outbound: null });
    expect(await runNotification("invalid", deps))
      .toMatchObject({ state: "failed", resultCode: "INVALID_INPUT", outbound: null });
    expect(deps.readContext).not.toHaveBeenCalled();
    expect(deps.text.generate).not.toHaveBeenCalled();
  });

  it("bounds an unresponsive provider and does not retry", async () => {
    vi.useFakeTimers();
    const deps = request();
    deps.text.generate.mockImplementation(() => new Promise(() => {}));
    const result = runNotification(eventId, deps);
    await vi.advanceTimersByTimeAsync(30_000);
    expect(await result).toMatchObject({
      state: "failed", resultCode: "REQUEST_TIMEOUT", outbound: null,
      steps: [{ id: steps[0], status: "done" }, { id: steps[1], status: "failed" },
        ...steps.slice(2).map(id => ({ id, status: "skipped" }))],
    });
    expect(deps.text.generate).toHaveBeenCalledOnce();
  });

  it("cancels a stalled recheck without retaining a late notification", async () => {
    const controller = new AbortController();
    const deps = request();
    let finishRead!: (value: unknown) => void;
    deps.readContext.mockResolvedValueOnce(context).mockImplementationOnce(() => new Promise(resolve => { finishRead = resolve; }));
    const result = runNotification(eventId, deps, controller.signal);
    await vi.waitFor(() => expect(deps.readContext).toHaveBeenCalledTimes(2));
    controller.abort("private caller detail");
    expect(await result).toMatchObject({
      state: "failed", resultCode: "REQUEST_CANCELLED", usage: [trace], outbound: null,
      steps: [...steps.slice(0, 3).map(id => ({ id, status: "done" })), { id: steps[3], status: "failed" }],
    });
    finishRead(context);
    expect(deps.text.generate).toHaveBeenCalledOnce();
  });
});
