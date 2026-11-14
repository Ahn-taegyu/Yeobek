import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { retrievalCases } from "../evaluation/retrieval-cases";
import { textHash, validateContext } from "../../src/lib/ai/context";
import type { Evidence } from "../../src/lib/ai/contracts";
import { mkdtempSync, readFileSync, writeFileSync, unlinkSync, rmdirSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { reserveAllowance } from "../../scripts/experiments/bivia-free-budget";
import { BIVIA_URL, chooseCases, createFreeScorer, parseOptions, parseScore, preflight, rerank, retrievalMetrics, scoreBody, validateFreeRun, type FreeAllowance } from "../../scripts/experiments/bivia-retrieval";

const fixture = retrievalCases[0];
const plan = () => preflight([fixture], 1);
const allowance = (): FreeAllowance => ({ verifiedAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
  paidBillingDisabled: true, freeTokensRemaining: 1_000_000, freeRequestsRemaining: 6000 });
const result = (value = .8) => ({ type: "score" as const, status: "answered" as const, value, billable_tokens: 10, model: "fixture-model" });

describe("A/C experiment gates and corpus", () => {
  it("defaults to offline and isolates dev/eval works", () => {
    expect(parseOptions([])).toEqual({ mode: "baseline", split: "eval", repeats: 1, maxCalls: 0 });
    const dev = chooseCases(retrievalCases, "dev"), evaluation = chooseCases(retrievalCases, "eval");
    expect(dev).toHaveLength(30); expect(evaluation).toHaveLength(60);
    expect(new Set(retrievalCases.map(c => c.id)).size).toBe(90);
    const devWorks = new Set(dev.map(c => c.context.artworkId));
    expect(evaluation.every(c => !devWorks.has(c.context.artworkId))).toBe(true);
    expect(preflight(evaluation, 1).calls).toBe(1440);
    for (const c of retrievalCases) {
      validateContext(c.context, { exhibitionId: c.context.exhibitionId, artworkId: c.context.artworkId });
      expect(c.context.evidence.length).toBeGreaterThan(12);
      expect(c.expectedGroups.flat().every(id => c.context.evidence.some(e => e.id === id))).toBe(true);
    }
  });
  it.each([["--mode=live-free"], ["--mode=live"], ["--repeats=0"], ["--max-calls=1e3"], ["--mode=baseline", "--mode=baseline"], ["--split=private-file"], ["--repeats=4"], ["--max-calls=6001"]])("rejects unsafe or ambiguous options %s", (...args) => {
    expect(() => parseOptions(args)).toThrow();
  });
  it("requires a recent, sufficient, billing-disabled free allocation before any request", () => {
    expect(validateFreeRun(allowance(), plan(), 24)).toMatchObject({ paidBillingDisabled: true });
    for (const patch of [{ paidBillingDisabled: false }, { freeRequestsRemaining: 15 }, { freeTokensRemaining: 1 },
      { verifiedAt: new Date(Date.now() - 3_700_000).toISOString() }, { expiresAt: new Date().toISOString() }]) {
      expect(() => validateFreeRun({ ...allowance(), ...patch }, plan(), 24)).toThrow();
    }
    expect(() => validateFreeRun(allowance(), plan(), 15)).toThrow();
    expect(() => createFreeScorer("", allowance(), plan(), 24)).toThrow("BIVIA_API_KEY");
  });
  it("reserves quota across runs, rejects concurrent execution and does not refund failures", () => {
    const dir = mkdtempSync(join(tmpdir(), "yeobek-bivia-")), path = join(dir, "allowance.json");
    try {
      const a = allowance(); writeFileSync(path, JSON.stringify(a));
      const reservation = reserveAllowance(path, plan(), 24);
      try { expect(() => reserveAllowance(path, plan(), 24)).toThrow("free_allowance_locked"); }
      finally { reservation.release(); }
      const remaining = JSON.parse(readFileSync(path, "utf8"));
      expect(remaining.freeRequestsRemaining).toBe(a.freeRequestsRemaining - 24);
      expect(remaining.freeTokensRemaining).toBe(a.freeTokensRemaining - plan().reservedTokens);
    } finally {
      for (const file of [path, `${path}.tmp`, `${path}.lock`]) if (existsSync(file)) unlinkSync(file);
      rmdirSync(dir);
    }
  });
});

describe("Bivia HTTP contract (fake fetch only)", () => {
  it("uses official Bearer score contract without gold, credentials in body or redirects", async () => {
    const fetcher = vi.fn<typeof fetch>(async () => Response.json(result()));
    const client = createFreeScorer("test-secret", allowance(), plan(), 24, fetcher);
    await client.score(fixture.question, fixture.context.evidence[0]);
    const [url, init] = fetcher.mock.calls[0];
    expect(url).toBe(BIVIA_URL); expect(init?.redirect).toBe("error");
    expect(init?.headers).toEqual({ Authorization: "Bearer test-secret", "Content-Type": "application/json" });
    expect(JSON.parse(init?.body as string)).toMatchObject({ range: [0, 1], buckets: 11, mode: "fast", think: false, allow_abstain: true });
    expect(init?.body).not.toContain("expectedGroups"); expect(init?.body).not.toContain("test-secret");
    expect(init?.body).not.toContain(fixture.context.ownerId);
    expect(client.ledger).toMatchObject({ calls: 1, billableTokens: 10, usageUnknownCalls: 0 });
  });
  it.each([401, 403, 429, 500])("stops on HTTP %s, never retries or prints response body", async status => {
    const fetcher = vi.fn<typeof fetch>(async () => new Response("test-secret private diagnostic", { status }));
    const client = createFreeScorer("test-secret", allowance(), plan(), 24, fetcher);
    await expect(client.score(fixture.question, fixture.context.evidence[0])).rejects.toThrow(`bivia_http_${status}`);
    await expect(client.score(fixture.question, fixture.context.evidence[0])).rejects.toThrow("bivia_run_stopped");
    expect(fetcher).toHaveBeenCalledTimes(1); expect(client.ledger.usageUnknownCalls).toBe(1);
  });
  it.each([
    ["invalid JSON", async () => new Response("<html>test-secret</html>"), "bivia_invalid_json"],
    ["missing usage", async () => Response.json({ type: "score", status: "answered", value: .5 }), "bivia_usage_unavailable"],
    ["network timeout", async () => { throw new Error("timeout with test-secret"); }, "bivia_network_or_timeout"],
    ["over reservation", async () => Response.json({ ...result(), billable_tokens: 999_999 }), "bivia_usage_exceeds_reservation"],
  ] as const)("fails closed on %s", async (_name, fetcher, code) => {
    const client = createFreeScorer("test-secret", allowance(), plan(), 24, fetcher as typeof fetch);
    await expect(client.score(fixture.question, fixture.context.evidence[0])).rejects.toThrow(code);
    await expect(client.score(fixture.question, fixture.context.evidence[0])).rejects.toThrow("bivia_run_stopped");
  });
  it("counts abstention usage but rejects invalid score/status types", () => {
    expect(parseScore({ type: "score", status: "abstained", value: null, billable_tokens: 12 }).value).toBeNull();
    for (const patch of [{ value: "0.8" }, { value: 2 }, { value: null }, { status: "abstained" }, { type: "choice" }, { value: NaN }]) {
      expect(() => parseScore({ ...result(), ...patch })).toThrow("bivia_invalid_response");
    }
  });
  it("caps requests across calls and does not serialize gold into the prompt", async () => {
    const single = { ...plan(), calls: 1 }, fetcher = vi.fn<typeof fetch>(async () => Response.json(result()));
    const client = createFreeScorer("test-secret", allowance(), single, 1, fetcher);
    await client.score(fixture.question, fixture.context.evidence[0]);
    await expect(client.score(fixture.question, fixture.context.evidence[0])).rejects.toThrow("free_budget_exhausted");
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(Object.keys(scoreBody(fixture.question, fixture.context.evidence[0]))).not.toContain("expectedFact");
  });
});

describe("reranking and measurement boundaries", () => {
  it("counts every required evidence group and accepts alternate IDs within a group", () => {
    const a = fixture.context.evidence[0], b = fixture.context.evidence[1], alternative = fixture.context.evidence[2];
    const c = { ...fixture, expectedGroups: [[a.id, alternative.id], [b.id]] };
    expect(retrievalMetrics(c, [a])).toEqual({ groupRecall: .5, allGroups: false, precision: 1 });
    expect(retrievalMetrics(c, [alternative, b]).allGroups).toBe(true);
    expect(() => retrievalMetrics(c, [a, a])).toThrow("invalid_selected_evidence");
  });
  it("scores candidates beyond the baseline cutoff and returns original evidence identities", async () => {
    const last = fixture.context.evidence.at(-1)!;
    const score = vi.fn(async (_question: string, e: Evidence) => result(e.id === last.id ? 1 : 0));
    const output = await rerank(fixture, score);
    expect(score).toHaveBeenCalledTimes(24); expect(output.selected).toHaveLength(12);
    expect(output.selected[0]).toEqual(last);
    expect(retrievalMetrics(fixture, fixture.context.evidence.filter(e => e.id === fixture.expectedGroups[0][0])).allGroups).toBe(true);
    expect(retrievalMetrics({ ...fixture, expectedGroups: [] }, []).allGroups).toBeNull();
  });
  it("rejects foreign scopes, duplicate IDs and tampered sources before scoring", async () => {
    for (const mode of ["owner", "artwork", "hash", "duplicate"]) {
      const c = structuredClone(fixture), e = c.context.evidence[0];
      if (mode === "owner") e.ownerId = c.context.exhibitionId;
      if (mode === "artwork") e.artworkId = c.context.exhibitionId;
      if (mode === "hash") e.body += "改";
      if (mode === "duplicate") c.context.evidence.push(e);
      const score = vi.fn(async () => result());
      await expect(rerank(c, score)).rejects.toThrow("invalid_context"); expect(score).not.toHaveBeenCalled();
    }
  });
  it("preserves whole excerpts and Unicode budget, ranks abstentions last", async () => {
    const c = structuredClone(fixture);
    c.context.evidence[0].body = "가".repeat(7900); c.context.evidence[0].contentHash = textHash(c.context.evidence[0].body);
    const output = await rerank(c, async (_q, e) => e.id === c.context.evidence.at(-1)!.id ?
      { type: "score", status: "abstained", value: null } : result(e.id === c.context.evidence[0].id ? 1 : .5));
    expect(output.selected.reduce((n, e) => n + [...e.body].length, 0)).toBeLessThanOrEqual(8000);
    expect(output.selected[0].body).toHaveLength(7900);
    expect(output.scores.at(-1)?.status).toBe("abstained");
  });
});
