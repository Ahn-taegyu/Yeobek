import { afterEach, describe, expect, it, vi } from "vitest";
import { executeExpectedQa, type ExpectedQaContext, type ExpectedQaStore } from "@/lib/ai/expected-qa";
import type { ExpectedQaJob } from "@/lib/contracts/qa";
import type { AiTextRequest, AiTextResponse } from "@/lib/ai/providers/types";
import { ids } from "../fixtures/ai";

vi.mock("server-only", () => ({}));
const now = "2026-11-14T04:00:00Z";
const entry = { question: "어떤 재료로 만들었나요?", answer: "종이와 수채 물감으로 만들었습니다.", citations: [ids.evidence] };

function setup(scope: ExpectedQaJob["scope"] = "artwork") {
  const job: ExpectedQaJob = { id: ids.publication, kind: "expected_qa", scope, exhibitionId: ids.exhibition,
    artworkId: scope === "artwork" ? ids.artwork : null, documentId: ids.other, requestId: ids.request, mock: false,
    expectedRevision: 2, expectedDocumentRevision: 3, attempt: 1, status: "running", routing: "none", resultCode: null,
    result: null, createdAt: now, updatedAt: now, expiresAt: now };
  const context: ExpectedQaContext & { maxItems: number } = { ownerId: ids.owner, scope, exhibitionId: job.exhibitionId, artworkId: job.artworkId,
    documentId: job.documentId, revision: job.expectedRevision, documentRevision: job.expectedDocumentRevision,
    maxItems: scope === "artwork" ? 3 : 5,
    sources: [{ id: ids.evidence, version: 3, body: entry.answer, scope, sourceLabel: "private-artist-email@example.test" }] };
  const store = {
    reserve: vi.fn<ExpectedQaStore["reserve"]>(async () => ({ job, claimed: true, context })),
    complete: vi.fn<ExpectedQaStore["complete"]>(async (job, outcome) => outcome.status === "succeeded"
      ? { ...job, status: "succeeded", result: { itemIds: [ids.session], mock: job.mock } }
      : { ...job, status: outcome.status, resultCode: outcome.resultCode, routing: outcome.routing }),
  };
  const generate = vi.fn<(request: AiTextRequest) => Promise<AiTextResponse>>(async () => ({
    output: { items: [entry] }, trace: { provider: "openai", model: "unit", usage: { inputTokens: 10, outputTokens: 12 } },
  }));
  return { job, context, store, generate, run: (signal?: AbortSignal) => executeExpectedQa(ids.owner, store, { generate }, signal) };
}

afterEach(() => vi.useRealTimers());

describe("expected QA authoring", () => {
  it("generates once, passes only scoped evidence, and returns the persisted job", async () => {
    const { run, store, generate } = setup();
    await expect(run()).resolves.toMatchObject({ created: true, job: { status: "succeeded", result: { itemIds: [ids.session] } } });
    expect(generate).toHaveBeenCalledOnce();
    expect(generate.mock.calls[0][0].schema.definition).toMatchObject({ properties: { items: { items: {
      properties: { citations: { items: { type: "string", enum: [ids.evidence] } } },
    } } } });
    const input = JSON.parse(generate.mock.calls[0][0].input);
    expect(input).toEqual({ scope: "artwork", maxItems: 3,
      evidence: [{ id: ids.evidence, version: 3, scope: "artwork", body: entry.answer }] });
    expect(store.complete).toHaveBeenCalledWith(expect.objectContaining({ attempt: 1 }), expect.objectContaining({
      status: "succeeded", items: [entry], usage: [{ provider: "openai", model: "unit", usage: { inputTokens: 10, outputTokens: 12 } }],
    }));
  });

  it("abstains with no sources or no grounded items and does not replay a model call", async () => {
    const first = setup();
    first.context.sources = [];
    await expect(first.run()).resolves.toMatchObject({ job: { status: "abstained", resultCode: "EVIDENCE_REQUIRED" } });
    expect(first.generate).not.toHaveBeenCalled();
    first.store.reserve.mockResolvedValueOnce({ job: first.job, claimed: false, context: null });
    await expect(first.run()).resolves.toMatchObject({ created: false });
    expect(first.store.complete).toHaveBeenCalledOnce();
    const second = setup();
    second.generate.mockResolvedValue({ output: { items: [] }, trace: { provider: "openai", model: "unit" } });
    await expect(second.run()).resolves.toMatchObject({ job: { status: "abstained" } });
  });

  it("enforces scope-specific ceilings and rejects duplicate questions and invalid citations", async () => {
    const items = Array.from({ length: 5 }, (_, index) => ({ ...entry, question: `질문 ${index}` }));
    for (const [scope, output, status] of [
      ["artwork", items.slice(0, 4), "failed"], ["exhibition", items, "succeeded"],
      ["exhibition", [...items, entry], "failed"],
      ["artwork", [entry, { ...entry, question: "어떤   재료로 만들었나요！" }], "failed"],
      ["artwork", [{ ...entry, citations: [ids.other] }], "failed"],
      ["artwork", [{ ...entry, citations: [ids.evidence, ids.evidence] }], "failed"],
    ] as const) {
      const s = setup(scope);
      s.generate.mockResolvedValueOnce({ output: { items: output }, trace: { provider: "openai", model: "unit" } });
      await expect(s.run()).resolves.toMatchObject({ job: { status } });
    }
  });

  it("uses the lower cap captured at reservation for both the prompt and validation", async () => {
    const s = setup();
    s.context.maxItems = 1;
    s.generate.mockResolvedValueOnce({
      output: { items: [entry, { ...entry, question: "어떤 색인가요?" }] }, trace: { provider: "openai", model: "unit" },
    });
    await expect(s.run()).resolves.toMatchObject({ job: { status: "failed", resultCode: "AI_INVALID_OUTPUT" } });
    expect(JSON.parse(s.generate.mock.calls[0][0].input)).toMatchObject({ maxItems: 1 });
    expect(s.store.complete.mock.calls[0][1]).not.toHaveProperty("items");

    s.context.maxItems = 4;
    const priorCalls = s.generate.mock.calls.length;
    await expect(s.run()).resolves.toMatchObject({ job: { status: "failed", resultCode: "AI_INVALID_CONTEXT" } });
    expect(s.generate).toHaveBeenCalledTimes(priorCalls);
  });

  it("refuses a foreign/stale context and artwork evidence in exhibition scope before generation", async () => {
    for (const alter of [
      (context: ExpectedQaContext) => { context.ownerId = ids.other; },
      (context: ExpectedQaContext) => { context.documentRevision++; },
      (context: ExpectedQaContext) => { context.sources[0].scope = "artwork"; },
    ]) {
      const s = setup("exhibition");
      alter(s.context);
      await expect(s.run()).resolves.toMatchObject({ job: { status: "failed", resultCode: "AI_INVALID_CONTEXT" } });
      expect(s.generate).not.toHaveBeenCalled();
    }
  });

  it("settles a timed-out attempt without saving later provider output", async () => {
    vi.useFakeTimers();
    const s = setup();
    s.generate.mockImplementation(async () => {
      await new Promise(resolve => setTimeout(resolve, 31_000));
      return { output: { items: [entry] }, trace: { provider: "openai", model: "unit" } };
    });
    const pending = s.run();
    await vi.advanceTimersByTimeAsync(31_000);
    await expect(pending).resolves.toMatchObject({ job: { status: "failed", resultCode: "REQUEST_TIMEOUT" } });
    expect(s.store.complete).toHaveBeenCalledOnce();
    expect(s.store.complete.mock.calls[0][1]).not.toHaveProperty("items");
  });
});
