import "server-only";
import { z } from "zod";
import { abortable, createDeadline } from "../../ai/deadline";
import { AutomationError } from "../errors";
import type { TranscriptPort } from "../ports";

const baseUrl = "https://public-api.altalt.io/v1";
const maxResponseBytes = 1024 * 1024;
const maxTimeoutMs = 15_000;
const revision = z.number().int().nonnegative();
const noteSchema = z.object({
  id: z.string(),
  revision,
  status: z.enum(["pending", "ended", "deleted"]),
  transcript_status: z.enum(["pending", "ready", "empty", "failed"]),
  channel_id: z.string().nullable().optional(),
  deleted_at: z.string().nullable().optional(),
});
const segmentSchema = z.object({
  start_ms: z.number().int().nonnegative(),
  end_ms: z.number().int().nonnegative(),
  text: z.string(),
  speaker: z.string().nullable().optional(),
}).refine(segment => segment.end_ms >= segment.start_ms);
const transcriptSchema = z.object({
  note_id: z.string(),
  revision,
  text: z.string(),
  segments: z.array(segmentSchema),
});
const errorSchema = z.object({ error: z.object({ code: z.string() }) });

function isJson(response: Response) {
  return response.headers.get("content-type")?.split(";")[0].trim().toLowerCase() === "application/json";
}

async function readJson(response: Response, signal: AbortSignal): Promise<unknown> {
  if (!isJson(response) || !response.body || Number(response.headers.get("content-length")) > maxResponseBytes) {
    throw new AutomationError("invalid_response");
  }
  const reader = response.body.getReader();
  const cancel = () => { void reader.cancel().catch(() => {}); };
  const decoder = new TextDecoder("utf-8", { fatal: true });
  const chunks: string[] = [];
  let bytes = 0;
  let complete = false;
  signal.addEventListener("abort", cancel, { once: true });
  try {
    for (;;) {
      signal.throwIfAborted();
      const { value, done } = await reader.read();
      signal.throwIfAborted();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > maxResponseBytes) throw new AutomationError("invalid_response");
      chunks.push(decoder.decode(value, { stream: true }));
    }
    complete = true;
    chunks.push(decoder.decode());
    return JSON.parse(chunks.join("")) as unknown;
  } catch {
    throw new AutomationError("invalid_response");
  } finally {
    signal.removeEventListener("abort", cancel);
    if (!complete && !signal.aborted) cancel();
    reader.releaseLock();
  }
}

function parseResponse<T>(schema: z.ZodType<T>, value: unknown): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success) throw new AutomationError("invalid_response");
  return parsed.data;
}

/** The caller must bind this read to a note the authenticated artist may import. */
export function createAltAdapter(config: { apiKey: string }, options?: {
  fetch?: typeof fetch;
  timeoutMs?: number;
}): TranscriptPort {
  const apiKey = config.apiKey.trim();
  if (!/^[!-~]+$/.test(apiKey)) throw new AutomationError("not_configured");
  const timeoutMs = options?.timeoutMs ?? maxTimeoutMs;
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > maxTimeoutMs) {
    throw new AutomationError("invalid_input");
  }
  const fetchAlt = options?.fetch ?? fetch;

  async function get(path: string, signal: AbortSignal, transcript = false): Promise<unknown> {
    signal.throwIfAborted();
    const response = await fetchAlt(baseUrl + path, {
      method: "GET",
      headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" },
      redirect: "error",
      cache: "no-store",
      signal,
    });
    try {
      signal.throwIfAborted();
      if (response.status === 200) return await readJson(response, signal);
      if (response.status === 404) {
        if (transcript && isJson(response)) {
          const error = errorSchema.safeParse(await readJson(response, signal));
          if (error.success && error.data.error.code === "transcript_not_ready") throw new AutomationError("not_ready");
        }
        throw new AutomationError("not_found");
      }
      if (response.status === 401 || response.status === 403) throw new AutomationError("rejected");
      if (response.status === 429) throw new AutomationError("rate_limited");
      if (response.status >= 500) throw new AutomationError("unavailable");
      throw new AutomationError("invalid_response");
    } finally {
      if (!response.bodyUsed) void response.body?.cancel().catch(() => {});
    }
  }

  return {
    async read(noteId, signal) {
      // Only one opaque URL path segment can be supplied by the caller.
      if (typeof noteId !== "string" || !/^[A-Za-z0-9_-][A-Za-z0-9._~-]{0,255}$/.test(noteId)) {
        throw new AutomationError("invalid_input");
      }
      const path = `/notes/${noteId}`;
      const deadline = createDeadline(timeoutMs, signal);
      try {
        const result = await abortable(deadline.signal, async active => {
          const before = parseResponse(noteSchema, await get(path, active));
          if (before.id !== noteId) throw new AutomationError("invalid_response");
          if (before.status === "deleted" || before.deleted_at != null) throw new AutomationError("not_found");
          if (before.status !== "ended" || before.transcript_status !== "ready") throw new AutomationError("not_ready");

          const transcript = parseResponse(transcriptSchema, await get(path + "/transcript", active, true));
          if (transcript.note_id !== noteId) throw new AutomationError("invalid_response");
          if (transcript.revision !== before.revision) throw new AutomationError("stale_source");

          const after = parseResponse(noteSchema, await get(path, active));
          if (after.id !== noteId) throw new AutomationError("invalid_response");
          if (after.revision !== before.revision || (after.channel_id ?? null) !== (before.channel_id ?? null) ||
            after.status !== "ended" || after.transcript_status !== "ready" || after.deleted_at != null) {
            throw new AutomationError("stale_source");
          }
          return {
            noteId,
            revision: transcript.revision,
            text: transcript.text,
            segments: transcript.segments.map(segment => ({
              startMs: segment.start_ms,
              endMs: segment.end_ms,
              text: segment.text,
              ...(segment.speaker !== undefined ? { speaker: segment.speaker } : {}),
            })),
            mock: false,
          };
        });
        deadline.signal.throwIfAborted();
        return result;
      } catch (error) {
        if (signal?.aborted) throw new AutomationError("cancelled");
        if (deadline.timedOut()) throw new AutomationError("timeout");
        if (error instanceof AutomationError) throw error;
        throw new AutomationError("unavailable");
      } finally {
        deadline.dispose();
      }
    },
  };
}
