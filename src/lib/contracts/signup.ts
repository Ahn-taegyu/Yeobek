import { z } from "zod";
import { uuid } from "./requests";

const email = z.string().trim().toLowerCase().pipe(z.email("이메일 주소를 확인해 주세요.").max(254));
const password = z.string()
  .refine(value => !/[\u0000\uD800-\uDFFF]/u.test(value), "지원되지 않는 문자가 포함되어 있습니다.")
  .refine(value => Array.from(value).length >= 8, "비밀번호를 8자 이상 입력해 주세요.")
  .refine(value => new TextEncoder().encode(value).length <= 72, "비밀번호를 UTF-8 기준 72바이트 이하로 입력해 주세요.");

const request = z.strictObject({ email, requestId: uuid.toLowerCase() });
export const signupSchema = request.extend({ password, passwordConfirmation: z.string() })
  .refine(value => value.password === value.passwordConfirmation, {
    path: ["passwordConfirmation"], message: "비밀번호와 확인값이 일치하지 않습니다.",
  });
export const resendSignupSchema = request.extend({ signupRequestId: uuid.toLowerCase() });
export const verifySignupSchema = resendSignupSchema.extend({
  code: z.string().regex(/^[0-9]{6}$/, "인증 코드 숫자 6자리를 입력해 주세요."),
});

export const signupPendingResponse = z.strictObject({ status: z.literal("verification_required"), authenticated: z.literal(false) });
export const signupVerifiedResponse = z.strictObject({ status: z.literal("verified"), authenticated: z.literal(false) });
export const authSessionResponse = z.strictObject({ authenticated: z.boolean() });
