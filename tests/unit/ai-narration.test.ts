import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import type { ArtistKnowledgeContext } from "../../src/lib/ai/artist-knowledge";
import { ApiError } from "../../src/lib/api/errors";
import { AiError } from "../../src/lib/ai/errors";
import { createNarrationHarness, NARRATION_LIMITS, type JudgeEvaluation } from "../../src/lib/ai/narration";
import * as playbook from "../../src/lib/ai/playbook";
import type { AiTextRequest, AiTextResponse } from "../../src/lib/ai/providers/types";
import { ids } from "../fixtures/ai";

const request = { documentId: ids.artwork, expectedRevision: 2, strategy: "best_of_two" } as const;
const overview = { answer: "종이 위에 수채 물감으로 그린 파란 달입니다.", citations: [ids.evidence], outcome: "answered" };
const focused = { answer: "수채 물감의 파란색으로 달을 표현했습니다.", citations: [ids.evidence], outcome: "answered" };
const response = (output: unknown, model = "fake-generator"): AiTextResponse =>
  ({ output, trace: { provider: "openai", model, usage: { inputTokens: 30, outputTokens: 20 } } });
const passing = (candidateId: string): JudgeEvaluation =>
  ({ candidateId, grounding: 4, relevance: 4, tone: 4, concision: 3, unsupportedIntent: false, confidentialityLeak: false });
const readCandidates = (call: AiTextRequest): { candidateId: string; answer: string; citations: string[] }[] => JSON.parse(call.input).candidates;
const assessment = (call: AiTextRequest, score: (candidateId: string) => JudgeEvaluation = passing) =>
  response({ evaluations: readCandidates(call).map(({ candidateId }) => score(candidateId)) }, "fake-judge");
const draftSteps = ["request.validate", "author.read", "evidence.select", "candidate.rounds", "author.recheck.final", "output.validate"];
const reserveSkipped = { id: "job.reserve", status: "skipped", reason: "job_unbound" };
const completeSkipped = { id: "job.complete", status: "skipped", reason: "job_unbound" };
function withUnboundJobs(steps: { id: string; status: string; reason?: string }[]) {
  return [steps[0], reserveSkipped, ...steps.slice(1), completeSkipped];
}
const evaluationSteps = ["author.recheck", "model.evaluate", "output.validate", "candidate.rank"];

function setup(actorId = ids.owner, options?: Pick<Parameters<typeof createNarrationHarness>[1], "jobs" | "followUpQuestions">) {
  const context: ArtistKnowledgeContext = {
    documentId: ids.artwork, ownerId: ids.owner, artistId: ids.owner,
    subjectId: ids.artwork, subjectType: "artwork", exhibitionId: ids.exhibition, revision: 2,
    sections: [{ id: "description", body: "가상 작품 파란 달입니다." }],
    sourceRefs: [{ kind: "direct", sectionId: "description" }],
    sources: [{
      id: ids.evidence, ownerId: ids.owner, artistId: ids.owner, subjectType: "artwork", subjectId: ids.artwork,
      exhibitionId: ids.exhibition, revision: 1, text: "이 작품의 재료는 종이와 수채 물감입니다. 파란색으로 달을 그렸습니다.",
      ref: { kind: "direct", sectionId: "description" },
    }],
  };
  const store = { loadOwnedContext: vi.fn<(actorId: string, documentId: string, signal?: AbortSignal) => Promise<unknown>>(
    async () => structuredClone(context),
  ) };
  const generator = { generate: vi.fn(async (call: AiTextRequest) =>
    response(JSON.parse(call.input).strategy === "overview" ? overview : focused)) };
  const judge = { generate: vi.fn(async (call: AiTextRequest) => assessment(call)) };
  return { context, store, generator, judge, harness: createNarrationHarness(actorId, { store, generator, judge, ...options }) };
}

afterEach(() => vi.useRealTimers());

