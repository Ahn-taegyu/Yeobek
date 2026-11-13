export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string,
    public fields?: Record<string, string[]>,
    public retryAfter?: number) { super(message); }
  get retryable() { return this.code !== "SERVER_CONFIGURATION_ERROR" && (this.status === 429 || this.status >= 500); }
}

export function authenticationError(error: { status?: number; name?: string }, message = "로그인이 필요합니다.", code = "UNAUTHENTICATED"): ApiError {
  // These are app backoff suggestions, not a guarantee that the provider quota resets then.
  if (error.status === 429) return new ApiError(429, "RATE_LIMITED", "잠시 후 다시 시도해 주세요.", undefined, 60);
  if ((error.status ?? 0) >= 500 || error.status === 0 || error.name === "AuthRetryableFetchError") {
    return new ApiError(503, "SERVICE_UNAVAILABLE", "인증 서비스에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.", undefined, 5);
  }
  return new ApiError(401, code, message);
}

export function databaseError(error: { code?: string; message?: string }): ApiError {
  switch (error.code) {
    case "P0002": return new ApiError(404, "NOT_FOUND", "자료를 찾을 수 없습니다.");
    case "P1003": return new ApiError(503, "SERVER_CONFIGURATION_ERROR", "서비스 정책 설정을 확인하고 있습니다.");
    case "P1004": return new ApiError(429, "AUTHOR_JOB_LIMIT", "오늘 사용할 수 있는 생성 횟수를 모두 사용했습니다.");
    case "P1005": return new ApiError(409, "REQUEST_ID_CONFLICT", "이 요청 ID는 다른 작업에 이미 사용했습니다.");
    case "P1006": return new ApiError(409, "JOB_ATTEMPT_CONFLICT", "작업 상태가 변경되었습니다. 새로 불러와 확인해 주세요.");
    case "42501": return new ApiError(403, "FORBIDDEN", "허용되지 않은 요청입니다.");
    case "40001": return new ApiError(409, "REVISION_CONFLICT", "다른 변경이 저장되었습니다. 새로 불러온 뒤 다시 수정해 주세요.");
    case "P1001": return new ApiError(409, "SOURCE_REVISION_CONFLICT", "새로 연결한 출처가 변경되었습니다. 출처를 확인해 주세요.", { sourceRefs: ["최신 출처를 확인한 뒤 다시 연결해 주세요."] });
    case "P1002": return new ApiError(400, "SOURCE_UNAVAILABLE", "새로 연결한 출처를 사용할 수 없습니다.", { sourceRefs: ["출처와 공개 가능 범위를 확인해 주세요."] });
    case "23505": {
      if (error.message?.includes('"artworks_exhibition_id_number_key"')) {
        return new ApiError(409, "DUPLICATE_NUMBER", "같은 전시에 사용 중인 작품 번호입니다.", { number: ["다른 번호를 입력해 주세요."] });
      }
      if (error.message === "Exhibition creation ID already used with different input" || error.message === "Artwork creation ID already used with different input") {
        return new ApiError(409, "REQUEST_ID_CONFLICT", "이 생성 요청 ID는 다른 내용으로 이미 사용했습니다.", { id: ["기존 생성 결과를 확인해 주세요."] });
      }
      return new ApiError(409, "CONFLICT", "이미 사용 중인 값입니다.");
    }
    case "22023": case "23514": case "23502": case "22007": case "22008": case "22P05": case "22P02": case "23503":
      return new ApiError(400, "INVALID_INPUT", "입력 내용과 자료 연결을 확인해 주세요.");
    default: return new ApiError(500, "INTERNAL_ERROR", "요청을 처리하지 못했습니다.");
  }
}
