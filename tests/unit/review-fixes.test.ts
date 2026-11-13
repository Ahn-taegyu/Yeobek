import { afterEach, describe, expect, it, vi } from "vitest";
import { authenticationError, databaseError } from "../../src/lib/api/errors";
import { assertSameOrigin, handleApi } from "../../src/lib/api/http";
import { createExhibitionSchema, profileSchema, section } from "../../src/lib/api/schemas";

const empty = { sections: [], sourceRefs: [] };
const draft = { id: "550e8400-e29b-41d4-a716-446655440000", title: "전시", ...empty };
afterEach(() => vi.unstubAllEnvs());

describe("reviewed input boundaries", () => {
  it.each([undefined, null, "", "  "])("allows absent draft artist name: %s", displayName => {
    const input = { ...empty, expectedRevision: 1, expectedDocumentRevision: 1, displayName };
    expect(profileSchema.parse(input).displayName).toBeNull();
  });
  it.each([
    { title: "\u0000" }, { title: "\u200b" }, { title: "\u0007" }, { title: "\ufe0f" },
    { startDate: "0000-01-01", endDate: "0000-01-02" },
    { startDate: "2026-02-30", endDate: "2026-03-01" },
    { sections: [{ id: "introduction", body: "본문\u0000" }] },
  ])("reports invalid input with fields instead of 500: %o", async fields => {
    const result = await handleApi(async () => createExhibitionSchema.parse({ ...draft, ...fields }));
    expect(result.status).toBe(400);
    const error = (await result.json()).error;
    expect(error).toMatchObject({ code: "INVALID_INPUT", retryable: false });
    expect(error.fields[Object.keys(fields)[0]]).toEqual(expect.arrayContaining([expect.any(String)]));
  });
  it("validates normalized Unicode length without destroying legacy replay input", () => {
    const body = "\u3000" + "😀".repeat(5000) + "\n";
    expect(section.parse({ id: "bio", body }).body).toBe(body);
    expect(section.safeParse({ id: "bio", body: "😀".repeat(5001) }).success).toBe(false);
  });
});

describe("actionable failures", () => {
  it.each(["22008", "22P05"])("classifies database input state %s as 400", code => {
    expect(databaseError({ code })).toMatchObject({ status: 400, code: "INVALID_INPUT", retryable: false });
  });
  it("distinguishes number, creation and source conflicts", () => {
    expect(databaseError({ code: "23505", message: 'duplicate key violates unique constraint "artworks_exhibition_id_number_key"' })).toMatchObject({ code: "DUPLICATE_NUMBER", fields: { number: expect.any(Array) } });
    expect(databaseError({ code: "23505", message: 'duplicate key violates unique constraint "artworks_active_number_key"' })).toMatchObject({ code: "DUPLICATE_NUMBER", fields: { number: expect.any(Array) } });
    expect(databaseError({ code: "23505", message: "Public artwork number is reserved" }).code).toBe("DUPLICATE_NUMBER");
    expect(databaseError({ code: "23505", message: "Artwork creation ID already used with different input" }).code).toBe("REQUEST_ID_CONFLICT");
    expect(databaseError({ code: "P1001" }).code).toBe("SOURCE_REVISION_CONFLICT");
    expect(databaseError({ code: "P1002" }).code).toBe("SOURCE_UNAVAILABLE");
    expect(databaseError({ code: "40001" }).code).toBe("REVISION_CONFLICT");
  });
  it("returns retry guidance without exposing provider details", async () => {
    const response = await handleApi(async () => { throw authenticationError({ status: 429 }); });
    expect(response.headers.get("Retry-After")).toBe("60");
    expect((await response.json()).error).toMatchObject({ code: "RATE_LIMITED", retryable: true, retryAfter: 60 });
    expect(authenticationError({ status: 400 }, "로그인 실패", "INVALID_CREDENTIALS").code).toBe("INVALID_CREDENTIALS");
  });
  it.each(["", "not-a-url", "file:///tmp"])("requires valid configured HTTP origin for production mutations: %s", origin => {
    vi.stubEnv("NODE_ENV", "production"); vi.stubEnv("APP_ORIGIN", origin);
    expect(() => assertSameOrigin(new Request("https://example.test/api", { headers: { origin: "https://example.test" } })))
      .toThrow(expect.objectContaining({ status: 503, code: "SERVER_CONFIGURATION_ERROR", retryable: false }));
  });
});
