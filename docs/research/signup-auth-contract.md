---
type: Research
id: RES-008
title: W9 이메일 가입과 직접 로그인 경계
description: Supabase 서버 전용 가입·코드 확인·비밀번호 세션 조건의 공식 계약과 로컬 검증.
status: draft
updated: '2026-11-14'
tags: [yeobek, authentication, signup]
rag_include: true
generated:
  by: codex/gpt-6
  at: '2026-11-14T14:00:00+09:00'
sources:
- id: policy
  resource: /references/user-signup-security.md
  title: 이메일 인증 필수와 최소 8자
- id: plan
  resource: /references/user-backend-plan-v2.md
  title: W9 서버 전용 가입과 직접 로그인
- id: create
  resource: https://supabase.com/docs/reference/javascript/auth-admin-createuser
  title: Supabase admin createUser
- id: resend
  resource: https://supabase.com/docs/reference/javascript/auth-resend
  title: Supabase resend
- id: template
  resource: https://supabase.com/docs/guides/auth/auth-email-templates
  title: Supabase 이메일 템플릿
- id: local-template
  resource: https://supabase.com/docs/guides/local-development/customizing-email-templates
  title: 로컬 템플릿 구성
- id: provider-source
  resource: https://github.com/supabase/auth/blob/master/internal/api/resend.go
  title: Auth 재발송 구현
- id: verify-source
  resource: https://github.com/supabase/auth/blob/master/internal/api/verify.go
  title: Auth 확인과 세션 발급 구현
---

# 확정 요구와 구현 선택

[BR-16](../specs/functional-spec.md#br-16-작가-가입인증계정-처리)은 이메일 인증 필수·가입 비밀번호 8자 이상·인증 후 직접 로그인을 요구한다. v2는 브라우저의 직접 Auth 가입 차단과 가입 플래그를 요구한다. 소셜은 제외한다. 추가 강도·비밀번호 재설정·세션 수명은 새 정책으로 확정하지 않고 기존 동작을 유지한다.

구현 선택: Supabase `enable_signup=false`를 유지하고 서버 서비스 역할의 `admin.createUser(email_confirm:false)`로 계정을 만든다. `resend(type:signup)`가 확인 메일을 발송한다. 제공사의 고유 이메일 제약이 중복 계정을 막고 기존 비밀번호를 바꾸지 않는다. 가입/재발송 202는 인증 절차의 요청 접수일 뿐 계정 생성·메일 도착·인증 완료를 보장하지 않는다.

# 코드 확인과 최초 가입 시도 연결

확인 메일은 `.Token` 코드만 포함하고 자동 세션 URL을 넣지 않는다. 코드·이메일·최초 signupRequestId를 POST body로 보내며 코드/비밀번호는 URL·업무 DB·로그에 저장하지 않는다. 공식 이메일 문서의 코드 자릿수 설명이 6/8로 달라 로컬과 배포에서 `otp_length=6`을 명시한다. 코드 수명·제공사 재발송 간격은 기존 Auth 설정을 유지한다.

서버가 생성 시 app_metadata에 최초 요청 UUID를 기록한다. 확인·재발송은 그 요청 ID와 이메일에 해당하는 미인증 계정만 대상으로 한다. 브라우저가 고칠 수 있는 user_metadata는 신뢰하지 않는다. 다른 가입 시도로 먼저 등록된 계정의 코드를 확인하여 타인이 정한 비밀번호를 활성화하는 경로를 막는다. 생성 응답이 유실되면 같은 입력과 최초 요청 ID로 재시도한다. 비밀번호를 바꾸고 같은 ID를 재사용하지 않는다. 최초 ID를 잃은 미인증 계정의 복구는 아직 제공하지 않으므로 이를 성공으로 안내하지 않는다.

`verifyOtp`는 서버 내부에서 세션을 생성한다. 해당 세션만 local scope로 폐기하고 응답에는 토큰·쿠키를 넣지 않는다. 폐기/응답 실패 시 이메일은 이미 확인됐을 수 있으므로 직접 로그인으로 복구한다. 다른 기기의 로그인 세션은 종료하지 않는다.

# 제공사 직접 호출과 권한 경계

공개 Supabase 키가 있으므로 `/resend`·`/verify` 제공사 경로는 직접 호출할 수 있다. 전자는 제공사 자체 한도를 따르고 앱 원장을 거치지 않는다. 앱의 nonce 검사나 자동 세션 폐기가 제공사 전체에 강제된다고 주장하지 않는다. `enable_signup=false`가 막는 것은 직접 계정 생성이다.

따라서 신규 가입 표시가 있는 계정의 Yeobek 관리자 HTTP·소유자/운영자 RPC·6개 기존 소유자 SELECT 정책은 서명된 JWT의 password 인증 방식도 요구한다. OTP만 있는 토큰으로 관리자 자료에 접근하지 못하게 한다. 기존 사전 발급 계정은 이 추가 조건에서 제외해 종전 계약을 보존한다. 코드의 비밀성, Supabase 자체 인증 요청 한도와 SMTP 설정은 배포 시 별도로 점검한다.

중복/신규 응답 본문은 같지만 bcrypt·메일 발송 여부에 따른 응답 시간과 SMTP 실패까지 완전히 동일하지는 않다. 계정 존재의 완전한 비식별성 또는 외부 Auth 경로의 앱 원장 강제를 보장하지 않는다.

# 직접 확인한 것

로컬 Auth에서 공개 signUp은 signup_disabled, 서버 미인증 createUser와 resend는 성공, 인증 전 로그인은 email_not_confirmed로 거부됨을 확인했다. 현재 설정에서 8자 비밀번호와 코드-only 메일을 확인했고 OTP 토큰 AMR은 otp, 직접 비밀번호 로그인 토큰 AMR은 password였다. 값 자체는 출력하지 않았다. 운영 SMTP·사용자 실제 메일 도달·실서비스 설정은 아직 확인하지 않았다. W9 앱/DB 회귀와 최신 CI 결과는 [작업 추적](../specs/backend-completion.md)에 누적한다.
