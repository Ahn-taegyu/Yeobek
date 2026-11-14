import "server-only";
import { AutomationError } from "../errors";
import type { MailPort, SupportPort, TranscriptPort, TranscriptResult } from "../ports";

function allow(signal?: AbortSignal) {
  if (process.env.NODE_ENV === "production" || process.env.AI_PROVIDER_MODE !== "mock" ||
      !["development", "test"].includes(process.env.NODE_ENV ?? "")) throw new AutomationError("not_configured");
  if (signal?.aborted) throw new AutomationError("cancelled");
}

/** Explicit test fixtures; no recipient, message or transcript is logged or sent. */
export function createMockAutomationAdapters(fixtures: ReadonlyMap<string, TranscriptResult> = new Map()): {
  mail: MailPort; support: SupportPort; transcript: TranscriptPort;
} {
  allow();
  const notes = new Map([...fixtures].map(([id, value]) => [id, structuredClone(value)]));
  return {
    mail: { async send(_input, signal) { allow(signal); return { status: "accepted", code: "accepted", mock: true }; } },
    support: { async reply(_input, signal) { allow(signal); return { status: "accepted", code: "accepted", mock: true }; } },
    transcript: { async read(noteId, signal) {
      allow(signal);
      const note = notes.get(noteId);
      if (!note || note.noteId !== noteId) throw new AutomationError("not_found");
      return { ...structuredClone(note), mock: true };
    } },
  };
}