describe("artist narration candidate selection", () => {
  it("does not dispatch the first store load when cancelled in the same turn", async () => {
    const s = setup(); const controller = new AbortController();
    const pending = s.harness.draft(request, controller.signal);
    controller.abort();
    expect(await pending).toMatchObject({ status: "abstained", reason: "cancelled",
      steps: withUnboundJobs([{ id: "request.validate", status: "done" },
        ...draftSteps.slice(1).map(id => ({ id, status: "skipped", reason: "cancelled" }))]) });
    expect(s.store.loadOwnedContext).not.toHaveBeenCalled();
    expect(s.generator.generate).not.toHaveBeenCalled();
  });
  it.each([600, 601, 2000])("accepts a %i-codepoint draft and reports the target warning separately", async length => {
    const s = setup();
    const draft = { ...overview, answer: "🌙".repeat(length) };
    s.generator.generate.mockResolvedValue(response(draft));
    const result = await s.harness.draft({ ...request, strategy: "single" });
    expect(result).toMatchObject({ status: "selected", selected: draft, overTarget: length > 600,
      steps: withUnboundJobs(draftSteps.map(id => ({ id, status: "done" }))),
      metrics: { evaluationSteps: [{ round: 1, steps: evaluationSteps.map(id => ({ id, status: "done" })) }] } });
    expect(s.generator.generate.mock.calls[0][0].schema.name).toBe("yeobek_narration_draft");
    expect(s.judge.generate).toHaveBeenCalledOnce();
  });
  it("starts both calls before either resolves and verifies the only returned draft against the original sources", async () => {
    const s = setup();
    const pending: ((value: AiTextResponse) => void)[] = [];
    s.generator.generate.mockImplementation(() => new Promise(resolve => pending.push(resolve)));
    const result = s.harness.draft(request);
    await vi.waitFor(() => expect(pending).toHaveLength(2));
    expect(s.judge.generate).not.toHaveBeenCalled();
    pending[1](response(focused));
    pending[0](response(overview));
    expect(await result).toMatchObject({
      status: "selected", selected: overview, selectedCandidateId: "r1-c1",
      metrics: { rounds: 1, reservedCalls: 3, reservedOutputTokens: 6200 },
    });
    expect(JSON.stringify(await result)).not.toContain(focused.answer);
    const [first, second] = s.generator.generate.mock.calls.map(([call]) => call);
    const judge = s.judge.generate.mock.calls[0][0];
    expect([first.maxOutputTokens, second.maxOutputTokens, judge.maxOutputTokens]).toEqual([1600, 1600, 3000]);
    expect(JSON.parse(first.input).sources).toEqual(JSON.parse(second.input).sources);
    expect(JSON.parse(judge.input).sources).toEqual(JSON.parse(first.input).sources);
    expect(judge.input).not.toContain("fake-generator");
    expect(judge.input).not.toContain(ids.owner);
    expect(s.store.loadOwnedContext).toHaveBeenCalledTimes(3);
    expect(s.store.loadOwnedContext).toHaveBeenCalledWith(ids.owner, ids.artwork, expect.any(AbortSignal));
  });

  it("uses the overview strategy and the same absolute judge floors for the single-call baseline", async () => {
    const s = setup();
    s.judge.generate.mockImplementation(async call => assessment(call, id => ({ ...passing(id), grounding: 3, tone: 5 })));
    const result = await s.harness.draft({ ...request, strategy: "single" });
    expect(result).toMatchObject({ status: "abstained", reason: "below_threshold",
      steps: withUnboundJobs([...draftSteps.slice(0, 4).map(id => ({ id, status: "done" })),
        ...draftSteps.slice(4).map(id => ({ id, status: "skipped", reason: "below_threshold" }))]),
      metrics: { rounds: 1, reservedCalls: 2, reservedOutputTokens: 4600,
        evaluationSteps: [{ round: 1, steps: evaluationSteps.map(id => ({ id, status: "done" })) }] } });
    expect(s.generator.generate).toHaveBeenCalledOnce();
    expect(JSON.parse(s.generator.generate.mock.calls[0][0].input).strategy).toBe("overview");
    expect(s.judge.generate).toHaveBeenCalledOnce();
  });

  it("filters candidate output locally before judging a valid sibling", async () => {
    const s = setup();
    s.generator.generate.mockResolvedValueOnce(response({ ...overview, citations: [ids.other] }));
    const result = await s.harness.draft(request);
    expect(result).toMatchObject({ status: "selected", selected: focused, selectedCandidateId: "r1-c2",
      metrics: { rounds: 1, calls: [{ status: "failed", errorCode: "invalid_candidate", trace: expect.any(Object) },
        { status: "success" }, { status: "success" }] } });
    expect(readCandidates(s.judge.generate.mock.calls[0][0]).map(({ candidateId }) => candidateId)).toEqual(["r1-c2"]);
  });

  it.each([
    { grounding: 3, relevance: 5, tone: 5, concision: 5 },
    { relevance: 3 }, { tone: 3 }, { concision: 2 },
    { unsupportedIntent: true }, { confidentialityLeak: true },
  ])("rejects a candidate failing any hard flag or absolute floor %j", async (failure) => {
    const s = setup();
    s.judge.generate.mockImplementation(async call => assessment(call, id => ({ ...passing(id), ...failure })));
    const result = await s.harness.draft({ ...request, strategy: "single" });
    expect(result).toMatchObject({ status: "abstained", reason: "below_threshold",
      metrics: { evaluations: [{ passed: false }] } });
  });

  it("selects by score only within the passing set", async () => {
    const s = setup();
    s.judge.generate.mockImplementation(async call => assessment(call, id => ({
      ...passing(id), ...(id === "r1-c1" ? { grounding: 5, relevance: 5, tone: 5, confidentialityLeak: true } : {}),
    })));
    expect(await s.harness.draft(request)).toMatchObject({
      status: "selected", selected: focused, selectedCandidateId: "r1-c2",
    });
  });

  it("allows one full additional round with bounded feedback and spends at most the reserved budget", async () => {
    const s = setup();
    s.judge.generate.mockImplementationOnce(async call => assessment(call, id => ({ ...passing(id), tone: 2, unsupportedIntent: true })));
    const result = await s.harness.draft(request);
    expect(result).toMatchObject({ status: "selected", selectedCandidateId: "r2-c1",
      steps: withUnboundJobs(draftSteps.map(id => ({ id, status: "done" }))),
      metrics: { rounds: 2, reservedCalls: 6, reservedOutputTokens: 12400,
        evaluationSteps: [1, 2].map(round => ({ round, steps: evaluationSteps.map(id => ({ id, status: "done" })) })) } });
    expect(result.metrics.calls).toHaveLength(6);
    expect(result.metrics.evaluations).toHaveLength(4);
    expect(s.store.loadOwnedContext).toHaveBeenCalledTimes(5);
    const requests = s.generator.generate.mock.calls.map(([call]) => JSON.parse(call.input));
    expect(requests.map(call => call.feedback)).toEqual([[], [], ["tone", "unsupported_intent"], ["tone", "unsupported_intent"]]);
    expect(requests.map(call => call.strategy)).toEqual(["overview", "focused", "overview", "focused"]);
    expect(JSON.stringify(requests[3])).not.toContain(focused.answer);
  });

  it("stops on round-two rejection and repairs local structural errors without paying for a judge over invalid candidates", async () => {
    const s = setup();
    s.generator.generate.mockResolvedValue(response({ ...overview, answer: "원".repeat(2001) }));
    const result = await s.harness.draft(request);
    expect(result).toMatchObject({ status: "abstained", reason: "invalid_candidate", metrics: { rounds: 2 } });
    expect(s.generator.generate).toHaveBeenCalledTimes(4);
    expect(JSON.parse(s.generator.generate.mock.calls[3][0].input).feedback).toEqual(["invalid_candidate"]);
    expect(s.judge.generate).not.toHaveBeenCalled();
  });

  it.each(["duplicate", "foreign", "missing", "fractional", "freeform"] as const)(
    "fails closed with %s judge output without regenerating", async kind => {
      const s = setup();
      const evaluations = [passing("r1-c1"), passing("r1-c2")];
      if (kind === "duplicate") evaluations[1].candidateId = evaluations[0].candidateId;
      if (kind === "foreign") evaluations[1].candidateId = "r2-c2";
      if (kind === "missing") evaluations.pop();
      if (kind === "fractional") evaluations[1].grounding = 4.5;
      if (kind === "freeform") Object.assign(evaluations[1], { notes: "그대로 게시" });
      s.judge.generate.mockResolvedValue(response({ evaluations }));
      const result = await s.harness.draft(request);
      expect(result).toMatchObject({ status: "abstained", reason: "judge_failed", metrics: { rounds: 1, evaluations: [],
        evaluationSteps: [{ round: 1, steps: [
          { id: "author.recheck", status: "done" }, { id: "model.evaluate", status: "done" },
          { id: "output.validate", status: "failed" }, { id: "candidate.rank", status: "skipped", reason: "previous_step_failed" },
        ] }] } });
      expect(result.metrics.calls[2]).toMatchObject({ status: "failed", errorCode: "invalid_evaluation" });
    },
  );

  it.each(["clarify", "insufficient_evidence"] as const)("does not repair a %s outcome", async outcome => {
    const s = setup();
    s.generator.generate.mockResolvedValue(response({ outcome, answer: "근거를 확인해 주세요.", citations: [] }));
    expect(await s.harness.draft(request)).toMatchObject({ status: "abstained", reason: outcome, metrics: { rounds: 1 } });
    expect(s.generator.generate).toHaveBeenCalledTimes(2);
    expect(s.judge.generate).not.toHaveBeenCalled();
  });

  it("does not regenerate after a confidentiality failure", async () => {
    const s = setup();
    s.judge.generate.mockImplementation(async call => assessment(call, id => ({ ...passing(id), confidentialityLeak: true })));
    expect(await s.harness.draft(request)).toMatchObject({ status: "abstained", reason: "below_threshold", metrics: { rounds: 1 } });
  });

  it("records request validation and skips every downstream step for an invalid request", async () => {
    const s = setup();
    expect(await s.harness.draft({ ...request, expectedRevision: 0 })).toMatchObject({
      status: "abstained", reason: "invalid_request",
      steps: [{ id: "request.validate", status: "done" },
        ...["job.reserve", ...draftSteps.slice(1), "job.complete"].map(id => ({ id, status: "skipped", reason: "invalid_request" }))],
      metrics: { evaluationSteps: [] },
    });
    expect(s.store.loadOwnedContext).not.toHaveBeenCalled();
  });

  it("propagates a playbook ordering failure from a nested evaluation", async () => {
    const s = setup();
    const error = new playbook.PlaybookOrderError("step_out_of_order");
    s.judge.generate.mockRejectedValue(error);
    await expect(s.harness.draft(request)).rejects.toBe(error);
    expect(s.store.loadOwnedContext).toHaveBeenCalledTimes(2);
  });

  it.each(["empty", "owner", "actor", "revision", "scope", "oversize", "wrong_subject"] as const)(
    "makes no AI calls for an initial %s context", async kind => {
      const s = setup(kind === "actor" ? "invalid-actor" : ids.owner);
      if (kind === "empty") s.context.sources = [];
      if (kind === "owner") s.context.ownerId = ids.other;
      if (kind === "revision") s.context.revision++;
      if (kind === "scope") s.context.sources[0].exhibitionId = ids.other;
      if (kind === "oversize") s.context.sources.push({ ...s.context.sources[0], id: ids.other, text: "원".repeat(5001) });
      if (kind === "wrong_subject") Object.assign(s.context, { subjectType: "artist", subjectId: ids.owner, exhibitionId: null,
        sections: [], sourceRefs: [], sources: [] });
      const expected = { empty: "insufficient_evidence", owner: "unavailable", actor: "invalid_request", revision: "stale_context",
        scope: "invalid_context", oversize: "invalid_context", wrong_subject: "invalid_context" };
      expect(await s.harness.draft(request)).toMatchObject({ status: "abstained", reason: expected[kind], metrics: { rounds: 0, calls: [] } });
      expect(s.generator.generate).not.toHaveBeenCalled();
      expect(s.judge.generate).not.toHaveBeenCalled();
    },
  );

  it.each(["source_text", "target_sections", "owner_revoked", "retry"] as const)(
    "withholds drafts and new rounds if %s changes during generation", async kind => {
      const s = setup();
      s.judge.generate.mockImplementationOnce(async call => {
        if (kind === "owner_revoked") s.store.loadOwnedContext.mockResolvedValue(null);
        if (kind === "target_sections") s.context.sections[0].body = "출처와 별도로 문서가 바뀌었습니다.";
        if (kind === "source_text" || kind === "retry") s.context.sources[0].text = "같은 revision이지만 출처가 바뀌었습니다.";
        return assessment(call, id => kind === "retry" ? { ...passing(id), tone: 2 } : passing(id));
      });
      expect(await s.harness.draft(request)).toMatchObject({ status: "abstained", reason: "stale_context", metrics: { rounds: 1 } });
      expect(s.generator.generate).toHaveBeenCalledTimes(2);
    },
  );

  it("does not forward newly revoked private sources to the judge", async () => {
    const s = setup();
    s.generator.generate.mockImplementationOnce(async () => {
      s.store.loadOwnedContext.mockResolvedValue(null);
      return response(overview);
    });
    expect(await s.harness.draft(request)).toMatchObject({ status: "abstained", reason: "stale_context", metrics: { rounds: 1 } });
    expect(s.judge.generate).not.toHaveBeenCalled();
  });

  it("judges a successful sibling after timeout and records the timeout without inventing usage", async () => {
    vi.useFakeTimers();
    const s = setup();
    s.generator.generate.mockImplementationOnce(() => new Promise(() => {}));
    const pending = s.harness.draft(request);
    await vi.advanceTimersByTimeAsync(NARRATION_LIMITS.callTimeoutMs);
    const result = await pending;
    expect(result).toMatchObject({ status: "selected", selectedCandidateId: "r1-c2", metrics: { rounds: 1 } });
    expect(result.metrics.calls[0]).toMatchObject({ status: "failed", errorCode: "timeout", elapsedMs: NARRATION_LIMITS.callTimeoutMs });
    expect(result.metrics.calls[0].trace).toBeUndefined();
    expect(s.generator.generate.mock.calls[0][0].signal?.aborted).toBe(true);
  });

  it("does not retry a provider outage or a judge timeout", async () => {
    const failedGeneration = setup();
    failedGeneration.generator.generate.mockRejectedValue(new AiError("rate_limited"));
    expect(await failedGeneration.harness.draft(request)).toMatchObject({ reason: "generation_failed", metrics: { rounds: 1 } });
    expect(failedGeneration.judge.generate).not.toHaveBeenCalled();

    vi.useFakeTimers();
    const failedJudge = setup();
    failedJudge.judge.generate.mockImplementation(() => new Promise(() => {}));
    const pending = failedJudge.harness.draft(request);
    await vi.advanceTimersByTimeAsync(NARRATION_LIMITS.callTimeoutMs);
    expect(await pending).toMatchObject({ reason: "judge_failed", metrics: { rounds: 1 } });
    expect(failedJudge.generator.generate).toHaveBeenCalledTimes(2);
  });

  it("bounds the store even when it ignores cancellation and blocks AI beyond the global deadline", async () => {
    vi.useFakeTimers();
    const s = setup();
    s.store.loadOwnedContext.mockImplementation(() => new Promise(() => {}));
    const pending = s.harness.draft(request);
    await vi.advanceTimersByTimeAsync(NARRATION_LIMITS.deadlineMs);
    expect(await pending).toMatchObject({ status: "abstained", reason: "timeout",
      metrics: { elapsedMs: NARRATION_LIMITS.deadlineMs, calls: [] } });
    expect(s.store.loadOwnedContext.mock.calls[0][2]?.aborted).toBe(true);
    expect(s.generator.generate).not.toHaveBeenCalled();
  });

  it("cancels both parallel calls without allowing late output to reach the judge", async () => {
    const s = setup();
    const cancel = new AbortController();
    const deferred: ((value: AiTextResponse) => void)[] = [];
    s.generator.generate.mockImplementation(() => new Promise(resolve => deferred.push(resolve)));
    const pending = s.harness.draft(request, cancel.signal);
    await vi.waitFor(() => expect(deferred).toHaveLength(2));
    cancel.abort(new Error("private caller message"));
    const result = await pending;
    deferred.forEach(resolve => resolve(response(overview)));
    expect(result).toMatchObject({ status: "abstained", reason: "cancelled",
      metrics: { calls: [{ errorCode: "cancelled" }, { errorCode: "cancelled" }] } });
    expect(s.generator.generate.mock.calls.every(([call]) => call.signal?.aborted)).toBe(true);
    expect(s.judge.generate).not.toHaveBeenCalled();
    expect(JSON.stringify(result)).not.toContain("private caller message");
  });

  it("prioritizes cancellation when a candidate round has finished with an abstention", async () => {
    const s = setup();
    const cancel = new AbortController();
    s.generator.generate.mockResolvedValue(response({ outcome: "clarify", answer: "근거를 확인해 주세요.", citations: [] }));
    const runner = playbook.startPlaybook("narration-draft");
    const step = runner.step;
    vi.spyOn(runner, "step").mockImplementation(async (id, callback) => {
      const result = await step(id, callback);
      if (id === "candidate.rounds") cancel.abort();
      return result;
    });
    const startPlaybook = vi.spyOn(playbook, "startPlaybook").mockReturnValueOnce(runner);
    try {
      expect(await s.harness.draft(request, cancel.signal)).toMatchObject({ status: "abstained", reason: "cancelled",
        steps: withUnboundJobs([...draftSteps.slice(0, 4).map(id => ({ id, status: "done" })),
          ...draftSteps.slice(4).map(id => ({ id, status: "skipped", reason: "cancelled" }))]) });
      expect(s.store.loadOwnedContext).toHaveBeenCalledOnce();
    } finally {
      startPlaybook.mockRestore();
    }
  });

  it("cancels a pending final snapshot recheck even after selection was scored", async () => {
    const s = setup();
    const cancel = new AbortController();
    s.judge.generate.mockImplementationOnce(async call => {
      s.store.loadOwnedContext.mockImplementation(() => new Promise(() => {}));
      return assessment(call);
    });
    const pending = s.harness.draft(request, cancel.signal);
    await vi.waitFor(() => expect(s.store.loadOwnedContext).toHaveBeenCalledTimes(3));
    cancel.abort();
    expect(await pending).toMatchObject({ status: "abstained", reason: "cancelled", selected: null, metrics: { rounds: 1 },
      steps: withUnboundJobs([...draftSteps.slice(0, 4).map(id => ({ id, status: "done" })),
        { id: "author.recheck.final", status: "failed" }, { id: "output.validate", status: "skipped", reason: "previous_step_failed" }]) });
  });

  it("keeps a cancelled invocation isolated from a concurrent baseline", async () => {
    const s = setup();
    const cancel = new AbortController();
    s.generator.generate.mockImplementationOnce(() => new Promise(() => {}));
    const treatment = s.harness.draft(request, cancel.signal);
    await vi.waitFor(() => expect(s.generator.generate).toHaveBeenCalledTimes(2));
    const baseline = s.harness.draft({ ...request, strategy: "single" });
    cancel.abort();
    expect(await treatment).toMatchObject({ status: "abstained", reason: "cancelled",
      metrics: { strategy: "best_of_two", reservedCalls: 3 } });
    expect(await baseline).toMatchObject({ status: "selected", selected: overview,
      metrics: { strategy: "single", reservedCalls: 2 } });
    expect(s.judge.generate).toHaveBeenCalledOnce();
  });
});

