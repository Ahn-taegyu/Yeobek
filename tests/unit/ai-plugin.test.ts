import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { DOCENT_COPY, PLUGIN_VERSION, playbookPrompt } from "../../src/lib/ai/plugin";
import { ApiError } from "../../src/lib/api/errors";
import { createDocentHarness } from "../../src/lib/ai/harness";
import { getPlaybookFailureSteps } from "../../src/lib/ai/playbook";
import { selectEvidence } from "../../src/lib/ai/context";
import { createArtistKnowledgeHarness, type ArtistKnowledgeContext, type KnowledgeProposal, type KnowledgeOrganizationResult } from "../../src/lib/ai/artist-knowledge";
import { ids, syntheticPublication, syntheticRequest } from "../fixtures/ai";

function artistSetup() {
  const context: ArtistKnowledgeContext = { documentId: ids.artwork, ownerId: ids.owner, artistId: ids.owner,
    subjectId: ids.owner, subjectType: "artist", exhibitionId: null, revision: 2,
    sections: [{ id: "bio", body: "기존 소개입니다." }, { id: "practice", body: "수정 전 원문입니다." }],
    sourceRefs: [{ kind: "direct", sectionId: "bio" }, { kind: "direct", sectionId: "practice" }],
    sources: [{ id: ids.evidence, ownerId: ids.owner, artistId: ids.owner, subjectId: ids.owner, subjectType: "artist", exhibitionId: null,
      revision: 1, text: "종이와 수채 물감으로 작업합니다. 파란색의 의미는 아직 정하지 않았습니다.", ref: { kind: "direct", sectionId: "practice" } }],
  };
  let saved: KnowledgeProposal | null = null;
  const store = { loadOwnedContext: vi.fn(async () => structuredClone(context)),
    storeProposal: vi.fn(async (proposal: KnowledgeProposal) => { saved = structuredClone(proposal); }),
    loadOwnedProposal: vi.fn(async () => structuredClone(saved)),
    commitOwnedProposal: vi.fn(async () => {
      if (!saved) throw new Error("missing");
      saved.appliedRevision = context.revision + 1;
      return { documentRevision: saved.appliedRevision };
    }),
  };
  const text = { generate: vi.fn(async () => ({ output: { sections: [{ id: "practice", sourceIds: [ids.evidence] }] },
    trace: { provider: "liner" as const, model: "fake" } })) };
  const harness = createArtistKnowledgeHarness(ids.owner, { store, text, now: () => 1000000 });
  return { context, store, text, harness, proposal: () => saved! };
}
describe("product plugin boundaries", () => {
  it("selects only skills for the declared server task", () => {
    expect(PLUGIN_VERSION).toMatch(/^yeobek@0\.6\.0:[a-f0-9]{12}$/);
    expect(playbookPrompt("visitor-answer")).toContain("차분한 존댓말");
    expect(playbookPrompt("visitor-answer")).not.toContain("출력은 sections 배열");
    expect(playbookPrompt("artist-organize")).not.toContain("기본 말투는 차분한 존댓말");
  });
  it("replaces prose in an ungrounded model outcome with reviewed formal copy", async () => {
    const publications = { load: async () => syntheticPublication(), isCurrent: async () => true };
    const text = { generate: vi.fn(async () => ({ output: { answer: "작가는 어린 시절의 슬픔을 표현했어요!", citations: [], outcome: "insufficient_evidence" },
      trace: { provider: "openai" as const, model: "fake" } })) };
    const result = await createDocentHarness({ publications, text }).answer(syntheticRequest());
    expect(result.answer).toBe(DOCENT_COPY.insufficient);
    expect(result.source).toBe("fixed");
    expect(result.promptVersion).toBe(PLUGIN_VERSION);
  });
  it("keeps an exact relevant common source ahead of unrelated artwork excerpts", () => {
    const source = syntheticPublication().evidence[0];
    const unrelated = Array.from({ length: 12 }, (_, index) => ({ ...source, id: `synthetic-${index}`, body: "이 작품의 크기는 작습니다." }));
    const common = { ...source, id: "common", scope: "artist" as const, artworkId: null, body: "작가는 수채화 기법을 사용합니다." };
    expect(selectEvidence([...unrelated, common], "수채화")[0].id).toBe("common");
  });
});

