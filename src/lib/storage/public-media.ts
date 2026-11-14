import "server-only";
import { createHash } from "node:crypto";
import { z } from "zod";
import { rpc } from "../api/db";
import { ApiError } from "../api/errors";
import { decodeDatabase } from "../api/publication";
import { createWorkerSupabase } from "../supabase/worker";
import { mediaBinary, publicMediaReferences } from "../contracts/media";
import { isMockMode } from "../ai/routing";
import { normalizeAiOutcome } from "../ai/outcome";
import { readMaterialResponse } from "./validate";

const metadata = z.strictObject({ publicationId: z.uuid(), exhibitionId: z.uuid(), artworkId: z.uuid(),
  version: z.number().int().positive(), kind: z.enum(["image", "audio", "poster"]),
  bucket: z.enum(["artist-materials", "artist-audio"]), storageKey: z.string().min(1),
  contentType: z.enum(["image/png", "image/jpeg", "image/webp", "audio/mpeg"]),
  byteSize: z.number().int().positive().max(mediaBinary.maxBytes), contentHash: z.string().regex(/^[a-f0-9]{64}$/), mock: z.boolean() });
const unavailable = () => new ApiError(404, "NOT_FOUND", "공개된 파일을 찾을 수 없습니다.");
/** Internal distinction: only absent metadata may trigger on-demand synthesis. */
export class MissingPublicMedia extends ApiError {
  constructor() { super(404, "NOT_FOUND", "공개된 파일을 찾을 수 없습니다."); }
}

export function publicMediaMockMode() {
  try { return isMockMode(); }
  catch (error) {
    const failure = normalizeAiOutcome(error);
    throw new ApiError(failure.status, failure.code, "음성 제공 설정을 확인해 주세요.");
  }
}

export async function attachPublicMedia<T extends { publicationId: string }>(artworks: T[]) {
  const refs = new Map<string, z.infer<typeof publicMediaReferences>>();
  try {
    const worker = createWorkerSupabase({ timeoutMs: 15_000 });
    const mock = publicMediaMockMode();
    for (let offset = 0; offset < artworks.length; offset += 1000) {
      const values = decodeDatabase(z.array(publicMediaReferences), await rpc(worker, "get_public_media_refs", {
        p_publication_ids: artworks.slice(offset, offset + 1000).map(work => work.publicationId), p_mock: mock,
      }));
      for (const value of values) refs.set(value.publicationId, value);
    }
  } catch {
    // Existing public text remains usable if optional media cannot be resolved.
    // Never substitute a raw Storage path or an unchecked reference.
    refs.clear();
    console.error("public_media_references_unavailable");
  }
  return artworks.map(work => ({ ...work, image: refs.get(work.publicationId)?.image ?? null,
    audio: refs.get(work.publicationId)?.audio ?? null }));
}

/** Resolve optional answer media after loading/revalidating the saved reply.
 * A retry refreshes references instead of persisting a file pointer in answer history. */
export async function attachVisitorImage<T extends { publication: { publicationId: string; artworkId?: string | null } | null }>(reply: T) {
  if (!reply.publication || reply.publication.artworkId === null) return { ...reply, image: null };
  const [media] = await attachPublicMedia([reply.publication]);
  return { ...reply, image: media.image };
}

/** No redirect or public signed URL: every delivery checks the current snapshot
 * before fetching bytes and immediately before returning them. */
export async function readPublicMedia(id: string, kind: "image" | "audio" | "poster", signal?: AbortSignal) {
  const publicationId = id.toLowerCase();
  const worker = createWorkerSupabase({ timeoutMs: 15_000 });
  const mock = publicMediaMockMode();
  const load = async (initial = false) => {
    const raw = await rpc(worker, "get_public_media", { p_publication_id: publicationId, p_kind: kind, p_mock: mock });
    if (!raw) throw initial ? new MissingPublicMedia() : unavailable();
    return decodeDatabase(metadata, raw);
  };
  const source = await load(true);
  if (source.publicationId !== publicationId || source.kind !== kind ||
    (kind === "audio" ? source.bucket !== "artist-audio" || source.contentType !== "audio/mpeg" || source.byteSize > 8 * 1024 * 1024
      : source.bucket !== "artist-materials" || !source.contentType.startsWith("image/"))) throw unavailable();
  const signed = await worker.storage.from(source.bucket).createSignedUrl(source.storageKey, 30);
  if (signed.error || !signed.data) throw unavailable();
  const timeout = AbortSignal.timeout(15_000);
  const requestSignal = signal ? AbortSignal.any([signal, timeout]) : timeout;
  const assertActive = () => {
    if (signal?.aborted) throw new ApiError(499, "REQUEST_CANCELLED", "파일 요청이 취소되었습니다.");
    if (timeout.aborted) throw new ApiError(504, "REQUEST_TIMEOUT", "파일 응답 시간이 초과되었습니다.");
  };
  let bytes: Uint8Array;
  try {
    assertActive();
    const response = await fetch(signed.data.signedUrl, { cache: "no-store", redirect: "error", signal: requestSignal });
    if (!response.ok || response.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== source.contentType) {
      await response.body?.cancel().catch(() => {});
      throw unavailable();
    }
    bytes = await readMaterialResponse(response, source.byteSize);
  } catch (error) {
    assertActive();
    if (error instanceof ApiError) throw unavailable();
    throw new ApiError(503, "STORAGE_UNAVAILABLE", "파일을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.");
  }
  if (bytes.length !== source.byteSize || createHash("sha256").update(bytes).digest("hex") !== source.contentHash) throw unavailable();
  const current = await load();
  if (current.storageKey !== source.storageKey || current.contentHash !== source.contentHash) throw unavailable();
  assertActive();
  return new Response(bytes.buffer as ArrayBuffer, { headers: { "Content-Type": source.contentType,
    "Content-Length": String(bytes.length), "X-Yeobek-Mock": String(source.mock) } });
}