describe("narration job lifecycle", () => {
  it("propagates reservation errors unchanged before reading or generating", async () => {
    const replay = new Error("job replay");
    const jobs = { reserve: vi.fn(async () => { throw replay; }), complete: vi.fn(async () => {}) };
    const s = setup(ids.owner, { jobs });
    await expect(s.harness.draft(request)).rejects.toBe(replay);
    expect(s.store.loadOwnedContext).not.toHaveBeenCalled();
    expect(s.generator.generate).not.toHaveBeenCalled();
    expect(jobs.complete).not.toHaveBeenCalled();
    expect(playbook.getPlaybookFailureSteps(replay)?.[1]).toMatchObject({ id: "job.reserve", status: "failed" });
  });

  it("completes a reserved job after cancellation during a store read", async () => {
    const cancel = new AbortController();
    const jobs = { reserve: vi.fn(async () => {}), complete: vi.fn<NonNullable<Parameters<typeof createNarrationHarness>[1]["jobs"]>["complete"]>(async () => {}) };
    const s = setup(ids.owner, { jobs });
    s.store.loadOwnedContext.mockImplementationOnce(async () => { cancel.abort(); return s.context; });
    const result = await s.harness.draft(request, cancel.signal);
    expect(jobs.complete).toHaveBeenCalledTimes(1);
    const snapshot = jobs.complete.mock.calls[0][0];
    expect(snapshot.reason).toBe("cancelled");
    expect(snapshot.steps).toContainEqual(expect.objectContaining({ id: "author.read", status: "failed" }));
    expect(snapshot.steps.some(step => step.id === "job.complete")).toBe(false);
    expect(result.steps.at(-1)).toMatchObject({ id: "job.complete", status: "done" });
    expect(s.generator.generate).not.toHaveBeenCalled();
  });

  it("preserves the completion RPC error and records the failed terminal step", async () => {
    const failure = new ApiError(503, "SERVICE_UNAVAILABLE", "completion failed");
    const jobs = { reserve: vi.fn(async () => {}), complete: vi.fn(async () => { throw failure; }) };
    const s = setup(ids.owner, { jobs });
    await expect(s.harness.draft(request)).rejects.toBe(failure);
    expect(jobs.complete).toHaveBeenCalledTimes(1);
    expect(playbook.getPlaybookFailureSteps(failure)?.at(-1)).toMatchObject({ id: "job.complete", status: "failed" });
  });
});

