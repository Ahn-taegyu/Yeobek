export type AutomationErrorCode =
  | "invalid_input" | "not_configured" | "cancelled" | "timeout"
  | "unavailable" | "rejected" | "not_ready" | "not_found"
  | "invalid_response" | "rate_limited" | "stale_source";

/** Provider bodies, credentials and original exceptions must not enter logs/API errors. */
export class AutomationError extends Error {
  constructor(readonly code: AutomationErrorCode) {
    super(code);
    this.name = "AutomationError";
  }
}
