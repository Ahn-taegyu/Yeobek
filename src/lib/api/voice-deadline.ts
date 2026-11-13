import "server-only";
import { createDeadline } from "../ai/deadline";
import { ApiError } from "./errors";

/** Includes reading the upload; platform grace exists only to settle the ledger. */
export async function withVoiceDeadline<T>(request: Request, action: (request: Request) => Promise<T>) {
  const deadline = createDeadline(60_000, request.signal);
  try {
    // Next's Request may come from a different fetch implementation. Copy
    // public fields rather than passing that instance to the native constructor.
    const init = { method: request.method, headers: request.headers, body: request.body,
      signal: deadline.signal, duplex: "half" };
    return await action(new Request(request.url, init));
  } catch (error) {
    if (deadline.timedOut()) throw new ApiError(504, "REQUEST_TIMEOUT", "음성 요청 시간이 초과되었습니다.");
    if (request.signal.aborted) throw new ApiError(499, "REQUEST_CANCELLED", "음성 요청이 취소되었습니다.");
    throw error;
  } finally { deadline.dispose(); }
}
