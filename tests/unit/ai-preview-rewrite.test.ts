import { describe, expect, it, vi } from "vitest";
import { executePreview, type PreviewStore } from "@/lib/ai/preview";
import { executeQaRewrite, type QaRewriteStore } from "@/lib/ai/qa-rewrite";
import { AiError } from "@/lib/ai/errors";
import type { ExpectedQaContext } from "@/lib/ai/expected-qa";
import { qaCorrectionEvidenceSchema, qaRewriteSchema, type PreviewAnswer, type QaRewriteJob } from "@/lib/contracts/qa";
import type { AiTextRequest, AiTextResponse } from "@/lib/ai/providers/types";
import { ids } from "../fixtures/ai";

vi.mock("server-only", () => ({}));
const now = "2026-11-14T04:00:00Z";
const question = "어떤 재료인가요?";
const answer = "종이와 수채 물감입니다.";
const instruction = "운석으로 만들었다고 설명해 주세요.";
const previousAnswer = "재료를 모르겠습니다.";
const source = { id: ids.evidence, version: 2, scope: "artwork" as const, body: answer, sourceLabel: "작가 실명 표시" };
const context: ExpectedQaContext = { ownerId: ids.owner, scope: "artwork", exhibitionId: ids.exhibition,
  artworkId: ids.artwork, documentId: ids.other, revision: 1, documentRevision: 2, sources: [source] };
const base = { id: ids.publication, scope: context.scope, exhibitionId: ids.exhibition, artworkId: ids.artwork,
  documentId: ids.other, requestId: ids.request, expectedRevision: 1, expectedDocumentRevision: 2, mock: false,
  attempt: 1, status: "running" as const, routing: "none" as const, resultCode: null, result: null,
  createdAt: now, updatedAt: now, expiresAt: now };
const previewJob: PreviewAnswer = { ...base, kind: "preview_answer", question };
const rewriteJob: QaRewriteJob = { ...base, kind: "qa_rewrite", targetKind: "preview", targetId: ids.session, targetVersion: null };
const generated = (output: unknown): AiTextResponse => ({ output, trace: { provider: "openai", model: "fake-draft" } });
const candidate = { answer, citations: [ids.evidence], outcome: "answered" };

function previewSetup() {
  const store = {
    reserve: vi.fn<PreviewStore["reserve"]>(async () => ({ job: previewJob, claimed: true, context: structuredClone(context) })),
    complete: vi.fn<PreviewStore["complete"]>(async (job, result) => result.status === "succeeded"
      ? { ...job, status: "succeeded", result: { answer: result.answer, citations: result.citations, mock: result.mock } }
      : { ...job, status: result.status, resultCode: result.resultCode }),
  };
  const generate = vi.fn<(input: AiTextRequest) => Promise<AiTextResponse>>(async () => generated(candidate));
  return { store, generate, run: (signal?: AbortSignal) => executePreview(ids.owner, store, { generate }, signal) };
}

function rewriteSetup() {
  const store = {
    reserve: vi.fn<QaRewriteStore["reserve"]>(async () => ({ job: rewriteJob, claimed: true,
      context: { ...structuredClone(context), question, previousAnswer, instruction } })),
    complete: vi.fn<QaRewriteStore["complete"]>(async (job, result) => result.status === "succeeded"
      ? { ...job, status: "succeeded", result: { itemIds: [ids.session], mock: result.mock } }
      : { ...job, status: result.status, resultCode: result.resultCode }),
  };
  const generate = vi.fn<(input: AiTextRequest) => Promise<AiTextResponse>>(async () => generated(candidate));
  const judge = vi.fn<(input: AiTextRequest) => Promise<AiTextResponse>>(async () => ({ output: { grounded: true },
    trace: { provider: "liner", model: "fake-judge" } }));
  return { store, generate, judge, run: (signal?: AbortSignal) => executeQaRewrite(ids.owner, store, { generate }, { generate: judge }, signal) };
}

