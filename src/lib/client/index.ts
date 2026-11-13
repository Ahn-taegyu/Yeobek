import { z } from "zod";
import { apiErrorEnvelope } from "../contracts/responses";
import { routes, type RouteContract } from "../contracts/routes";

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
type RequestOptions<Route extends RouteContract> = { signal?: AbortSignal }
  & (Route extends { params: infer Params extends z.ZodType } ? { params: z.input<Params> } : { params?: never })
  & (Route extends { body: infer Body extends z.ZodType } ? { body: z.input<Body> } : { body?: never });

type RequestArgs<Route extends RouteContract> = Route extends { params: z.ZodType } | { body: z.ZodType }
  ? [options: RequestOptions<Route>]
  : [options?: RequestOptions<Route>];

export function requestApi<Name extends RouteName>(
  name: Name,
  ...args: RequestArgs<(typeof routes)[Name]>
): Promise<z.output<(typeof routes)[Name]["response"]>>;
export async function requestApi(name: RouteName, options?: {
  params?: unknown;
  body?: unknown;
  signal?: AbortSignal;
}): Promise<unknown> {
  const route: RouteContract = routes[name];
  const parsedParams = route.params?.safeParse(options?.params);
  if (parsedParams && !parsedParams.success) {
    throw new ApiClientError(null, "INVALID_INPUT", "요청 주소를 확인해 주세요.");
  }
  const path = route.path.replace(/\{(\w+)\}/g, (_, key: string) =>
    encodeURIComponent(parsedParams?.data[key] ?? ""));
  let response: Response;
  try {
    response = await fetch(path, {
      method: route.method,
      credentials: "same-origin",
      redirect: "error",
      cache: "no-store",
      signal: options?.signal,
      headers: route.body ? { "Content-Type": "application/json", Accept: "application/json" } : { Accept: "application/json" },
      // Send wire input unchanged. The server owns defaults, transforms and field errors.
      body: route.body ? JSON.stringify(options?.body) : undefined,
    });
  } catch {
    options?.signal?.throwIfAborted();
    throw new ApiClientError(null, "NETWORK_ERROR", "서비스에 연결하지 못했습니다.", true);
  }

  const invalidResponse = () => new ApiClientError(response.status, "INVALID_RESPONSE", "서버 응답을 확인하지 못했습니다.");
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

  const result = route.response.safeParse(payload);
  if (!route.statuses.includes(response.status) || !result.success) throw invalidResponse();
  return result.data;
}
