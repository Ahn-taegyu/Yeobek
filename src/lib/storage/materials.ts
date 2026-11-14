import "server-only";
import { createHash } from "node:crypto";
import { z } from "zod";
import { rpc, type DbClient } from "../api/db";
import { ApiError } from "../api/errors";
import { decodeDatabase } from "../api/publication";
import { materialByteLimits, materialResponse, materialStagingBuckets, requestUploadSchema } from "../contracts/materials";
import { rpcArgs } from "../api/schemas";
import { createWorkerSupabase } from "../supabase/worker";
import { readMaterialResponse, validateMaterialFile } from "./validate";

const FINAL = "artist-materials";
const uploadRecord = z.object({ material: materialResponse, created: z.boolean(),
  stagingKey: z.string().nullable(), finalKey: z.string().nullable(), uploadExpiresAt: z.string().nullable() });
type UploadRecord = z.infer<typeof uploadRecord>;
const unavailable = () => new ApiError(503, "STORAGE_UNAVAILABLE", "파일 저장소에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.");
const incomplete = () => new ApiError(409, "UPLOAD_INCOMPLETE", "파일 전송이 완료되지 않았습니다.");
const workerClient = () => createWorkerSupabase({ timeoutMs: 15_000 });
class StagingMissing extends ApiError {
  constructor() { super(409, "UPLOAD_INCOMPLETE", "파일 전송이 완료되지 않았습니다."); }
}

async function loadUpload(worker: DbClient, ownerId: string, id: string, cleanup = false) {
  return decodeDatabase(uploadRecord, await rpc(worker, "get_upload", { p_owner: ownerId, p_id: id, p_allow_cleanup: cleanup }));
}

async function signedDownload(worker: DbClient, bucket: string, key: string) {
  const { data, error } = await worker.storage.from(bucket).createSignedUrl(key, 60);
  if (error) {
    if (error.status === 404 || error.statusCode === "404" || error.statusCode === "NoSuchKey") throw new StagingMissing();
    throw unavailable();
  }
  if (!data) throw unavailable();
  return data.signedUrl;
}

async function downloadBytes(worker: DbClient, bucket: string, key: string, maxBytes: number) {
  const url = await signedDownload(worker, bucket, key);
  let response: Response;
  try { response = await fetch(url, { cache: "no-store", redirect: "error", signal: AbortSignal.timeout(15_000) }); }
  catch { throw unavailable(); }
  if (!response.ok) {
    await response.body?.cancel().catch(() => {});
    if (response.status === 404) throw new StagingMissing();
    throw unavailable();
  }
  return readMaterialResponse(response, maxBytes);
}

/** The browser receives a capability for the temporary key only, never the final key. */
export async function requestMaterialUpload(ownerId: string, input: z.infer<typeof requestUploadSchema>) {
  const worker = workerClient();
  const record = decodeDatabase(uploadRecord, await rpc(worker, "request_upload", { p_owner: ownerId, ...rpcArgs(input) }));
  if (record.material.state === "ready") return { material: record.material, upload: null, _created: false };
  if (!record.stagingKey || !record.uploadExpiresAt) throw unavailable();
  if (record.material.kind === "text") throw unavailable();
  const bucket = materialStagingBuckets[record.material.kind];
  const { data, error } = await worker.storage.from(bucket).createSignedUploadUrl(record.stagingKey, { upsert: false });
  if (error || !data) throw unavailable();
  return { material: record.material, upload: { signedUrl: data.signedUrl, token: data.token,
    path: data.path, bucket, expiresAt: record.uploadExpiresAt }, _created: record.created };
}

