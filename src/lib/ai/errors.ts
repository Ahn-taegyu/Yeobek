const messages = {
  not_configured: "AI 서비스 연결을 준비하고 있습니다.",
  invalid_input: "AI 요청 내용을 확인해 주세요.",
  cancelled: "AI 요청이 취소되었습니다.",
  timeout: "AI 응답 대기 시간이 초과되었습니다.",
  rate_limited: "AI 서비스가 요청 한도에 도달했습니다.",
  provider_unavailable: "AI 서비스에 일시적으로 연결할 수 없습니다.",
  provider_rejected: "AI 서비스가 요청을 처리하지 못했습니다.",
  network_error: "AI 서비스와 통신하는 중 오류가 발생했습니다.",
  invalid_response: "AI 응답 형식을 확인할 수 없습니다.",
  response_too_large: "AI 응답이 허용 크기를 초과했습니다.",
  refused: "AI 서비스가 응답을 거절했습니다.",
  incomplete: "AI 서비스가 응답을 완료하지 못했습니다.",
} as const;

export type AiErrorCode = keyof typeof messages;

export class AiError extends Error {
  constructor(public readonly code: AiErrorCode) {
    super(messages[code]);
    this.name = "AiError";
  }

  get retryable(): boolean {
    return this.code === "rate_limited" || this.code === "provider_unavailable";
  }
}

export class KnowledgeError extends Error {
  constructor(public readonly code: "invalid_input" | "unavailable" | "invalid_context" | "invalid_output" | "revision_conflict" | "proposal_expired") {
    super(code); this.name = "KnowledgeError";
  }
}
