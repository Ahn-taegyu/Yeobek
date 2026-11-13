import { z } from "zod";
import { apiErrorEnvelope } from "../contracts/responses";
import { mediaMimeTypes } from "../contracts/media";
import { routes, type BinaryRouteContract, type RouteContract } from "../contracts/routes";

export class ApiClientError extends Error {
  constructor(
    public readonly status: number | null,
    public readonly code: string,
    message: string,
    public readonly retryable = false,
    public readonly requestId?: string,
    public readonly fields?: Record<string, string[]>,
    public readonly retryAfter?: number,
  ) {
    super(message);
    this.name = "ApiClientError";
  }
}

type RouteName = keyof typeof routes;
type Success<Route extends RouteContract> = Route extends { binary: BinaryRouteContract["binary"] }
  ? Blob : Route extends { response: infer Schema extends z.ZodType } ? z.output<Schema> : never;
type RequestOptions<Route extends RouteContract> = { signal?: AbortSignal }
  & (Route extends { params: infer Params extends z.ZodType } ? { params: z.input<Params> } : { params?: never })
  & (Route extends { query: infer Query extends z.ZodType } ? { query: z.input<Query> } : { query?: never })
  & (Route extends { body: infer Body extends z.ZodType } ? { body: z.input<Body> } : { body?: never });

type RequestArgs<Route extends RouteContract> = Route extends { params: z.ZodType } | { body: z.ZodType } | { query: z.ZodType }
  ? [options: RequestOptions<Route>]
  : [options?: RequestOptions<Route>];

export function requestApi<Name extends RouteName>(
  name: Name,
  ...args: RequestArgs<(typeof routes)[Name]>
): Promise<Success<(typeof routes)[Name]>>;
export async function requestApi(name: RouteName, options?: {
  params?: unknown;
  query?: unknown;
  body?: unknown;
  signal?: AbortSignal;
}): Promise<unknown> {
  const route: RouteContract = routes[name];
  const parsedParams = route.params?.safeParse(options?.params);
  if (parsedParams && !parsedParams.success) {
    throw new ApiClientError(null, "INVALID_INPUT", "요청 주소를 확인해 주세요.");
  }
  const parsedQuery = route.query?.safeParse(options?.query);
  if (parsedQuery && !parsedQuery.success) {
    throw new ApiClientError(null, "INVALID_INPUT", "조회 조건을 확인해 주세요.");
  }
  const path = route.path.replace(/\{(\w+)\}/g, (_, key: string) =>
    encodeURIComponent(parsedParams?.data[key] ?? "")) +
    (parsedQuery?.success ? `?${new URLSearchParams(parsedQuery.data)}` : "");
  const mimeTypes: readonly string[] | undefined = name === "getMedia" && parsedQuery?.success
    ? parsedQuery.data.kind === "audio" ? mediaMimeTypes.audio : mediaMimeTypes.image
    : route.binary?.mimeTypes;
  const headers = new Headers({ Accept: mimeTypes?.join(", ") ?? "application/json" });
  let body: BodyInit | undefined;
  if (route.bodyEncoding === "multipart") {
    const parsed = route.body?.safeParse(options?.body);
    if (!parsed?.success || !parsed.data || typeof parsed.data !== "object") {
      throw new ApiClientError(null, "INVALID_INPUT", "입력 내용을 확인해 주세요.");
    }
    const form = new FormData();
    // Validate with the shared schema and send original wire values.
    for (const [key, value] of Object.entries(options?.body as Record<string, unknown>)) {
      if (value instanceof Blob || typeof value === "string") form.append(key, value);
      else if (value !== undefined) throw new ApiClientError(null, "INVALID_INPUT", "입력 내용을 확인해 주세요.");
    }
    body = form;
  } else if (route.body) {
    headers.set("Content-Type", "application/json");
    body = JSON.stringify(options?.body);
  }
  let response: Response;
  try {
    response = await fetch(path, {
      method: route.method,
      credentials: "same-origin",
      redirect: "error",
      cache: "no-store",
      signal: options?.signal,
      headers,
      body,
    });
  } catch {
    options?.signal?.throwIfAborted();
    throw new ApiClientError(null, "NETWORK_ERROR", "서비스에 연결하지 못했습니다.", true);
  }

  const invalidResponse = () => new ApiClientError(response.status, "INVALID_RESPONSE", "서버 응답을 확인하지 못했습니다.");
  if (response.ok && route.binary) {
    const mime = response.headers.get("Content-Type")?.split(";")[0].trim().toLowerCase();
    const maxBytes = route.binary.maxBytes;
    if (!route.statuses.includes(response.status) || !mime || !mimeTypes?.includes(mime) || !response.body ||
      Number(response.headers.get("Content-Length")) > maxBytes) {
      await response.body?.cancel().catch(() => {});
      throw invalidResponse();
    }
    const reader = response.body.getReader();
    const chunks: Uint8Array<ArrayBuffer>[] = [];
    let size = 0;
    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > maxBytes) {
          await reader.cancel().catch(() => {});
          throw invalidResponse();
        }
        chunks.push(new Uint8Array(value));
      }
    } catch {
      options?.signal?.throwIfAborted();
      throw invalidResponse();
    } finally { reader.releaseLock(); }
    if (!size) throw invalidResponse();
    return new Blob(chunks, { type: mime });
  }
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    options?.signal?.throwIfAborted();
    throw invalidResponse();
  }

  if (!response.ok) {
    const result = apiErrorEnvelope.safeParse(payload);
    if (!result.success) throw invalidResponse();
    const { error, requestId } = result.data;
    throw new ApiClientError(response.status, error.code, error.message, error.retryable, requestId, error.fields, error.retryAfter);
  }

  const result = route.response?.safeParse(payload);
  if (!route.statuses.includes(response.status) || !result?.success) throw invalidResponse();
  return result.data;
}
