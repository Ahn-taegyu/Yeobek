import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { validateManifest } from "../../scripts/ai-plugin.mjs";
import { getPlaybookFailureSteps, PlaybookOrderError, startPlaybook } from "../../src/lib/ai/playbook";
import { capabilitiesFor } from "../../src/lib/ai/plugin";
import { ids, syntheticPublication } from "../fixtures/ai";

vi.mock("server-only", () => ({}));

const manifestPath = new URL("../../ai/yeobek/plugin.json", import.meta.url);

describe("playbook manifests", () => {
  it("requires at least one well-formed step and unique IDs within each playbook", () => {
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    const visitor = manifest.playbooks["visitor-answer"];
    expect(() => validateManifest(manifest)).not.toThrow();
    visitor.steps = [];
    expect(() => validateManifest(manifest)).toThrow();
    visitor.steps = [{ id: "" }];
    expect(() => validateManifest(manifest)).toThrow();
    visitor.steps = [{ id: "publication.read" }, { id: "publication.read", tool: "publication.read" }];
    expect(() => validateManifest(manifest)).toThrow("Duplicate playbook step");
  });

  it("rejects references to tools outside the playbook's allowlist", () => {
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    manifest.playbooks["visitor-answer"].steps = [{ id: "proposal.apply", tool: "proposal.apply" }];
    expect(() => validateManifest(manifest)).toThrow("Playbook step references an undeclared tool");
  });
});

describe("playbook step execution", () => {
  it("records ordered execution and explicit skips in an immutable snapshot", async () => {
    const run = startPlaybook("narration-evaluate");
    const timer = vi.spyOn(performance, "now").mockReturnValueOnce(10).mockReturnValueOnce(16);
    try {
      await expect(run.step("author.recheck", async () => true)).resolves.toBe(true);
    } finally {
      timer.mockRestore();
    }
    run.skip("model.evaluate", "no_candidates");
    run.skip("output.validate", "no_candidates");
    run.skip("candidate.rank", "no_candidates");
    const steps = run.finish();
    expect(steps).toEqual([
      { id: "author.recheck", status: "done", elapsedMs: 6 },
      { id: "model.evaluate", status: "skipped", reason: "no_candidates", elapsedMs: 0 },
      { id: "output.validate", status: "skipped", reason: "no_candidates", elapsedMs: 0 },
      { id: "candidate.rank", status: "skipped", reason: "no_candidates", elapsedMs: 0 },
    ]);
    expect(Object.isFrozen(steps)).toBe(true);
    expect(steps.every(Object.isFrozen)).toBe(true);
    expect(() => run.skip("candidate.rank", "no_candidates")).toThrow("playbook_finished");
  });

  it("rejects unknown, duplicate, omitted, and out-of-order steps", async () => {
    const run = startPlaybook("narration-evaluate");
    const execute = vi.fn();
    // @ts-expect-error This step belongs to a different playbook.
    await expect(run.step("request.validate", execute)).rejects.toThrow(PlaybookOrderError);
    await expect(run.step("model.evaluate", execute)).rejects.toThrow("step_out_of_order");
    await run.step("author.recheck", () => true);
    await expect(run.step("author.recheck", execute)).rejects.toThrow("step_out_of_order");
    expect(execute).not.toHaveBeenCalled();
    expect(() => run.finish()).toThrow("playbook_incomplete");
    expect(() => run.skip("model.evaluate", "")).toThrow("invalid_skip_reason");
    expect(() => run.skip("model.evaluate", "full error message")).toThrow("invalid_skip_reason");
    expect(() => run.skip("output.validate", "no_candidates")).toThrow("step_out_of_order");
  });

  it("rejects undeclared steps after all declared steps have been handled", async () => {
    const run = startPlaybook("narration-evaluate");
    await run.step("author.recheck", () => true);
    run.skip("model.evaluate", "no_candidates");
    run.skip("output.validate", "no_candidates");
    run.skip("candidate.rank", "no_candidates");

    const execute = vi.fn();
    await expect(run.step("candidate.rank", execute)).rejects.toThrow("step_out_of_order");
    // @ts-expect-error An untyped caller can pass an undefined step ID at runtime.
    await expect(run.step(undefined, execute)).rejects.toThrow("step_out_of_order");
    // @ts-expect-error An untyped caller can also pass undefined to skip.
    expect(() => run.skip(undefined, "no_candidates")).toThrow("step_out_of_order");
    expect(execute).not.toHaveBeenCalled();
    expect(run.finish().map(({ id }) => id)).toEqual([
      "author.recheck", "model.evaluate", "output.validate", "candidate.rank",
    ]);
  });

  it("rejects overlapping steps and closure while an async step is pending", async () => {
    const run = startPlaybook("narration-evaluate");
    let complete!: () => void;
    const gate = new Promise<void>(resolve => { complete = resolve; });
    const first = run.step("author.recheck", () => gate);
    const execute = vi.fn();
    await expect(run.step("model.evaluate", execute)).rejects.toThrow("step_pending");
    expect(() => run.skip("model.evaluate", "no_candidates")).toThrow("step_pending");
    expect(() => run.finish()).toThrow("step_pending");
    expect(() => run.fail(new Error("failed"))).toThrow("step_pending");
    expect(execute).not.toHaveBeenCalled();
    complete();
    await first;
    await run.step("model.evaluate", execute);
    expect(execute).toHaveBeenCalledOnce();
  });

  it("records a failed step and its untouched tail without exposing the thrown message", async () => {
    const run = startPlaybook("narration-evaluate");
    const error = new Error("Private store failure detail");
    await run.step("author.recheck", () => true);
    await expect(run.step("model.evaluate", async () => { throw error; })).rejects.toBe(error);
    expect(() => run.finish()).toThrow("playbook_failed");
    expect(() => run.fail(new Error("unrelated"))).toThrow("invalid_playbook_failure");
    const steps = run.fail(error);
    expect(steps).toEqual([
      { id: "author.recheck", status: "done", elapsedMs: expect.any(Number) },
      { id: "model.evaluate", status: "failed", elapsedMs: expect.any(Number) },
      { id: "output.validate", status: "skipped", reason: "previous_step_failed", elapsedMs: 0 },
      { id: "candidate.rank", status: "skipped", reason: "previous_step_failed", elapsedMs: 0 },
    ]);
    expect(getPlaybookFailureSteps(error)).toBe(steps);
  });

  it("does not turn a step-order bug into an operational result", async () => {
    const run = startPlaybook("narration-evaluate");
    const error = await run.step("model.evaluate", () => true).catch((error: unknown) => error);
    expect(() => run.fail(error)).toThrow("step_out_of_order");
    expect(getPlaybookFailureSteps(error)).toBeUndefined();
    expect(() => run.finish()).toThrow("playbook_incomplete");
  });
});

