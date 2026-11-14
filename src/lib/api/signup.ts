import "server-only";
import { createHmac } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { z } from "zod";
import { resendSignupSchema, signupSchema, verifySignupSchema } from "../contracts/signup";
import { requireFeature } from "../features";
import { supabaseEnvironment } from "../supabase/env";
import { createWorkerSupabase } from "../supabase/worker";
import { ApiError } from "./errors";
import { assertSameOrigin, readJson } from "./http";
import { visitorNetworkHash } from "./visitor-network";

const providerTimeoutMs = 12000;
const pending = { status: "verification_required", authenticated: false } as const;
type SignupOperation = "signup" | "resend" | "verify";

function rateLimited() {
  return new ApiError(429, "RATE_LIMITED", "잠시 후 다시 시도해 주세요.", undefined, 60);
}

function signupUnavailable(message = "인증 요청의 결과를 확인하지 못했습니다. 잠시 후 다시 시도해 주세요.") {
  return new ApiError(503, "SIGNUP_UNAVAILABLE", message);
}

function providerFailure(error: { status?: number }) {
  return error.status === 429 ? rateLimited() : signupUnavailable();
}

async function providerCall<T>(action: () => PromiseLike<T>, failure = signupUnavailable) {
  try { return await action(); }
  catch { throw failure(); }
}

function signupHashes(request: Request, email: string) {
  const local = process.env.NODE_ENV === "development" || process.env.NODE_ENV === "test";
  const secret = process.env.VISITOR_IP_HASH_SECRET || (local ? "local-only-signup-budget-test-key" : "");
  if (secret.trim().length < 32) throw new ApiError(503, "SERVER_CONFIGURATION_ERROR", "서비스 연결 설정을 확인하고 있습니다.");
  const hash = (scope: "email" | "network", value: string) =>
    createHmac("sha256", secret).update(`yeobek:signup:${scope}:v1\0${value}`).digest("hex");
  return { emailHash: hash("email", email), networkHash: hash("network", visitorNetworkHash(request.headers)) };
}

async function signupContext<T extends { email: string; requestId: string }>(
  request: Request, kind: SignupOperation, schema: z.ZodType<T>,
) {
  assertSameOrigin(request);
  requireFeature("signup");
  const input = await readJson(request, schema);
  const { emailHash, networkHash } = signupHashes(request, input.email);
  const { url, key } = supabaseEnvironment();
  let worker: ReturnType<typeof createWorkerSupabase>;
  let auth: SupabaseClient["auth"];
  try {
    worker = createWorkerSupabase({ timeoutMs: providerTimeoutMs });
    auth = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      global: { fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(providerTimeoutMs) }) },
    }).auth;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(503, "SERVER_CONFIGURATION_ERROR", "서비스 연결 설정을 확인하고 있습니다.");
  }
  const { error } = await providerCall(() => worker.rpc("consume_signup_budget", {
    p_email_hash: emailHash,
    p_network_hash: networkHash,
    p_request_id: input.requestId,
    p_kind: kind,
  }).retry(false).abortSignal(request.signal));
  if (request.signal.aborted) throw new ApiError(499, "REQUEST_CANCELLED", "요청이 취소되었습니다.");
  if (error) {
    if (error.code === "P1040") throw rateLimited();
    throw signupUnavailable();
  }
  return { input, worker, auth };
}

async function signupIdentity(worker: ReturnType<typeof createWorkerSupabase>, email: string, signupRequestId: string) {
  const { data, error } = await providerCall(() => worker.rpc("get_signup_verification_identity", {
    p_email: email,
    p_signup_request_id: signupRequestId,
  }).retry(false));
  if (error) throw signupUnavailable();
  return data;
}

async function sendConfirmation(auth: SupabaseClient["auth"], email: string) {
  const { error } = await providerCall(() => auth.resend({ type: "signup", email }));
  if (error) throw providerFailure(error);
}

export async function prepareArtistSignup(request: Request) {
  const { input, worker, auth } = await signupContext(request, "signup", signupSchema);
  const { data, error } = await providerCall(() => worker.auth.admin.createUser({
    email: input.email, password: input.password, email_confirm: false,
    app_metadata: { yeobek_signup_request_id: input.requestId,
      ...(input.profile && { yeobek_signup_profile: input.profile }) },
  }));
  if (error) {
    if (error.code !== "email_exists") throw providerFailure(error);
  } else if (!data.user?.id || data.user.email_confirmed_at) throw signupUnavailable();
  // Only the original creation attempt can resume confirmation for a pending account.
  const userId = await signupIdentity(worker, input.email, input.requestId);
  if (!error && userId !== data.user?.id) throw signupUnavailable();
  if (userId) await sendConfirmation(auth, input.email);
  return pending;
}

export async function resendArtistSignup(request: Request) {
  const { input, worker, auth } = await signupContext(request, "resend", resendSignupSchema);
  if (await signupIdentity(worker, input.email, input.signupRequestId)) await sendConfirmation(auth, input.email);
  return pending;
}

function invalidVerificationCode() {
  return new ApiError(400, "INVALID_VERIFICATION_CODE", "인증 코드가 올바르지 않거나 만료되었습니다. 다시 확인하거나 새 코드를 요청해 주세요.");
}

export async function verifyArtistSignup(request: Request) {
  const { input, worker, auth } = await signupContext(request, "verify", verifySignupSchema);
  const userId = await signupIdentity(worker, input.email, input.signupRequestId);
  if (!userId) throw invalidVerificationCode();
  const { data, error } = await providerCall(() => auth.verifyOtp({ email: input.email, token: input.code, type: "signup" }));
  if (error) {
    if (error.code === "otp_expired" || error.code === "user_banned" || error.code === "user_not_found") {
      throw invalidVerificationCode();
    }
    throw providerFailure(error);
  }
  const token = data.session?.access_token;
  if (!token) throw signupUnavailable();
  // Revocation must finish even if the caller disconnects after the provider consumes the code.
  const revokeFailure = () => signupUnavailable("이메일 인증이 완료되었을 수 있습니다. 로그인 화면에서 직접 로그인해 주세요.");
  const { error: revokeError } = await providerCall(() => worker.auth.admin.signOut(token, "local"), revokeFailure);
  if (revokeError) throw revokeFailure();
  if (!data.user?.email_confirmed_at || userId !== data.user.id) throw signupUnavailable();
  return { status: "verified", authenticated: false } as const;
}
