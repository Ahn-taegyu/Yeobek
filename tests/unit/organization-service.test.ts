import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), generate: vi.fn(), worker: {} }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/api/db", () => ({ rpc: mocks.rpc }));
vi.mock("@/lib/supabase/worker", () => ({ createWorkerSupabase: () => mocks.worker }));
vi.mock("@/lib/ai/runtime", async importOriginal => {
  const actual = await importOriginal<typeof import("@/lib/ai/runtime")>();
  const { createArtistKnowledgeHarness } = await import("@/lib/ai/artist-knowledge");
  return {
    ...actual,
    createArtistKnowledgeRuntime: (...[actor, store, jobs, proposalIdentity]: Parameters<typeof actual.createArtistKnowledgeRuntime>) =>
      createArtistKnowledgeHarness(actor, { store, jobs, proposalIdentity, text: { generate: mocks.generate } }),
  };
});

import type { DbClient } from "@/lib/api/db";
import type { ArtistKnowledgeContext, KnowledgeProposal } from "@/lib/ai/artist-knowledge";
import { applyProposal, generateProposal } from "@/lib/ai/organization-service";
import { PLUGIN_VERSION } from "@/lib/ai/plugin";
import { createProposalStore, loadProposalReview } from "@/lib/ai/stores/proposals";
import { ids } from "../fixtures/ai";

const db = {} as DbClient;
const before = { revision: 2, sections: [{ id: "bio" as const, body: "기존 소개입니다." }], sourceRefs: [] };
const context: ArtistKnowledgeContext = {
  documentId: ids.artwork, ownerId: ids.owner, artistId: ids.owner, subjectId: ids.owner,
  subjectType: "artist", exhibitionId: null, ...before,
  sources: [{ id: ids.evidence, ownerId: ids.owner, artistId: ids.owner, subjectId: ids.owner, subjectType: "artist",
    exhibitionId: null, revision: 1, text: "종이와 수채 물감으로 작업합니다.", ref: { kind: "direct", sectionId: "bio" } }],
};
const expiresAt = Date.parse("2099-01-01T00:00:00Z");
const job = {
  id: ids.other, kind: "organize", artworkId: null, documentId: ids.artwork, requestId: ids.request,
  mock: true, expectedRevision: null, expectedDocumentRevision: 2, attempt: 1, strategy: null,
  status: "running", routing: "none", resultCode: null, result: null,
  createdAt: "2026-11-14T00:00:00Z", updatedAt: "2026-11-14T00:00:00Z", expiresAt: "2099-01-01T00:00:00Z",
};
const selection = { sections: [{ id: "bio", sourceIds: [ids.evidence] }] } satisfies KnowledgeProposal["selection"];
const trace = { provider: "liner", model: "fixture", usage: { totalTokens: 20 } };
const proposal: KnowledgeProposal = {
  id: job.id, ownerId: ids.owner, documentId: ids.artwork, targetRevision: 2,
  pluginVersion: PLUGIN_VERSION, expiresAt, appliedRevision: 3, selection,
  sourcePins: [{ id: ids.evidence, revision: 1, hash: "ab".repeat(32) }],
  sections: [{ id: "bio", body: context.sources[0].text }], sourceRefs: [{ kind: "direct", sectionId: "bio" }],
};
const generate = () => generateProposal(db, ids.owner, ids.artwork, { requestId: ids.request, expectedDocumentRevision: 2 });

function configureRpc(responses: Record<string, unknown>) {
  mocks.rpc.mockImplementation(async (_db, name: string) => {
    if (!Object.hasOwn(responses, name)) throw new Error(`Unexpected RPC ${name}`);
    const value = responses[name];
    if (value instanceof Error) throw value;
    return value;
  });
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("AI_PROVIDER_MODE", "mock");
  mocks.generate.mockResolvedValue({ output: selection, trace });
});
afterEach(() => vi.unstubAllEnvs());

describe("artist organization service", () => {
  it("returns the original job on replay without loading sources or calling the model", async () => {
    configureRpc({ reserve_organize_job: { job, claimed: false, proposalExpiresAt: expiresAt } });
    expect(await generate()).toEqual({ job, created: false });
    expect(mocks.rpc.mock.calls.map(([, name]) => name)).toEqual(["reserve_organize_job"]);
    expect(mocks.generate).not.toHaveBeenCalled();
  });

  it("returns the authoritative stale result even when the model produced a proposal", async () => {
    const saved = { ...job, status: "failed", routing: "author", resultCode: "REVISION_CONFLICT" };
    configureRpc({
      reserve_organize_job: { job, claimed: true, proposalExpiresAt: expiresAt },
      get_organize_context: context,
      complete_organize_job: saved,
    });
    expect(await generate()).toEqual({ job: saved, created: true });
    expect(mocks.generate).toHaveBeenCalledOnce();
    expect(mocks.rpc).toHaveBeenLastCalledWith(mocks.worker, "complete_organize_job", {
      p_owner: ids.owner, p_job_id: job.id, p_attempt: 1,
      p_result: expect.objectContaining({
        proposal: expect.objectContaining({ id: job.id, expiresAt }), resultCode: "OK",
        routing: "none", usage: [trace], steps: expect.any(Array), elapsedMs: expect.any(Number), mock: true,
      }),
    });
  });

  it("reports a lost completion without retrying or writing a contradictory result", async () => {
    configureRpc({
      reserve_organize_job: { job, claimed: true, proposalExpiresAt: expiresAt },
      get_organize_context: context,
      complete_organize_job: new Error("reply lost"),
    });
    await expect(generate()).rejects.toMatchObject({ status: 500 });
    expect(mocks.rpc.mock.calls.map(([, name]) => name)).toEqual([
      "reserve_organize_job", "get_organize_context", "complete_organize_job",
    ]);
  });

  it("returns a review with changed sections and leaves ownership and evidence pins private", async () => {
    configureRpc({ load_proposal: { proposal, before, mock: true } });
    expect(await loadProposalReview(db, proposal.id)).toEqual({
      id: proposal.id, documentId: proposal.documentId, targetRevision: 2,
      expiresAt: new Date(expiresAt).toISOString(), appliedRevision: 3, mock: true, before,
      proposed: { sections: proposal.sections, sourceRefs: proposal.sourceRefs },
      changes: [{ sectionId: "bio", before: before.sections[0].body, after: proposal.sections[0].body }],
    });
  });

  it("projects replayed application to the revision without playbook traces", async () => {
    configureRpc({ load_proposal: { proposal, before, mock: true } });
    expect(await applyProposal(db, ids.owner, proposal.id)).toEqual({ documentRevision: 3 });
    expect(mocks.rpc.mock.calls.map(([, name]) => name)).toEqual(["load_proposal"]);
    expect(mocks.generate).not.toHaveBeenCalled();
  });

  it("stages an isolated copy without persisting or exposing it through a fresh store", async () => {
    const { store, staged } = createProposalStore(db, ids.owner);
    const supplied = structuredClone(proposal);
    await store.storeProposal(supplied);
    supplied.sections[0].body = "변경했습니다.";
    expect(staged()).toEqual(proposal);
    expect(createProposalStore(db, ids.owner).staged()).toBeNull();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
});
