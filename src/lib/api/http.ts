import { z } from "zod";
import { ApiError } from "./errors";

export const MAX_JSON_BYTES = 64 * 1024;
export const PRIVATE_HEADERS = {
  "Cache-Control": "private, no-store, max-age=0",
  "Pragma": "no-cache",
  "Expires": "0",
  "X-Content-Type-Options": "nosniff",
};

export function assertSameOrigin(request: Request) {
  let expected: string;
  try {
    if (process.env.NODE_ENV === "production" && !process.env.APP_ORIGIN) throw new Error();
    const url = new URL(process.env.APP_ORIGIN || request.url);
    if (!["http:", "https:"].includes(url.protocol)) throw new Error();
    expected = url.origin;
  } catch {
    throw new ApiError(503, "SERVER_CONFIGURATION_ERROR", "서비스 연결 설정을 확인하고 있습니다.");
  }
  const origin = request.headers.get("origin");
  if (!origin || origin !== expected || request.headers.get("sec-fetch-site") === "cross-site") {
    throw new ApiError(403, "FORBIDDEN", "같은 사이트에서 다시 요청해 주세요.");
  }
}

export async function readJson<T>(request: Request, schema: z.ZodType<T>): Promise<T> {
  if (request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json") {
    throw new ApiError(415, "UNSUPPORTED_MEDIA_TYPE", "JSON 형식으로 요청해 주세요.");
  }
  const declaredSize = Number(request.headers.get("content-length") || 0);
  if (declaredSize > MAX_JSON_BYTES) throw new ApiError(413, "TOO_LARGE", "입력 내용이 너무 큽니다.");
  const reader = request.body?.getReader();
  if (!reader) throw new ApiError(400, "INVALID_INPUT", "입력 내용이 필요합니다.");
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_JSON_BYTES) {
        await reader.cancel();
        throw new ApiError(413, "TOO_LARGE", "입력 내용이 너무 큽니다.");
      }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  let data: unknown;
  try { data = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)); }
  catch { throw new ApiError(400, "INVALID_INPUT", "올바른 JSON이 아닙니다."); }
  return schema.parse(data);
}

export function handleApi(action: () => Promise<unknown>, status = 200) {
  const requestId = crypto.randomUUID();
  return (async () => {
    try {
      let data = await action();
      let actualStatus = status;
      if (data && typeof data === "object" && "_created" in data) {
        const { _created, ...resource } = data;
        actualStatus = _created ? 201 : 200;
        data = resource;
      }
      return Response.json({ data: camelize(data), requestId }, {
        status: actualStatus, headers: { ...PRIVATE_HEADERS, "X-Request-Id": requestId },
      });
    } catch (error) {
      const failure = error instanceof ApiError ? error
        : error instanceof z.ZodError ? new ApiError(400, "INVALID_INPUT", "입력 내용을 확인해 주세요.",
          z.flattenError(error).fieldErrors as Record<string, string[]>)
        : new ApiError(500, "INTERNAL_ERROR", "요청을 처리하지 못했습니다.");
      // Request identifiers are safe to log; bodies, tokens and database details are not.
      if (failure.status >= 500) console.error("api_failure", { requestId, code: failure.code });
      return Response.json({ error: { code: failure.code, message: failure.message, retryable: failure.retryable,
        ...(failure.retryAfter !== undefined ? { retryAfter: failure.retryAfter } : {}),
        ...(failure.fields ? { fields: failure.fields } : {}) }, requestId }, {
        status: failure.status, headers: { ...PRIVATE_HEADERS, "X-Request-Id": requestId,
          ...(failure.retryAfter !== undefined ? { "Retry-After": String(failure.retryAfter) } : {}) },
      });
    }
  })();
}

export function camelize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(camelize);
  if (value && typeof value === "object") return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [key.replace(/_([a-z])/g, (_, char: string) => char.toUpperCase()), camelize(item)]),
  );
  return value;
}
