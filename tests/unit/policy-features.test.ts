import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { DEFAULT_POLICIES, parsePolicies } from "../../src/lib/policy";
import { getFeatures, requireFeature } from "../../src/lib/features";

describe("application policies", () => {
  it("keeps migration seed and typed defaults aligned", () => {
    const sql = ["20261114020000_app_policies.sql", "20261114030000_ai_jobs.sql", "20261114040000_evidence_approval.sql", "20261114060000_material_uploads.sql"]
      .map(file => readFileSync(`supabase/migrations/${file}`, "utf8")).join("\n");
    const seeded = Object.fromEntries(Array.from(sql.matchAll(/\('([a-z_]+)',\s*(\d+)\)/g), ([, key, value]) => [key, Number(value)]));
    expect(seeded).toEqual(DEFAULT_POLICIES);
  });
  it("validates stored limits without silently replacing invalid configuration", () => {
    expect(parsePolicies({ ...DEFAULT_POLICIES, visitor_requests_per_minute: 2 }).visitor_requests_per_minute).toBe(2);
    for (const value of [0, -1, 1.5, "6", undefined, Number.MAX_SAFE_INTEGER]) {
      expect(() => parsePolicies({ ...DEFAULT_POLICIES, visitor_requests_per_minute: value })).toThrow();
    }
  });
});
describe("server feature settings", () => {
  it("isolates optional features and rejects disabled routes", () => {
    const features = getFeatures({ FEATURE_GAPS: "false", FEATURE_VOICE_REQUIRED: "false" });
    expect(features).toEqual({ gaps: false, voiceRequired: false, followUpQuestions: true, opsAggregation: true });
    expect(() => requireFeature("gaps", features)).toThrowError(expect.objectContaining({ status: 404 }));
    expect(() => requireFeature("followUpQuestions", features)).not.toThrow();
  });
  it("rejects misspelled flags rather than silently exposing a disabled feature", () => {
    for (const value of ["flase", "", "   "]) {
      expect(() => getFeatures({ FEATURE_GAPS: value })).toThrowError(expect.objectContaining({ status: 503 }));
    }
  });
});
