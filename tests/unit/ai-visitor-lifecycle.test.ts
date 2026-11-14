import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { createDocentHarness } from "../../src/lib/ai/harness";
import { visitorChatRequest, savedVisitorReply } from "../../src/lib/contracts/visitor";
import { ids, syntheticPublication, syntheticRequest } from "../fixtures/ai";

function setup(outcome = "answered") {
  const calls: string[] = [];
  const publications = { load: vi.fn(async () => { calls.push("load"); return syntheticPublication(); }),
    isCurrent: vi.fn(async () => { calls.push("recheck"); return true; }) };
  const visitor = { reserve: vi.fn(async () => { calls.push("reserve"); }),
    store: vi.fn(async () => { calls.push("store"); }), recordGap: vi.fn(async () => { calls.push("gap"); return true; }) };
  const text = { generate: vi.fn(async () => { calls.push("generate"); return {
    output: { answer: "검증할 답변입니다.", citations: outcome === "answered" ? [ids.evidence] : [], outcome },
    trace: { provider: "liner" as const, model: "synthetic" },
  }; }) };
  return { calls, publications, visitor, text, harness: createDocentHarness({ publications, visitor, text }) };
}
describe("visitor lifecycle integration boundaries", () => {
  it("reserves before reads and stores only after final publication recheck", async () => {
    const s = setup();
    const reply = await s.harness.answer(syntheticRequest());
    expect(s.calls).toEqual(["reserve", "load", "recheck", "generate", "recheck", "generate", "recheck", "store"]);
    expect(reply.steps.find(step => step.id === "request.reserve")?.status).toBe("done");
    expect(s.visitor.recordGap).not.toHaveBeenCalled();
  });
  it("a denied/replayed claim never loads evidence or calls a model", async () => {
    const s = setup(); const error = new Error("already claimed");
    s.visitor.reserve.mockRejectedValueOnce(error);
    await expect(s.harness.answer(syntheticRequest())).rejects.toBe(error);
    expect(s.calls).toEqual([]);
    expect(s.visitor.store).not.toHaveBeenCalled();
  });
  it("records insufficient questions only after storing the fixed validated answer", async () => {
    const s = setup("insufficient_evidence"); const request = syntheticRequest();
    const reply = await s.harness.answer(request);
    expect(s.calls.slice(-2)).toEqual(["store", "gap"]);
    expect(s.visitor.recordGap).toHaveBeenCalledWith(request.question, expect.objectContaining({ source: "fixed", outcome: "insufficient_evidence" }));
    expect(reply.steps.at(-1)).toMatchObject({ id: "gap.record", status: "done" });
  });
  it("does not store revoked or malformed model output or record a gap for errors", async () => {
    const s = setup(); s.publications.isCurrent.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    await expect(s.harness.answer(syntheticRequest())).rejects.toMatchObject({ code: "publication_unavailable" });
    expect(s.visitor.store).not.toHaveBeenCalled(); expect(s.visitor.recordGap).not.toHaveBeenCalled();
  });
  it("stores selection clarification without trying to record a missing artwork", async () => {
    const s = setup(); await s.harness.answer(syntheticRequest({ artworkId: null }));
    expect(s.calls).toEqual(["reserve", "store"]);
  });
  it("retains missing legacy intent at the HTTP boundary", () => {
    expect(visitorChatRequest.parse(syntheticRequest({ question: "18" })).intent).toBeUndefined();
    expect(visitorChatRequest.parse({ ...syntheticRequest(), intent: "question" }).intent).toBe("question");
  });
  it("public saved answers reject private execution metadata", () => {
    const reply = { answerId: ids.request, ...syntheticRequest(), answer: "해설", citations: [ids.evidence],
      outcome: "answered", publication: null, source: "generated", mock: true, steps: [] };
    expect(savedVisitorReply.safeParse(reply).success).toBe(false);
  });
});
