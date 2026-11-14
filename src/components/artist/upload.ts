import { requestApi } from "@/lib/client";
import { requestUploadSchema, type materialSubject } from "@/lib/contracts/materials";
import type { z } from "zod";

export async function uploadMaterial(file: File, subjectType: z.infer<typeof materialSubject>, subjectId: string, kind: "image" | "pdf") {
  const input = requestUploadSchema.safeParse({
    id: crypto.randomUUID(), subjectType, subjectId, kind, filename: file.name, contentType: file.type, byteSize: file.size,
  });
  if (!input.success) throw new Error("파일 형식과 크기를 확인해주세요.");
  const { data } = await requestApi("requestUpload", { body: input.data });
  if (!data.upload) return data.material;
  const body = new FormData();
  body.append("cacheControl", "3600");
  body.append("", file);
  const response = await fetch(data.upload.signedUrl, {
    method: "PUT", body, headers: { "x-upsert": "false" }, credentials: "omit", redirect: "error",
  });
  if (!response.ok) throw new Error("파일을 전송하지 못했어요. 다시 시도해주세요.");
  return (await requestApi("completeUpload", {
    params: { id: data.material.id }, body: { expectedVersion: data.material.version },
  })).data;
}