describe("narration follow-up questions", () => {
  it.each([true, false])("selects the schema and returned fields with the flag %s", async followUpQuestions => {
    const s = setup(ids.owner, { followUpQuestions });
    const questions = ["수채 물감 외에 사용한 재료가 있나요?"];
    s.generator.generate.mockResolvedValueOnce(response({ ...overview, followUpQuestions: questions }));
    const result = await s.harness.draft({ ...request, strategy: "single" });
    expect(result.status).toBe("selected");
    const definition = s.generator.generate.mock.calls[0][0].schema.definition;
    const required = definition.required as string[];
    expect(required.includes("followUpQuestions")).toBe(followUpQuestions);
    if (followUpQuestions) expect(result.selected?.followUpQuestions).toEqual(questions);
    else expect(result.selected).not.toHaveProperty("followUpQuestions");
    expect(readCandidates(s.judge.generate.mock.calls[0][0])[0]).not.toHaveProperty("followUpQuestions");
  });

  it.each([
    { ...overview, followUpQuestions: ["가".repeat(201)] },
    overview,
  ])("rejects an invalid or absent follow-up field when enabled", async output => {
    const s = setup(ids.owner, { followUpQuestions: true });
    s.generator.generate.mockResolvedValueOnce(response(output));
    expect(await s.harness.draft({ ...request, strategy: "single" })).toMatchObject({ reason: "invalid_candidate" });
    expect(s.judge.generate).not.toHaveBeenCalled();
  });
});
