import { describe, expect, it } from "vitest";
import { z } from "zod";
import { databaseError } from "../../src/lib/api/errors";
import { readJson, MAX_JSON_BYTES } from "../../src/lib/api/http";
import { AUTHORING_JSON_BYTES, SECTION_IDS, sectionDefinitions, MAX_SECTIONS } from "../../src/lib/contracts/knowledge-sections";
import { section } from "../../src/lib/contracts/requests";
import { createExhibitionBody, createArtworkBody, reorderArtworksSchema } from "../../src/lib/contracts/authoring";

const id = "550e8400-e29b-41d4-a716-446655440000";
const base = { id, sections: [], sourceRefs: [] };

describe("P0 authoring input boundaries", () => {
  it("maps a draft number collision to the existing inline number error", () => {
    expect(databaseError({ code: "23505", message: 'duplicate key violates constraint "artworks_active_draft_number_key"' })).toMatchObject({
      status: 409, code: "DUPLICATE_NUMBER", fields: { number: expect.any(Array) },
    });
  });
  it("keeps legacy title/date validation and permits explicit partial drafts", () => {
    expect(createExhibitionBody.safeParse(base).success).toBe(false);
    expect(createExhibitionBody.parse({ ...base, draft: true, startDate: "2026-11-15" })).toMatchObject({
      title: null, startDate: "2026-11-15", endDate: null, startTime: null, endTime: null,
    });
    expect(createExhibitionBody.safeParse({ ...base, title: "전시", startDate: "2026-11-15" }).success).toBe(false);
    expect(createExhibitionBody.safeParse({ ...base, draft: true, startDate: "2026-11-16", endDate: "2026-11-15" }).success).toBe(true);
    expect(createExhibitionBody.safeParse({ ...base, draft: true, title: "\u200b" }).success).toBe(false);
  });
  it("accepts only minute precision civil times and no invalid calendar date", () => {
    for (const startTime of ["24:00", "12:60", "12:00:00", "9:00", "12:00Z"]) {
      expect(createExhibitionBody.safeParse({ ...base, draft: true, startTime }).success).toBe(false);
    }
    expect(createExhibitionBody.safeParse({ ...base, draft: true, startDate: "2026-02-30" }).success).toBe(false);
    expect(createExhibitionBody.parse({ ...base, draft: true, startTime: "00:00", endTime: "23:59" })).toMatchObject({ startTime: "00:00", endTime: "23:59" });
  });
  it("requires explicit artwork draft mode for a generated number and empty title", () => {
    expect(createArtworkBody.safeParse(base).success).toBe(false);
    expect(createArtworkBody.parse({ ...base, draft: true, title: "   ", dimensionsUnit: "cm" })).toMatchObject({ title: null, number: null, dimensionsUnit: "cm" });
    expect(createArtworkBody.safeParse({ ...base, draft: true, number: 0 }).success).toBe(false);
  });
  it("keeps duplicate-label questions distinct and applies the central Unicode length limit", () => {
    const methods = sectionDefinitions.artist.filter(item => item.label === "표현 방식");
    expect(methods).toHaveLength(2);
    expect(new Set(methods.map(item => item.id)).size).toBe(2);
    expect(new Set(methods.map(item => item.prompt)).size).toBe(2);
    expect(new Set(SECTION_IDS).size).toBe(SECTION_IDS.length);
    expect(MAX_SECTIONS).toBe(Math.max(...Object.values(sectionDefinitions).map(items => items.length)));
    expect(section.safeParse({ id: "artist_methods", body: "🎨".repeat(5000) }).success).toBe(true);
    expect(section.safeParse({ id: "artist_methods", body: "🎨".repeat(5001) }).success).toBe(false);
    expect(section.safeParse({ id: "invented", body: "text" }).success).toBe(false);
  });
  it("rejects duplicate reorder IDs even when letter case differs", () => {
    const uuid = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    expect(reorderArtworksSchema.safeParse({ items: [{ id: uuid, expectedRevision: 1 }, { id: uuid.toUpperCase(), expectedRevision: 1 }] }).success).toBe(false);
  });
  it("extends only opted-in JSON reads and still enforces the actual byte cap", async () => {
    const request = (body: string) => new Request("http://localhost/api/admin/profile", {
      method: "POST", headers: { "Content-Type": "application/json", "Content-Length": "2" }, body,
    });
    const body = JSON.stringify({ text: "가".repeat(MAX_JSON_BYTES) });
    await expect(readJson(request(body), z.object({ text: z.string() }))).rejects.toMatchObject({ status: 413 });
    await expect(readJson(request(body), z.object({ text: z.string() }), AUTHORING_JSON_BYTES)).resolves.toHaveProperty("text");
    await expect(readJson(request(JSON.stringify({ text: "a".repeat(AUTHORING_JSON_BYTES) })), z.object({ text: z.string() }), AUTHORING_JSON_BYTES)).rejects.toMatchObject({ status: 413 });
  });
});
