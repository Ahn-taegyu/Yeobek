import { createHash } from "node:crypto";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({ rpc: vi.fn(), sign: vi.fn() }));
vi.mock("@/lib/api/db", () => ({ rpc: mocks.rpc }));
vi.mock("@/lib/api/publication", () => ({ decodeDatabase: (schema: { parse: (value: unknown) => unknown }, raw: unknown) => schema.parse(raw) }));
vi.mock("@/lib/supabase/worker", () => ({ createWorkerSupabase: () => ({ storage: { from: () => ({ createSignedUrl: mocks.sign }) } }) }));
import { attachPublicMedia, readPublicMedia } from "@/lib/storage/public-media";
import { handleApi } from "@/lib/api/http";

const id = "00000000-0000-4000-8000-000000000001";
const bytes = Uint8Array.from([1, 2, 3]);
const metadata = { publicationId: id, exhibitionId: id, artworkId: id, version: 1, kind: "image",
  bucket: "artist-materials", storageKey: `${id}/private.png`, contentType: "image/png", byteSize: bytes.length,
  contentHash: createHash("sha256").update(bytes).digest("hex"), mock: false };
const fetching = vi.fn<typeof fetch>();
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("AI_PROVIDER_MODE", "live");
  vi.stubGlobal("fetch", fetching);
  mocks.rpc.mockResolvedValue(metadata);
  mocks.sign.mockResolvedValue({ data: { signedUrl: "https://storage.example.invalid/signed" }, error: null });
  fetching.mockImplementation(async () => new Response(bytes, { headers: { "Content-Type": "image/png" } }));
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

it("returns exact bytes only after rechecking and keeps binary privacy headers", async () => {
  const response = await handleApi(() => readPublicMedia(id, "image"));
  expect(response.status).toBe(200);
  expect(response.headers.get("content-type")).toBe("image/png");
  expect(response.headers.get("cache-control")).toContain("no-store");
  expect(response.headers.get("x-content-type-options")).toBe("nosniff");
  expect(response.headers.get("x-request-id")).toBeTruthy();
  expect(response.headers.has("location")).toBe(false);
  expect(new Uint8Array(await response.arrayBuffer())).toEqual(bytes);
  expect(mocks.rpc).toHaveBeenCalledTimes(2);
});
it("blocks a publication that closes while its bytes are being fetched", async () => {
  mocks.rpc.mockResolvedValueOnce(metadata).mockResolvedValueOnce(null);
  const response = await handleApi(() => readPublicMedia(id, "image"));
  expect(response.status).toBe(404);
  expect(await response.json()).toMatchObject({ error: { code: "NOT_FOUND" } });
});
it("does not release bytes with a mismatched content hash", async () => {
  fetching.mockResolvedValue(new Response(new Uint8Array([3, 2, 1]), { headers: { "Content-Type": "image/png" } }));
  await expect(readPublicMedia(id, "image")).rejects.toMatchObject({ status: 404 });
});
it("bounds actual bytes even when Content-Length is absent", async () => {
  fetching.mockResolvedValue(new Response(new Uint8Array([1, 2, 3, 4]), { headers: { "Content-Type": "image/png" } }));
  await expect(readPublicMedia(id, "image")).rejects.toMatchObject({ status: 404 });
});
it("passes live mode to the trusted gate and cannot sign a hidden mock asset", async () => {
  mocks.rpc.mockResolvedValue(null);
  await expect(readPublicMedia(id, "audio")).rejects.toMatchObject({ status: 404 });
  expect(mocks.rpc).toHaveBeenCalledWith(expect.anything(), "get_public_media", { p_publication_id: id, p_kind: "audio", p_mock: false });
  expect(mocks.sign).not.toHaveBeenCalled();
});
it("maps cancellation to the shared JSON error contract", async () => {
  const controller = new AbortController(); controller.abort();
  const response = await handleApi(() => readPublicMedia(id, "image", controller.signal));
  expect(response.status).toBe(499);
  expect(await response.json()).toMatchObject({ error: { code: "REQUEST_CANCELLED" } });
  expect(fetching).not.toHaveBeenCalled();
});
it("normalizes valid uppercase publication IDs before comparing server metadata", async () => {
  const lower = "aaaaaaaa-0000-4000-8000-000000000001";
  mocks.rpc.mockResolvedValue({ ...metadata, publicationId: lower });
  expect((await readPublicMedia(lower.toUpperCase(), "image")).status).toBe(200);
});
it("preserves public text with null media references during a media lookup outage", async () => {
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  mocks.rpc.mockRejectedValue(new Error("private storage diagnostics"));
  expect(await attachPublicMedia([{ publicationId: id, title: "공개 작품" }])).toEqual([
    { publicationId: id, title: "공개 작품", image: null, audio: null },
  ]);
  expect(log).toHaveBeenCalledWith("public_media_references_unavailable");
  log.mockRestore();
});

it("serves a poster through the same hash and live-publication checks", async () => {
  mocks.rpc.mockResolvedValue({ ...metadata, kind: "poster" });
  const response = await readPublicMedia(id, "poster");
  expect(new Uint8Array(await response.arrayBuffer())).toEqual(bytes);
  expect(mocks.rpc).toHaveBeenCalledTimes(2);
  expect(mocks.rpc).toHaveBeenCalledWith(expect.anything(), "get_public_media",
    { p_publication_id: id, p_kind: "poster", p_mock: false });
});
it("withholds poster bytes when the publication is revoked during download", async () => {
  mocks.rpc.mockResolvedValueOnce({ ...metadata, kind: "poster" }).mockResolvedValueOnce(null);
  await expect(readPublicMedia(id, "poster")).rejects.toMatchObject({ status: 404 });
});