describe("playbook capabilities", () => {
  it("exposes only the visitor tools and binds them to the publication store", async () => {
    const publication = syntheticPublication();
    const publications = {
      publication,
      async load() { return this.publication; },
      async isCurrent() { return this.publication === publication; },
    };
    const author = { loadOwnedContext: vi.fn() };
    const proposals = { storeProposal: vi.fn(), loadOwnedProposal: vi.fn(), commitOwnedProposal: vi.fn() };
    const capabilities = capabilitiesFor("visitor-answer", { publications, author, proposals });
    expect(Object.keys(capabilities)).toEqual(["request.reserve", "publication.read", "publication.recheck", "answer.store", "gap.record"]);
    expect(Object.isFrozen(capabilities)).toBe(true);
    await expect(capabilities["publication.read"]({ exhibitionId: ids.exhibition, artworkId: ids.artwork })).resolves.toBe(publication);
    await expect(capabilities["publication.recheck"](publication)).resolves.toBe(true);
    // @ts-expect-error A visitor capability cannot apply a proposal.
    expect(capabilities["proposal.apply"]).toBeUndefined();
    // @ts-expect-error A visitor capability cannot read an author context.
    expect(capabilities["author.read"]).toBeUndefined();
    expect(author.loadOwnedContext).not.toHaveBeenCalled();
    expect(proposals.commitOwnedProposal).not.toHaveBeenCalled();
  });

  it("limits capabilities when the caller selects a playbook at runtime", () => {
    function chooseCapabilities(id: "visitor-answer" | "artist-organize") {
      const publications = { load: vi.fn(), isCurrent: vi.fn() };
      const author = { loadOwnedContext: vi.fn() };
      const proposals = { storeProposal: vi.fn(), loadOwnedProposal: vi.fn(), commitOwnedProposal: vi.fn() };
      return capabilitiesFor(id, { publications, author, proposals });
    }

    const capabilities = chooseCapabilities("visitor-answer");
    // @ts-expect-error Choosing a playbook dynamically does not guarantee its tools.
    expect(capabilities["proposal.store"]).toBeUndefined();
  });
});
