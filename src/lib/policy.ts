/** Shared code defaults. Database-backed limits are read afresh by RPCs;
 * never enforce a request budget from a process-local counter or this fallback. */
export const AI_LIMITS = Object.freeze({
  question: 500, answer: 600, narration: 2000, narrationTarget: 600,
  evidenceCount: 12, evidenceChars: 8000,
});

/** Seed values are provisional deployment settings, not measured capacity. */
export const DEFAULT_POLICIES = Object.freeze({
  visitor_requests_per_minute: 6,
  visitor_audio_cache_requests_per_minute: 60,
  exhibition_requests_per_day: 1000,
  author_jobs_per_day: 100,
  gap_retention_days: 30,
  answer_ttl_seconds: 3600,
  job_retention_days: 30,
  job_lease_seconds: 180,
  proposal_ttl_seconds: 86400,
  voice_config_version: 1,
  evidence_body_chars: 2000,
  evidence_label_chars: 100,
  image_max_bytes: 3 * 1024 * 1024,
  pdf_max_bytes: 6 * 1024 * 1024,
  upload_ttl_seconds: 3600,
  author_uploads_per_day: 100,
  automation_event_lease_seconds: 120,
  automation_dispatch_lease_seconds: 60,
  automation_event_max_attempts: 3,
  automation_event_retention_days: 30,
  automation_jobs_per_day: 100,
  automation_batch_signals: 50,
  automation_batch_events: 3,
  automation_batch_dispatch: 5,
});
/** Technical execution envelope; stays below the DB runner lease (120 seconds). */
export const AUTOMATION_RUNTIME_LIMITS = Object.freeze({ rpcMs: 5000, deadlineMs: 60000, generationMs: 40000 });
export type PolicyKey = keyof typeof DEFAULT_POLICIES;
export type AppPolicies = { readonly [Key in PolicyKey]: number };
export const POLICY_TECHNICAL_MAX = 2147483647;

/** Invalid/missing persisted values fail closed instead of disabling a limit. */
export function parsePolicies(input: unknown): AppPolicies {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("Invalid application policies");
  const values = input as Record<string, unknown>;
  const entries = Object.keys(DEFAULT_POLICIES).map(key => {
    const value = values[key];
    if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1 || value > POLICY_TECHNICAL_MAX) {
      throw new Error("Invalid application policies");
    }
    return [key, value] as const;
  });
  return Object.freeze(Object.fromEntries(entries)) as AppPolicies;
}
