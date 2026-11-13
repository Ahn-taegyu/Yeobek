import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError, authenticationError, databaseError } from "../../src/lib/api/errors";
import { assertSameOrigin, handleApi, MAX_JSON_BYTES, readJson } from "../../src/lib/api/http";
import { createArtworkSchema, createExhibitionSchema, emptySchema, profileSchema, updateExhibitionSchema } from "../../src/lib/api/schemas";

const id = "550e8400-e29b-41d4-a716-446655440000";
const knowledge = { sections: [], sourceRefs: [] };
const exhibition = { id, title: "전시", ...knowledge };
const artwork = { id, title: "작품", number: 1, ...knowledge };
const jsonRequest = (body: string, headers: Record<string, string> = {}) => new Request("https://example.test/api", {
  method: "POST", headers: { "content-type": "application/json", ...headers }, body,
});

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });

describe("mutation origin", () => {
  it("rejects missing, different and explicitly cross-site origins", () => {
    const cases: Record<string, string>[] = [{}, { origin: "https://evil.test" }, { origin: "https://example.test", "sec-fetch-site": "cross-site" }];
    for (const headers of cases) {
      expect(() => assertSameOrigin(new Request("https://example.test/api", { headers }))).toThrow(ApiError);
    }
  });
  it("accepts the configured same origin", () => {
    vi.stubEnv("APP_ORIGIN", "https://example.test");
    expect(() => assertSameOrigin(new Request("https://example.test/api", { headers: { origin: "https://example.test" } }))).not.toThrow();
  });
});

describe("JSON input boundary", () => {
  it("checks actual bytes even if Content-Length lies", async () => {
    const body = JSON.stringify({ text: "가".repeat(Math.ceil(MAX_JSON_BYTES / 3)) });
    await expect(readJson(jsonRequest(body, { "content-length": "2" }), emptySchema)).rejects.toMatchObject({ status: 413, code: "TOO_LARGE" });
  });
  it("rejects truncated JSON", async () => {
    await expect(readJson(jsonRequest('{"title":'), emptySchema)).rejects.toMatchObject({ status: 400, code: "INVALID_INPUT" });
  });
});

describe("untrusted resource input", () => {
  it("rejects injected ownership and state fields", () => {
    expect(createExhibitionSchema.safeParse({ ...exhibition, ownerId: id }).success).toBe(false);
    expect(createArtworkSchema.safeParse({ ...artwork, state: "published" }).success).toBe(false);
  });
  it("requires UUIDs, positive integer revisions and valid artwork numbers", () => {
    expect(createExhibitionSchema.safeParse({ ...exhibition, id: "not-uuid" }).success).toBe(false);
    const profile = { displayName: "작가", ...knowledge, expectedRevision: 1, expectedDocumentRevision: 1 };
    expect(profileSchema.safeParse(profile).success).toBe(true);
    for (const version of [0, -1, 1.5, 2147483648]) {
      expect(profileSchema.safeParse({ ...profile, expectedRevision: version }).success).toBe(false);
      expect(profileSchema.safeParse({ ...profile, expectedDocumentRevision: version }).success).toBe(false);
    }
    for (const number of [0, -1, 1.5, 10000, "1"]) {
      expect(createArtworkSchema.safeParse({ ...artwork, number }).success).toBe(false);
    }
    expect(createArtworkSchema.safeParse(artwork).success).toBe(true);
  });
});

describe("response boundary", () => {
  it("hides unknown database and unexpected errors", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const secret = "private database detail";
    const response = await handleApi(async () => { throw new Error(secret); });
    expect(response.status).toBe(500);
    expect(JSON.stringify(await response.json())).not.toContain(secret);
    expect(databaseError({ code: secret })).toMatchObject({ status: 500, code: "INTERNAL_ERROR" });
  });
  it.each([[true, 201], [false, 200]])("uses created flag %s for status %s and strips it", async (created, status) => {
    const response = await handleApi(async () => ({ _created: created, document_id: id, nested_data: [{ source_revision: 2 }] }));
    expect(response.status).toBe(status);
    const body = await response.json();
    expect(body.data).toEqual({ documentId: id, nestedData: [{ sourceRevision: 2 }] });
    expect(body.requestId).toMatch(/^[0-9a-f-]{36}$/);
    expect(response.headers.get("x-request-id")).toBe(body.requestId);
    expect(response.headers.get("cache-control")).toContain("no-store");
  });
});

describe("authentication failures", () => {
  it.each([
    [{ status: 500 }, 503, "SERVICE_UNAVAILABLE"],
    [{ name: "AuthRetryableFetchError" }, 503, "SERVICE_UNAVAILABLE"],
    [{ status: 429 }, 429, "RATE_LIMITED"],
    [{ name: "AuthSessionMissingError", status: 400 }, 401, "UNAUTHENTICATED"],
  ])("maps %o to %i", (error, status, code) => {
    expect(authenticationError(error)).toMatchObject({ status, code });
  });
});

describe("exhibition dates", () => {
  const update = { title: "전시", ...knowledge, expectedRevision: 1, expectedDocumentRevision: 1 };
  it.each([
    ["create", createExhibitionSchema, exhibition],
    ["update", updateExhibitionSchema, update],
  ])("validates date pairs on %s and returns field errors", async (_name, schema, input) => {
    expect(schema.safeParse(input).success).toBe(true);
    for (const [dates, field] of [
      [{ startDate: "2026-11-01" }, "endDate"],
      [{ endDate: "2026-11-30" }, "startDate"],
      [{ startDate: "2026-11-30", endDate: "2026-11-01" }, "endDate"],
    ] as const) {
      const response = await handleApi(async () => schema.parse({ ...input, ...dates }));
      const body = await response.json();
      expect(response.status).toBe(400);
      expect(body.error.code).toBe("INVALID_INPUT");
      expect(body.error.fields[field]).toBeDefined();
    }
  });
});

describe("source reference limits", () => {
  it("bounds the number of references and material page numbers", () => {
    const ref = { sectionId: "introduction", kind: "direct" };
    expect(createExhibitionSchema.safeParse({ ...exhibition, sourceRefs: Array(24).fill(ref) }).success).toBe(true);
    expect(createExhibitionSchema.safeParse({ ...exhibition, sourceRefs: Array(25).fill(ref) }).success).toBe(false);
    const material = { sectionId: "introduction", kind: "material", materialId: id };
    expect(createExhibitionSchema.safeParse({ ...exhibition, sourceRefs: [{ ...material, pageStart: 2147483647 }] }).success).toBe(true);
    expect(createExhibitionSchema.safeParse({ ...exhibition, sourceRefs: [{ ...material, pageEnd: 2147483648 }] }).success).toBe(false);
  });
});