describe("artist organization proposals", () => {
  it("records proposal assembly failure without replacing the original exception", async () => {
    const s = artistSetup(); const error = new Error("clock unavailable");
    const harness = createArtistKnowledgeHarness(ids.owner, { store: s.store, text: s.text, now: () => { throw error; } });
    await expect(harness.propose({ documentId: ids.artwork, expectedRevision: 2 })).rejects.toBe(error);
    expect(getPlaybookFailureSteps(error)?.find(step => step.id === "proposal.store")).toMatchObject({ id: "proposal.store", status: "failed" });
    expect(s.store.storeProposal).not.toHaveBeenCalled();
  });
  it("checks cancellation immediately before storing a newly assembled proposal", async () => {
    const s = artistSetup(); const controller = new AbortController();
    const harness = createArtistKnowledgeHarness(ids.owner, { store: s.store, text: s.text, now: () => { controller.abort(); return 1000000; } });
    await expect(harness.propose({ documentId: ids.artwork, expectedRevision: 2 }, controller.signal)).rejects.toMatchObject({ code: "cancelled" });
    expect(s.store.storeProposal).not.toHaveBeenCalled();
  });
  it("keeps an atomic apply success even if the caller cancels during commit", async () => {
    const s = artistSetup(); const controller = new AbortController();
    const { proposal } = await s.harness.propose({ documentId: ids.artwork, expectedRevision: 2 });
    s.store.commitOwnedProposal.mockImplementation(async () => { controller.abort(); s.proposal().appliedRevision = 3; return { documentRevision: 3 }; });
    const result = await s.harness.apply({ proposalId: proposal!.id, reviewed: true }, controller.signal);
    expect(result).toMatchObject({ documentRevision: 3 });
    expect(result.steps.at(-1)).toMatchObject({ id: "proposal.apply", status: "done" });
    expect(s.store.commitOwnedProposal).toHaveBeenCalledOnce();
  });
  it("copies whole sources with negation intact, preserves untouched fields, and needs review before applying", async () => {
    const s = artistSetup(); const { proposal, steps } = await s.harness.propose({ documentId: ids.artwork, expectedRevision: 2 });
    expect(steps.map(step => [step.id, step.status])).toEqual([
      ["request.validate", "done"], ["job.reserve", "skipped"], ["author.read", "done"], ["model.generate", "done"],
      ["output.validate", "done"], ["proposal.store", "done"], ["job.complete", "skipped"],
    ]);
    expect(s.proposal()).not.toHaveProperty("steps");
    expect(proposal?.sections).toEqual([{ id: "bio", body: "기존 소개입니다." }, { id: "practice", body: s.context.sources[0].text }]);
    expect(proposal?.sourceRefs).toContainEqual({ kind: "direct", sectionId: "bio" });
    expect(s.store.commitOwnedProposal).not.toHaveBeenCalled();
    expect(s.context.sections[1].body).toBe("수정 전 원문입니다.");
    const applied = await s.harness.apply({ proposalId: proposal!.id, reviewed: true });
    expect(applied.documentRevision).toBe(3);
    expect(applied.steps.at(-1)).toMatchObject({ id: "proposal.apply", status: "done" });
    // Replay returns the recorded result rather than applying twice.
    const replay = await s.harness.apply({ proposalId: proposal!.id, reviewed: true });
    expect(replay).toMatchObject({ documentRevision: 3 });
    expect(replay.steps.at(-1)).toMatchObject({ id: "proposal.apply", status: "skipped", reason: "already_applied" });
    expect(s.store.commitOwnedProposal).toHaveBeenCalledOnce();
  });
  it("fails closed on wrong owner, artist or cross-exhibition sources before AI", async () => {
    for (const kind of ["owner", "artist", "exhibition", "artist_scope"]) {
      const s = artistSetup();
      if (kind === "owner") s.context.ownerId = ids.other;
      if (kind === "artist") s.context.sources[0].artistId = ids.other;
      if (kind === "exhibition") Object.assign(s.context.sources[0], { subjectType: "exhibition", subjectId: ids.other, exhibitionId: ids.other });
      if (kind === "artist_scope") s.context.sources[0].exhibitionId = ids.exhibition;
      await expect(s.harness.propose({ documentId: ids.artwork, expectedRevision: 2 })).rejects.toThrow();
      expect(s.text.generate).not.toHaveBeenCalled(); expect(s.store.storeProposal).not.toHaveBeenCalled();
    }
  });
  it("blocks wrong section, invented source, duplicate source, extra generated prose and oversize output", async () => {
    const outputs = [
      { sections: [{ id: "theme", sourceIds: [ids.evidence] }] },
      { sections: [{ id: "practice", sourceIds: [ids.other] }] },
      { sections: [{ id: "practice", sourceIds: [ids.evidence, ids.evidence] }] },
      { sections: [{ id: "practice", sourceIds: [ids.evidence] }], inventedBiography: "유명한 작가" },
      { sections: [{ id: "bio", sourceIds: [ids.evidence] }, { id: "bio", sourceIds: [ids.evidence] }] },
    ];
    for (const output of outputs) {
      const s = artistSetup(); s.text.generate.mockResolvedValue({ output, trace: { provider: "liner", model: "fake" } });
      await expect(s.harness.propose({ documentId: ids.artwork, expectedRevision: 2 })).rejects.toMatchObject({ code: "invalid_output" });
      expect(s.store.storeProposal).not.toHaveBeenCalled();
    }
    const s = artistSetup(); s.context.sources.push({ ...s.context.sources[0], id: ids.other, text: "원".repeat(5000) });
    s.text.generate.mockResolvedValue({ output: { sections: [{ id: "practice", sourceIds: [ids.evidence, ids.other] }] }, trace: { provider: "liner", model: "fake" } });
    await expect(s.harness.propose({ documentId: ids.artwork, expectedRevision: 2 })).rejects.toMatchObject({ code: "invalid_output" });
  });
  it("rejects unreviewed, tampered, stale-target, stale-source, removed-source and foreign proposals", async () => {
    for (const kind of ["unreviewed", "tampered", "target", "source", "removed", "owner", "expired"]) {
      const s = artistSetup(); const { proposal } = await s.harness.propose({ documentId: ids.artwork, expectedRevision: 2 });
      if (kind === "tampered") s.proposal().sections[1].body = "작가는 유명합니다.";
      if (kind === "target") s.context.revision++;
      if (kind === "source") s.context.sources[0].revision++;
      if (kind === "removed") s.context.sources = [];
      if (kind === "owner") s.proposal().ownerId = ids.other;
      if (kind === "expired") s.proposal().expiresAt = 1;
      const input = kind === "unreviewed" ? { proposalId: proposal!.id, reviewed: false } : { proposalId: proposal!.id, reviewed: true };
      await expect(s.harness.apply(input as { proposalId: string; reviewed: true })).rejects.toThrow();
      expect(s.store.commitOwnedProposal).not.toHaveBeenCalled();
    }
  });
  it("propagates an atomic store conflict and never reports a successful write", async () => {
    const s = artistSetup(); const { proposal } = await s.harness.propose({ documentId: ids.artwork, expectedRevision: 2 });
    s.store.commitOwnedProposal.mockRejectedValue(new Error("revision_conflict"));
    await expect(s.harness.apply({ proposalId: proposal!.id, reviewed: true })).rejects.toThrow("revision_conflict");
  });
  it("replays a confirmed no-op whose database revision correctly stayed unchanged", async () => {
    const s = artistSetup(); s.context.sections[1].body = s.context.sources[0].text;
    const { proposal } = await s.harness.propose({ documentId: ids.artwork, expectedRevision: 2 });
    s.store.commitOwnedProposal.mockImplementation(async () => { s.proposal().appliedRevision = 2; return { documentRevision: 2 }; });
    await expect(s.harness.apply({ proposalId: proposal!.id, reviewed: true })).resolves.toMatchObject({ documentRevision: 2 });
    await expect(s.harness.apply({ proposalId: proposal!.id, reviewed: true })).resolves.toMatchObject({ documentRevision: 2 });
    expect(s.store.commitOwnedProposal).toHaveBeenCalledOnce();
  });
  it("keeps ancestor provenance as a document reference instead of target-direct input", async () => {
    const s = artistSetup();
    Object.assign(s.context, { subjectType: "artwork", subjectId: ids.artwork, exhibitionId: ids.exhibition,
      sections: [{ id: "description", body: "기존 설명" }], sourceRefs: [{ kind: "direct", sectionId: "description" }] });
    s.text.generate.mockResolvedValue({ output: { sections: [{ id: "description", sourceIds: [ids.evidence] }] }, trace: { provider: "liner", model: "fake" } });
    await expect(s.harness.propose({ documentId: ids.artwork, expectedRevision: 2 })).rejects.toMatchObject({ code: "invalid_context" });
    expect(s.text.generate).not.toHaveBeenCalled();
    s.context.sources[0].ref = { kind: "document", sectionId: "description", sourceDocumentId: ids.other, sourceSectionId: "practice", sourceRevision: 1 };
    const { proposal } = await s.harness.propose({ documentId: ids.artwork, expectedRevision: 2 });
    expect(proposal?.sourceRefs).toContainEqual(s.context.sources[0].ref);
    s.context.sources[0].ref.sourceSectionId = "theme";
    await expect(s.harness.propose({ documentId: ids.artwork, expectedRevision: 2 })).rejects.toMatchObject({ code: "invalid_context" });
  });
  it("returns no proposal for empty sources or an empty classification", async () => {
    const s = artistSetup(); s.context.sources = [];
    const result = await s.harness.propose({ documentId: ids.artwork, expectedRevision: 2 });
    expect(result.proposal).toBeNull();
    expect(result.steps.slice(3, -1).every(step => step.status === "skipped" && step.reason === "no_sources")).toBe(true);
    expect(s.text.generate).not.toHaveBeenCalled();
    const empty = artistSetup(); empty.text.generate.mockResolvedValue({ output: { sections: [] }, trace: { provider: "liner", model: "fake" } });
    expect(await empty.harness.propose({ documentId: ids.artwork, expectedRevision: 2 })).toMatchObject({ proposal: null });
    expect(empty.store.storeProposal).not.toHaveBeenCalled();
  });
  it("returns the committed result when a parallel apply completes between proposal and context reads", async () => {
    const s = artistSetup(); const { proposal } = await s.harness.propose({ documentId: ids.artwork, expectedRevision: 2 });
    s.store.loadOwnedContext.mockImplementation(async () => {
      // Simulate the other request's atomic document update and proposal receipt.
      s.context.revision = 3; s.proposal().appliedRevision = 3;
      return structuredClone(s.context);
    });
    await expect(s.harness.apply({ proposalId: proposal!.id, reviewed: true })).resolves.toMatchObject({ documentRevision: 3 });
    expect(s.store.loadOwnedProposal).toHaveBeenCalledTimes(2);
    expect(s.store.commitOwnedProposal).not.toHaveBeenCalled();
  });
});

