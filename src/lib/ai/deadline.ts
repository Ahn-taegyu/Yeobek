import { AiError } from "./errors";

// The race bounds operations that do not observe their signal.
export async function abortable<T>(
  signal: AbortSignal,
  operation: (signal: AbortSignal) => Promise<T>,
  options?: { defer?: boolean },
): Promise<T> {
  signal.throwIfAborted();
  let onAbort!: () => void;
  try {
    return await new Promise<T>((resolve, reject) => {
      onAbort = () => reject(signal.reason);
      signal.addEventListener("abort", onAbort, { once: true });
      const pending = options?.defer ? Promise.resolve().then(() => {
        signal.throwIfAborted();
        return operation(signal);
      }) : operation(signal);
      pending.then(resolve, reject);
    });
  } finally {
    signal.removeEventListener("abort", onAbort);
  }
}

export function createDeadline(timeoutMs: number, parentSignal?: AbortSignal) {
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 2_147_483_647) {
    throw new AiError("invalid_input");
  }
  const timeout = new AbortController();
  const signal = parentSignal ? AbortSignal.any([parentSignal, timeout.signal]) : timeout.signal;
  let expired = false;
  let timer: ReturnType<typeof setTimeout> | undefined;

  function dispose() {
    clearTimeout(timer);
    signal.removeEventListener("abort", dispose);
  }

  if (!signal.aborted) {
    signal.addEventListener("abort", dispose, { once: true });
    timer = setTimeout(() => {
      expired = true;
      timeout.abort(new AiError("timeout"));
    }, timeoutMs);
  }

  return { signal, timedOut: () => expired, dispose };
}
