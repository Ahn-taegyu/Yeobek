export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string,
    public fields?: Record<string, string[]>) { super(message); }
}

export function authenticationError(error: { status?: number; name?: string }, message = "로그인이 필요합니다."): ApiError {
  if (error.status === 429) return new ApiError(429, "RATE_LIMITED", "잠시 후 다시 시도해 주세요.");
  if ((error.status ?? 0) >= 500 || error.status === 0 || error.name === "AuthRetryableFetchError") {
    return new ApiError(503, "SERVICE_UNAVAILABLE", "인증 서비스에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.");
  }
  return new ApiError(401, "UNAUTHENTICATED", message);
}

export function databaseError(error: { code?: string }): ApiError {
  switch (error.code) {
    case "P0002": return new ApiError(404, "NOT_FOUND", "자료를 찾을 수 없습니다.");
    case "42501": return new ApiError(403, "FORBIDDEN", "허용되지 않은 요청입니다.");
    case "40001": return new ApiError(409, "REVISION_CONFLICT", "다른 변경이 저장되었습니다. 새로 불러온 뒤 다시 수정해 주세요.");
    case "23505": return new ApiError(409, "CONFLICT", "같은 번호나 요청 ID가 이미 사용되고 있습니다.");
    case "22023": case "23514": case "23502": case "22007": case "22P02": case "23503":
      return new ApiError(400, "INVALID_INPUT", "입력 내용과 자료 연결을 확인해 주세요.");
    default: return new ApiError(500, "INTERNAL_ERROR", "요청을 처리하지 못했습니다.");
  }
}