describe("organization job lifecycle", () => {
  it("completes a failed proposal and rethrows the original access error", async () => {
    const s = artistSetup();
    const failure = new ApiError(403, "FORBIDDEN", "denied");
    s.store.loadOwnedContext.mockRejectedValueOnce(failure);
    const jobs = { reserve: vi.fn(async () => {}), complete: vi.fn<(result: KnowledgeOrganizationResult) => Promise<void>>(async () => {}) };
    const harness = createArtistKnowledgeHarness(ids.owner, { ...s, jobs });
    await expect(harness.propose({ documentId: ids.artwork, expectedRevision: 2 })).rejects.toBe(failure);
    expect(jobs.complete).toHaveBeenCalledOnce();
    expect(jobs.complete.mock.calls[0][0]).toMatchObject({ proposal: null, failure: { code: "FORBIDDEN", routing: "author" } });
    expect(getPlaybookFailureSteps(failure)?.at(-1)).toMatchObject({ id: "job.complete", status: "done" });
    expect(s.text.generate).not.toHaveBeenCalled();
  });

  it("does not retry completion or hide its error", async () => {
    const s = artistSetup();
    const error = new Error("completion failed");
    const jobs = { reserve: vi.fn(async () => {}), complete: vi.fn(async () => { throw error; }) };
    const harness = createArtistKnowledgeHarness(ids.owner, { ...s, jobs });
    await expect(harness.propose({ documentId: ids.artwork, expectedRevision: 2 })).rejects.toBe(error);
    expect(jobs.complete).toHaveBeenCalledOnce();
    expect(getPlaybookFailureSteps(error)?.at(-1)).toMatchObject({ id: "job.complete", status: "failed" });
  });
});
