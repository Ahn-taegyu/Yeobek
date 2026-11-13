import "server-only";
import { timingSafeEqual } from "node:crypto";
import { ApiError } from "./errors";

/** External scheduler only; this secret never belongs in a browser or URL. */
export function authorizeCron(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret || secret.length < 32) throw new ApiError(503, "SERVER_CONFIGURATION_ERROR", "자동 실행 설정을 확인해 주세요.");
  const expected = Buffer.from(`Bearer ${secret}`);
  const actual = Buffer.from(request.headers.get("authorization") ?? "");
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
    throw new ApiError(404, "NOT_FOUND", "자료를 찾을 수 없습니다.");
  }
}
