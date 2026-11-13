import "server-only";

import { KnowledgeError } from "./artist-knowledge";
import { HarnessError } from "./context";
import { AiError, type AiErrorCode } from "./errors";
import type { AbstentionReason } from "./narration";

type HttpFailure = { status: number; code: string };
type AiOutcome = HttpFailure & { retryable: boolean };

const invalidInput = { status: 400, code: "INVALID_INPUT" };
const notFound = { status: 404, code: "NOT_FOUND" };
const revisionConflict = { status: 409, code: "REVISION_CONFLICT" };
const cancelled = { status: 499, code: "REQUEST_CANCELLED" };
const internalError = { status: 500, code: "INTERNAL_ERROR" };
const invalidOutput = { status: 502, code: "AI_INVALID_OUTPUT" };
const generationFailed = { status: 502, code: "AI_GENERATION_FAILED" };
const providerUnavailable = { status: 503, code: "PROVIDER_UNAVAILABLE" };
const timeout = { status: 504, code: "REQUEST_TIMEOUT" };

const harnessFailures = {
  invalid_request: invalidInput,
  invalid_context: internalError,
  invalid_output: invalidOutput,
  publication_unavailable: notFound,
  answer_unavailable: notFound,
  cancelled,
} satisfies Record<HarnessError["code"], HttpFailure>;

const knowledgeFailures = {
  invalid_input: invalidInput,
  unavailable: notFound,
  invalid_context: internalError,
  invalid_output: invalidOutput,
  revision_conflict: revisionConflict,
  proposal_expired: { status: 410, code: "PROPOSAL_EXPIRED" },
} satisfies Record<KnowledgeError["code"], HttpFailure>;

const providerFailures = {
  not_configured: { status: 503, code: "SERVER_CONFIGURATION_ERROR" },
  invalid_input: invalidInput,
  cancelled,
  timeout,
  rate_limited: { status: 429, code: "RATE_LIMITED" },
  provider_unavailable: providerUnavailable,
  provider_rejected: generationFailed,
  network_error: providerUnavailable,
  invalid_response: invalidOutput,
  response_too_large: invalidOutput,
  refused: generationFailed,
  incomplete: generationFailed,
} satisfies Record<AiErrorCode, HttpFailure>;

const abstentions = {
  invalid_request: invalidInput,
  unavailable: notFound,
  invalid_context: internalError,
  stale_context: revisionConflict,
  insufficient_evidence: { status: 422, code: "EVIDENCE_REQUIRED" },
  clarify: { status: 422, code: "CONTEXT_AMBIGUOUS" },
  generation_failed: generationFailed,
  invalid_candidate: invalidOutput,
  judge_failed: generationFailed,
  below_threshold: invalidOutput,
  cancelled,
  timeout,
} satisfies Record<AbstentionReason, HttpFailure>;

export function normalizeAiOutcome(value: unknown): AiOutcome {
  let failure = internalError;
  if (value instanceof HarnessError && Object.hasOwn(harnessFailures, value.code)) {
    failure = harnessFailures[value.code];
  } else if (value instanceof KnowledgeError && Object.hasOwn(knowledgeFailures, value.code)) {
    failure = knowledgeFailures[value.code];
  } else if (value instanceof AiError && Object.hasOwn(providerFailures, value.code)) {
    failure = providerFailures[value.code];
  } else if (value && typeof value === "object" && "status" in value && value.status === "abstained" &&
    "reason" in value && typeof value.reason === "string" && Object.hasOwn(abstentions, value.reason)) {
    failure = abstentions[value.reason as AbstentionReason];
  }

  const { status, code } = failure;
  // Match the HTTP contract. Provider retry policy remains local to AiError.
  return { status, code, retryable: code !== "SERVER_CONFIGURATION_ERROR" && (status === 429 || status >= 500) };
}