describe("private artist answer preview", () => {
  it("uses the reserved question and private evidence once with no identity metadata or visitor persistence", async () => {
    const s = previewSetup();
    const result = await s.run();
    expect(result).toMatchObject({ created: true, job: { kind: "preview_answer", status: "succeeded", result: { answer } } });
    expect(s.generate).toHaveBeenCalledOnce();
    expect(JSON.parse(s.generate.mock.calls[0][0].input)).toEqual({ question, scope: "artwork",
      evidence: [{ id: source.id, version: source.version, body: source.body, scope: source.scope }] });
    s.store.reserve.mockResolvedValueOnce({ job: result.job, context: null, claimed: false });
    await expect(s.run()).resolves.toMatchObject({ created: false });
    expect(s.generate).toHaveBeenCalledOnce();
    expect(s.store.complete).toHaveBeenCalledOnce();
  });

  it("never persists model prose for missing evidence or bad pins", async () => {
    for (const output of [{ answer, citations: [], outcome: "insufficient_evidence" }, { ...candidate, citations: [ids.other] }]) {
      const s = previewSetup();
      s.generate.mockResolvedValueOnce(generated(output));
      const { job } = await s.run();
      expect(job.result).toBeNull();
      expect(s.store.complete.mock.calls[0][1]).not.toHaveProperty("answer");
    }
  });
});

describe("artist QA rewrite", () => {
  it("accepts preview and exact QA versions as targets while rejecting visitor gaps", () => {
    const target = { targetId: ids.session, requestId: ids.request };
    for (const [targetKind, targetVersion, accepted] of [["preview", null, true], ["qa", 1, true], ["gap", null, false]] as const) {
      const input = { ...target, targetKind, targetVersion };
      expect(qaRewriteSchema.safeParse({ ...input, instruction, evidencePins: [{ id: ids.evidence, version: 2 }] }).success).toBe(accepted);
      expect(qaCorrectionEvidenceSchema.safeParse({ ...input, sourceLabel: "작가 자료", sourceBody: answer }).success).toBe(accepted);
    }
  });

  it("uses one generator and one judge and records only a draft with the fixed question", async () => {
    const s = rewriteSetup();
    await expect(s.run()).resolves.toMatchObject({ job: { status: "succeeded", result: { itemIds: [ids.session] } } });
    expect(s.generate).toHaveBeenCalledOnce();
    expect(s.judge).toHaveBeenCalledOnce();
    const generation = JSON.parse(s.generate.mock.calls[0][0].input);
    const evaluation = JSON.parse(s.judge.mock.calls[0][0].input);
    expect(generation).toMatchObject({ question, previousAnswer, instruction });
    expect(evaluation).toEqual({ question, candidate: { question, answer, citations: [ids.evidence] }, evidence: generation.evidence });
    expect(s.store.complete).toHaveBeenCalledWith(expect.objectContaining({ attempt: 1 }), expect.objectContaining({
      status: "succeeded", items: [{ question, answer, citations: [ids.evidence] }],
    }));
  });

  it("rejects unsupported rewrites and malformed reviews without creating a candidate", async () => {
    for (const output of [{ grounded: false }, { grounded: true, explanation: "unsupported extra field" }]) {
      const s = rewriteSetup();
      s.generate.mockResolvedValueOnce(generated({ ...candidate, answer: "운석으로 만들었습니다." }));
      s.judge.mockResolvedValueOnce({ output, trace: { provider: "liner", model: "fake-judge" } });
      await expect(s.run()).resolves.toMatchObject({ job: { status: output.grounded ? "failed" : "abstained", result: null } });
      expect(s.store.complete.mock.calls[0][1]).not.toHaveProperty("items");
    }
  });

  it("budgets reasoning plus verdict and keeps truncated evaluations closed without retry", async () => {
    const s = rewriteSetup();
    s.judge.mockImplementationOnce(async request => {
      expect(request.maxOutputTokens).toBeGreaterThanOrEqual(2048);
      expect(request.maxOutputTokens).toBeLessThanOrEqual(4096);
      expect(request.schema.definition).toMatchObject({ required: ["grounded"], additionalProperties: false });
      throw new AiError("incomplete");
    });
    await expect(s.run()).resolves.toMatchObject({ job: { status: "failed", resultCode: "AI_GENERATION_FAILED", result: null } });
    expect(s.judge).toHaveBeenCalledOnce();
    expect(s.store.complete.mock.calls[0][1]).not.toHaveProperty("items");
  });

  it("settles cancellation after reservation even when provider ignores the signal", async () => {
    const s = rewriteSetup();
    const controller = new AbortController();
    s.generate.mockImplementationOnce(async () => {
      controller.abort();
      return generated(candidate);
    });
    await expect(s.run(controller.signal)).resolves.toMatchObject({ job: { status: "cancelled", result: null } });
    expect(s.judge).not.toHaveBeenCalled();
    expect(s.store.complete).toHaveBeenCalledOnce();
  });
});
