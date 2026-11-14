import { describe, expect, it } from "vitest";
import { onboardingKeywordsSchema, setOnboardingMediaSchema, updateOnboardingSchema } from "../../src/lib/contracts/onboarding";
import { countExhibitions } from "../../src/lib/contracts/responses";

const keywords = { fields: ["동양화", "설치미술"], moods: ["차분한"], topics: ["자연"] };
const draft = { expectedRevision: 1, fullName: null, displayName: null, keywords, complete: false };

describe("artist onboarding", () => {
  it("accepts partial drafts and trims the names supplied for completion", () => {
    expect(updateOnboardingSchema.parse(draft)).toEqual(draft);
    expect(updateOnboardingSchema.parse({
      ...draft, fullName: " 홍길동 ", displayName: " 여백 ", complete: true,
      keywords: { fields: [], moods: [], topics: [] },
    })).toMatchObject({ fullName: "홍길동", displayName: "여백", complete: true });
  });

  it("reports each missing required name and rejects hidden or oversized names", () => {
    const result = updateOnboardingSchema.safeParse({ ...draft, complete: true });
    expect(result.error?.issues.map(issue => issue.path)).toEqual([["fullName"], ["displayName"]]);
    for (const fullName of [" ", "\u200b", "가\u0000", "가".repeat(101)]) {
      expect(updateOnboardingSchema.safeParse({ ...draft, fullName }).success).toBe(false);
    }
    expect(updateOnboardingSchema.safeParse({ ...draft, fullName: "🎨".repeat(100) }).success).toBe(true);
  });

  it("rejects extra fields and invalid, cross-category, or repeated keywords", () => {
    expect(updateOnboardingSchema.safeParse({ ...draft, email: "artist@example.com" }).success).toBe(false);
    expect(updateOnboardingSchema.safeParse({ ...draft, gender: "unknown" }).success).toBe(false);
    for (const fields of [["동양화", "동양화"], ["자연"], ["기타 "]]) {
      expect(onboardingKeywordsSchema.safeParse({ ...keywords, fields }).success).toBe(false);
    }
    expect(onboardingKeywordsSchema.safeParse({ ...keywords, extra: [] }).success).toBe(false);
  });

  it("requires an explicit media link or removal and a positive revision", () => {
    const materialId = "550e8400-e29b-41d4-a716-446655440000";
    expect(setOnboardingMediaSchema.parse({ expectedRevision: 1, materialId })).toEqual({ expectedRevision: 1, materialId });
    expect(setOnboardingMediaSchema.parse({ expectedRevision: 2, materialId: null })).toEqual({ expectedRevision: 2, materialId: null });
    expect(setOnboardingMediaSchema.safeParse({ expectedRevision: 1 }).success).toBe(false);
    expect(setOnboardingMediaSchema.safeParse({ expectedRevision: 1, materialId: "wrong" }).success).toBe(false);
    expect(setOnboardingMediaSchema.safeParse({ expectedRevision: 0, materialId }).success).toBe(false);
  });
});

describe("exhibition dashboard counts", () => {
  it("counts each exhibition by dashboard status and treats legacy rows as preparing", () => {
    expect(countExhibitions([
      { dashboardStatus: "ongoing" }, { dashboardStatus: "ended" }, {}, { dashboardStatus: "preparing" },
    ])).toEqual({ all: 4, preparing: 2, ongoing: 1, ended: 1 });
    expect(countExhibitions([])).toEqual({ all: 0, preparing: 0, ongoing: 0, ended: 0 });
  });
});