/** Bounded download, full decode, then write those exact validated bytes to an immutable key. */
export async function completeMaterialUpload(ownerId: string, id: string, expectedVersion: number) {
  const worker = workerClient();
  const record = await loadUpload(worker, ownerId, id);
  const material = record.material;
  if (material.version !== expectedVersion) throw new ApiError(409, "REVISION_CONFLICT", "자료 버전이 변경되었습니다.");
  if (material.state === "ready") return material;
  if (!record.stagingKey || !record.finalKey || !material.contentType || !material.byteSize || material.kind === "text") throw incomplete();
  if (material.byteSize > materialByteLimits[material.kind]) {
    throw new ApiError(400, "INVALID_FILE", "자료 종류별 파일 크기 한도를 확인해 주세요.");
  }
  let bytes: Uint8Array;
  try {
    try { bytes = await downloadBytes(worker, materialStagingBuckets[material.kind], record.stagingKey, material.byteSize); }
    catch (error) {
      if (material.kind !== "pdf" || !(error instanceof StagingMissing)) throw error;
      bytes = await downloadBytes(worker, materialStagingBuckets.image, record.stagingKey, material.byteSize);
    }
  }
  catch (error) {
    // A concurrent completion may already have removed the temporary object.
    const current = await loadUpload(worker, ownerId, id);
    if (current.material.state === "ready" && current.material.version === expectedVersion) return current.material;
    throw error;
  }
  const metadata = await validateMaterialFile(bytes, { kind: material.kind, contentType: material.contentType, byteSize: material.byteSize });
  // Re-check expiry/deletion after parsing and before creating the final object.
  const current = await loadUpload(worker, ownerId, id);
  if (current.material.state === "ready" && current.material.version === expectedVersion) return current.material;
  const { error } = await worker.storage.from(FINAL).upload(record.finalKey, bytes, { contentType: metadata.contentType, upsert: false });
  if (error) {
    if (!("status" in error && error.status === 409) &&
      !("statusCode" in error && String(error.statusCode) === "409")) throw unavailable();
    // Concurrent completion can have won the upload; do not trust an existing object's metadata.
    const saved = await downloadBytes(worker, FINAL, record.finalKey, material.byteSize);
    if (createHash("sha256").update(saved).digest("hex") !== metadata.contentHash) {
      throw new ApiError(409, "UPLOAD_CONTENT_CONFLICT", "저장된 파일이 업로드 내용과 다릅니다. 새 업로드로 다시 시도해 주세요.");
    }
  }
  const result = decodeDatabase(materialResponse, await rpc(worker, "complete_upload", {
    p_owner: ownerId, p_id: id, p_expected_version: expectedVersion, ...rpcArgs(metadata),
  }));
  // Ready data is durable. Stage cleanup failure must not turn completion into a failed upload.
  await tryCleanup(worker, ownerId, { ...record, material: result });
  return result;
}

async function tryCleanup(worker: DbClient, ownerId: string, record: UploadRecord) {
  try {
    if (record.stagingKey) {
      await cleanupStaging(worker, record.stagingKey);
    }
    if (record.material.deletedAt && record.finalKey) {
      const { error } = await worker.storage.from(FINAL).remove([record.finalKey]);
      if (error) throw unavailable();
    }
    return decodeDatabase(materialResponse, await rpc(worker, "complete_material_cleanup", { p_owner: ownerId,
      p_id: record.material.id, p_expected_version: record.material.version }));
  } catch {
    // A durable cleanup marker is retried after all signed upload capabilities have expired.
    console.error("material_cleanup_pending", { materialId: record.material.id });
    return record.material;
  }
}

async function cleanupStaging(worker: DbClient, key: string) {
  const buckets = key.endsWith(".pdf") ? [materialStagingBuckets.pdf, materialStagingBuckets.image] : [materialStagingBuckets.image];
  for (const bucket of buckets) {
    const { error } = await worker.storage.from(bucket).remove([key]);
    if (error) throw unavailable();
  }
}

export async function deleteMaterial(db: DbClient, ownerId: string, id: string, expectedVersion: number) {
  const result = decodeDatabase(materialResponse, await rpc(db, "delete_material", { p_id: id, p_expected_version: expectedVersion }));
  try {
    const worker = workerClient();
    return await tryCleanup(worker, ownerId, await loadUpload(worker, ownerId, id, true));
  }
  catch { return result; } // Soft deletion is committed; the cron owns physical deletion retries.
}

export async function getMaterialDownload(ownerId: string, id: string) {
  const worker = workerClient();
  const record = await loadUpload(worker, ownerId, id);
  if (record.material.state !== "ready" || !record.finalKey) throw incomplete();
  const url = await signedDownload(worker, FINAL, record.finalKey);
  return { material: record.material, download: { url, expiresAt: new Date(Date.now() + 60_000).toISOString() } };
}

export async function cleanupMaterials() {
  const worker = workerClient();
  const tasks = decodeDatabase(z.array(z.object({ id: z.uuid(), ownerId: z.uuid(), version: z.number().int().positive(),
    stagingKey: z.string().nullable(), finalKey: z.string().nullable() })),
  await rpc(worker, "list_material_cleanup", { p_limit: 50 }));
  let completed = 0;
  // Small concurrent batches avoid serial network delays; all keys come from the service-only RPC.
  for (let offset = 0; offset < tasks.length; offset += 5) {
    await Promise.all(tasks.slice(offset, offset + 5).map(async task => {
      try {
        if (task.stagingKey) await cleanupStaging(worker, task.stagingKey);
        if (task.finalKey) {
          const { error } = await worker.storage.from(FINAL).remove([task.finalKey]);
          if (error) throw unavailable();
        }
        const material = decodeDatabase(materialResponse, await rpc(worker, "complete_material_cleanup", {
          p_owner: task.ownerId, p_id: task.id, p_expected_version: task.version,
        }));
        if (!material.cleanupPending) completed++;
      } catch { console.error("material_cleanup_pending", { materialId: task.id }); }
    }));
  }
  return { attempted: tasks.length, completed };
}
