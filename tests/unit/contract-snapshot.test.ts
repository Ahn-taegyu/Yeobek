import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { requestApi } from "../../src/lib/client";
import { apiErrorEnvelope } from "../../src/lib/contracts/responses";
import { routes, type RouteContract } from "../../src/lib/contracts/routes";

const routeRoot = "src/app/api";
const requestId = "550e8400-e29b-41d4-a716-446655440000";

describe("HTTP route contracts", () => {
  it("covers every implemented method and path", () => {
    const methods = /export (?:async )?function (GET|POST|PATCH|DELETE|PUT|HEAD|OPTIONS)\(/g;
    const actual = readdirSync(routeRoot, { recursive: true, encoding: "utf8" })
      .filter(file => /[/\\]?route\.ts$/.test(file))
      .flatMap(file => {
        const fullPath = join(routeRoot, file);
        const path = relative("src/app", fullPath).replaceAll("\\", "/").replace(/\/route\.ts$/, "")
          .replace(/\[(\w+)\]/g, "{$1}");
        return Array.from(readFileSync(fullPath, "utf8").matchAll(methods), ([, method]) => `${method} /${path}`)
          // HEAD explicitly rejects the side-effecting purge; it is not a callable API operation.
          .filter(route => route !== "HEAD /api/cron/purge");
      });
    expect(Object.values(routes).map(({ method, path }) => `${method} ${path}`).sort()).toEqual(actual.sort());
  });

  it("snapshots the shared HTTP error envelope", () => {
    expect(z.toJSONSchema(apiErrorEnvelope)).toMatchSnapshot();
  });

  for (const [name, entry] of Object.entries(routes)) {
    const route: RouteContract = entry;
    it(`snapshots ${name}`, () => {
      expect({
        method: route.method,
        path: route.path,
        statuses: route.statuses,
        // Input mode exports pre-transform JSON for trim, optional nullable fields and defaults.
        params: route.params ? z.toJSONSchema(route.params, { io: "input" }) : null,
        ...(route.query ? { query: z.toJSONSchema(route.query, { io: "input" }) } : {}),
        body: route.body ? z.toJSONSchema(route.body, { io: "input" }) : null,
        ...(route.bodyEncoding ? { bodyEncoding: route.bodyEncoding } : {}),
        response: route.binary ? { binary: route.binary } : z.toJSONSchema(route.response, { io: "output" }),
      }).toMatchSnapshot();
    });
  }
});

describe("typed fetch client", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("sends original wire values and returns a validated envelope", async () => {
    const fetch = vi.fn().mockResolvedValue(Response.json({ data: { authenticated: true }, requestId }));
    vi.stubGlobal("fetch", fetch);
    const body = { email: "artist@example.test", password: " original " };
    await expect(requestApi("login", { body })).resolves.toEqual({ data: { authenticated: true }, requestId });
    expect(fetch).toHaveBeenCalledWith("/api/auth/login", expect.objectContaining({
      method: "POST", credentials: "same-origin", body: JSON.stringify(body),
    }));
  });

  it("encodes validated query parameters and rejects invalid queries before fetch", async () => {
    const fetch = vi.fn().mockResolvedValue(Response.json({ data: [], requestId }));
    vi.stubGlobal("fetch", fetch);
    await requestApi("listMaterials", { query: { subjectType: "artwork", subjectId: requestId } });
    expect(fetch).toHaveBeenCalledWith(`/api/admin/materials?subjectType=artwork&subjectId=${requestId}`, expect.anything());
    await expect(requestApi("listMaterials", { query: { subjectType: "artwork", subjectId: "../private" } }))
      .rejects.toMatchObject({ code: "INVALID_INPUT" });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("reads the publication checklist through the typed client envelope", async () => {
    const data = { exhibitionId: requestId, revision: 1,
      exhibitionBlockingCodes: ["PLACE_REQUIRED"],
      artworks: [{ artworkId: requestId, revision: 2, blockingCodes: ["NARRATION_REQUIRED"] }] };
    const fetch = vi.fn().mockResolvedValue(Response.json({ data, requestId }));
    vi.stubGlobal("fetch", fetch);
    await expect(requestApi("getPublicationChecklist", { params: { id: requestId } }))
      .resolves.toEqual({ data, requestId });
    expect(fetch).toHaveBeenCalledWith(`/api/admin/exhibitions/${requestId}/publication`,
      expect.objectContaining({ method: "GET" }));
  });

  it("preserves structured API errors and rejects invalid success data", async () => {
    const error = { code: "NOT_FOUND", message: "자료를 찾을 수 없습니다.", retryable: false };
    const fetch = vi.fn().mockResolvedValueOnce(Response.json({ error, requestId }, { status: 404 }))
      .mockResolvedValueOnce(Response.json({ data: { status: "other" }, requestId }));
    vi.stubGlobal("fetch", fetch);
    await expect(requestApi("getArtwork", { params: { id: requestId } })).rejects.toMatchObject({
      ...error, status: 404, requestId,
    });
    expect(fetch).toHaveBeenCalledWith(`/api/admin/artworks/${requestId}`, expect.anything());
    await expect(requestApi("health")).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
  });

  it("validates the MIME of the requested media kind and keeps JSON errors", async () => {
    const bytes = new Uint8Array([1, 2, 3]);
    const fetch = vi.fn()
      .mockResolvedValueOnce(new Response(bytes, { headers: { "Content-Type": "audio/mpeg" } }))
      .mockResolvedValueOnce(new Response(bytes, { headers: { "Content-Type": "image/png" } }))
      .mockResolvedValueOnce(Response.json({
        error: { code: "NOT_FOUND", message: "자료를 찾을 수 없습니다.", retryable: false }, requestId,
      }, { status: 404 }));
    vi.stubGlobal("fetch", fetch);
    const getAudio = () => requestApi("getMedia", { params: { id: requestId }, query: { kind: "audio" } });
    const audio = await getAudio();
    expect(audio).toBeInstanceOf(Blob);
    expect(audio.type).toBe("audio/mpeg");
    expect(new Uint8Array(await audio.arrayBuffer())).toEqual(bytes);
    expect(fetch).toHaveBeenCalledWith(`/api/media/${requestId}?kind=audio`, expect.objectContaining({
      credentials: "same-origin", cache: "no-store",
    }));
    await expect(getAudio()).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
    await expect(getAudio()).rejects.toMatchObject({ code: "NOT_FOUND", status: 404, requestId });
  });

  it("rejects oversized media even without a content length", async () => {
    const chunk = new Uint8Array(1024 * 1024);
    let reads = 0;
    const cancel = vi.fn();
    const stream = new ReadableStream({
      pull(controller) { reads++; controller.enqueue(chunk); },
      cancel,
    });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(stream, { headers: { "Content-Type": "image/png" } })));
    await expect(requestApi("getMedia", { params: { id: requestId }, query: { kind: "image" } }))
      .rejects.toMatchObject({ code: "INVALID_RESPONSE" });
    expect(cancel).toHaveBeenCalledOnce();
    expect(reads).toBeLessThanOrEqual(52);
  });
  it("rejects non-JSON errors without exposing raw response text", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("private upstream content", { status: 502 })));
    await expect(requestApi("health")).rejects.toMatchObject({
      status: 502, code: "INVALID_RESPONSE", message: "서버 응답을 확인하지 못했습니다.",
    });
  });

  it("propagates cancellation without converting it to a retryable network error", async () => {
    const controller = new AbortController();
    const reason = new DOMException("Request cancelled", "AbortError");
    vi.stubGlobal("fetch", vi.fn().mockImplementation((_url, { signal }) => {
      controller.abort(reason);
      signal.throwIfAborted();
    }));
    await expect(requestApi("health", { signal: controller.signal })).rejects.toBe(reason);
  });
});
