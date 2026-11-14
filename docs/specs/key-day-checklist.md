---
type: Specification
id: SPEC-018
title: 키 당일 운영 연결 점검표
description: 모의 검증과 구분하여 Auth·AI·음성·비용·호스팅·스케줄을 실제 환경에서 확인할 항목.
status: draft
updated: '2026-11-14'
tags: [yeobek, handoff, validation]
rag_include: true
generated:
  by: codex/gpt-6
  at: '2026-11-14T15:05:00+09:00'
sources:
- id: unified-docent
  resource: /references/user-liner-voice-evaluation.md
  title: Liner 수정과 공통 도슨트 요구
- id: free-providers
  resource: /references/user-free-ai-providers.md
  title: 무료 AI 제공사 시험 요청
- id: api-rollout
  resource: /references/user-api-rollout-publication.md
  title: API 적용 수정 계획과 실행 제외 범위
- id: backend
  resource: /specs/backend-completion.md
  title: 백엔드 완성 작업 추적
- id: auth
  resource: /research/signup-auth-contract.md
  title: 이메일 가입 계약
- id: deploy
  resource: /references/user-v3-decisions.md
  title: Vercel Hobby 배포 결정
---

# 기록 방법

이 문서는 **실행 전 점검표**다. 현재 모든 실환경 항목은 미검증이다. 모의 HTTP·CI 성공은 실제 메일 발송·모델 품질·한국어 음질·배포 설정의 증거가 아니다. 실제 호출은 승인된 키와 권리 확인 자료를 준비한 담당자가 별도로 실행한다. B의 개발 작업에서는 외부 AI·TTS 호출 0회를 유지한다.

각 항목에 담당자, 실행 시각(Asia/Seoul), 배포 SHA, 환경, 성공/실패, 비밀값을 제거한 증거 링크를 남긴다. 키·비밀번호·OTP·관람 질문 원문은 이 문서나 PR에 붙이지 않는다. 실패한 항목은 미완료로 남기고 해당 기능을 활성화하지 않는다.

# 실행 순서와 현재 경계

[SRC-058](../references/user-api-rollout-publication.md)에 따라 지금은 최소 승인·게시 UI와 인증된 정리 GET만 준비한다. 유료 호출, 실제 메일, 원격 환경 변수·스케줄 설정은 실행하지 않는다. 아래 항목은 이후 승인된 실환경 작업의 점검표다.

1. 글 API를 `npm run ai:smoke -- qa`, `npm run ai:smoke -- draft`, `npm run ai:smoke -- judge`로 하나씩 확인한다. 작업 종류 없는 실행은 오류다. 각 smoke는 최대 한 번의 제공사 요청이며 업무별 모델 접근과 생성/평가 계열 분리를 확인한다.
2. `npm run ai:smoke -- tts`, `npm run ai:smoke -- stt --audio=권리확인한파일경로`로 음성을 확인한다. 전사 파일은 30초·3MiB 이내다. SMTP·6자리 코드·직접 로그인을 별도로 확인한다.
3. 예상 Q&A → 미리보기 → 지시문 재작성 플래그를 각각 켜고 검증한 다음 최종 설정으로 가입부터 관람 음성까지 한 번 이어서 확인한다. 파일 읽기는 동의·후보 검수/적용 화면 준비 후 활성화한다.
4. 정리 스케줄 연결, 마지막으로 미사용 코드/브랜치를 정리한다. 작업 일일 100회는 비용 상한이 아니며 직접 adapter를 호출하는 smoke에 작가 HTTP 작업 한도가 자동 적용된다고 가정하지 않는다. 제공사별 요청 수·토큰·실제 청구 사용량을 확인한다.

# 무료 텍스트 제공사 선택 시험

[무료 제공사 요청](../references/user-free-ai-providers.md)에 따른 선택 경로다. 이 작업에서는 실제 호출을 하지 않았다. 기존 Liner 기본 경로는 유지하며 음성, 자료 추출, 자동화는 이 시험 범위가 아니다. 해당 기능은 비활성 상태를 유지하고 호출하지 않는다. 전체 앱이 무료라는 뜻이 아니다.

1. [Google AI Studio](https://aistudio.google.com/api-keys)에서 결제가 연결되지 않은 프로젝트의 `GEMINI_API_KEY`를 발급하고, [Groq 콘솔](https://console.groq.com/keys)에서 Free plan의 `GROQ_API_KEY`를 발급한다. 유료 플랜으로 업그레이드하지 않는다. **실행 직전** 계정의 결제 상태, 모델 접근, 현재 무료 제공량과 잔여 한도를 각 콘솔에서 확인한다. 코드는 계정의 무료 등급이나 과금 상태를 증명하거나 보장하지 못한다. 확인할 수 없으면 실호출을 중단한다.
2. 비밀값은 서버 전용 로컬 환경에만 넣고 저장소·로그·화면에 노출하지 않는다. `.env.example`의 주석 예시처럼 QA/DRAFT/ORGANIZE는 `gemini:gemini-3.5-flash-lite`, JUDGE는 `groq:openai/gpt-oss-120b`로 명시한다. 기존 같은 이름 설정을 교체하며 중복하지 않는다. 로컬 앱 시험 준비 중에는 공유 예시의 `live` 값을 `AI_PROVIDER_MODE=mock`으로 바꾼다. 무료 Gemini 입력은 제품 개선에 사용될 수 있으므로 합성 자료만 쓴다.
3. `npm run ai:check -- --text`로 QA/DRAFT/JUDGE/ORGANIZE의 실제 live 설정을 네트워크 없이 검사한다. 출력의 QA/DRAFT/ORGANIZE 제공사가 `gemini`, JUDGE가 `groq`인지 확인한다. 이 명령은 다른 유료 경로의 설정도 검사할 수 있는 범용 도구이며, 키 접근·무료 상태·모델 품질은 확인하지 않는다. 오류를 해결하고 다시 계정 상태를 확인한다.
4. CLI smoke는 DB가 필요하지 않다. 앱에서 이 제공사를 사용하려면 `20261114235000_free_text_provider_usage.sql`을 먼저 전진 적용한다. 관람·자료 정리의 사용량 저장 함수에서 두 제공사를 허용하며 기존 권한·입력 제한을 유지한다. 이 작업의 로컬 검증은 트랜잭션 적용 후 롤백한 리허설이며 원격 DB에는 적용하지 않았다.
5. 실호출이 승인된 경우에만 별도 시험 프로세스에서 `AI_PROVIDER_MODE=live`를 명시하고 `npm run ai:smoke -- qa`, `npm run ai:smoke -- draft`, `npm run ai:smoke -- judge`를 각각 실행한다. 명령 하나당 제공사 요청은 최대 1회다. 이후 필요하면 `npm run ai:compare -- --mode=live --cases=grounded --repeats=1 --max-calls=8`을 실행한다. 전체 예산은 최대 8회다. 자동 유료 fallback은 없다. 한도·사용량·청구 상태를 확인하고 결과는 사람 검토한다.

[Gemini 가격](https://aistudio.google.com/docs/pricing#gemini-3.5-flash-lite)과 [Groq 한도](https://console.groq.com/docs/rate-limits)는 변경될 수 있으며 계정 콘솔이 적용 한도의 기준이다. 각 호출은 무료 상태 확인 후에도 제공사 정책과 실제 계정 조건을 따른다.

키 설정 예시는 다음과 같다. 기존 `.env.local`의 같은 항목을 교체하고 Supabase·다른 키는 보존한다. 현재 어댑터는 아래 두 모델만 허용한다. 음성·파일 읽기·자동화는 별도 제공사와 설정이 필요하다.

```dotenv
AI_PROVIDER_MODE=mock
GEMINI_API_KEY=발급받은_Gemini_키
GROQ_API_KEY=발급받은_Groq_키
AI_ROUTE_DOCENT=gemini:gemini-3.5-flash-lite
AI_ROUTE_ORGANIZE=gemini:gemini-3.5-flash-lite
AI_ROUTE_JUDGE=groq:openai/gpt-oss-120b
```

무료 상태 확인 후 **별도 PowerShell 터미널**에서만 `$env:AI_PROVIDER_MODE='live'`로 설정하고 위 smoke 명령을 실행한다. 끝나면 터미널을 닫는다. `.env.local`은 mock을 유지하며, 셸 환경값이 파일값보다 우선한다. API 호출은 이번 구현·검증에서 실행하지 않았다. 무료 할당량을 넘으면 오류를 보고하고 자동 재시도·유료 경로 전환은 하지 않는다. 후보 비교는 최대 8회 호출이므로 1회 smoke 성공 후 잔여 요청·토큰 한도를 다시 확인한다.

# Auth와 기본 배포

- [ ] 배포 SHA와 migration 적용 순서 확인. 기존 데이터를 보존하며 신규 migration을 전진 적용한다. 서비스 역할 키는 서버 전용이고 브라우저 번들에 포함되지 않는다.
- [ ] `APP_ORIGIN`과 실제 HTTPS 주소·Auth 리디렉션 허용 목록을 맞춘다. 로그인 쿠키의 Secure·SameSite, 다른 출처 쓰기 거부, 로그아웃 후 관리자 401을 확인한다.
- [ ] 클라우드 Supabase 공개 가입 OFF, 이메일 인증 ON, 최소 비밀번호 8자, 코드 6자리와 코드 전용 이메일 템플릿을 확인한다. 실제 발신자·수신/스팸함·재발송 한도를 확인한다. [스티비 Preview 설정](api-contract.md#preview-스티비-가입-인증)을 사용하면 전용 주소록과 훅을 점검한다.
- [ ] 가입→코드 확인→직접 비밀번호 로그인. 확인만으로 관리자 세션이 생기지 않고 미인증·다른 작가 요청이 거부된다. 최초 signupRequestId를 확인/재발송까지 유지한다.
- [ ] `FEATURE_SIGNUP`은 위 검증 후 활성화한다. 최초 가입 ID 유실 복구·비밀번호 재설정의 미구현 경계를 사용자 안내와 맞춘다.
- [ ] 한도용 HMAC 비밀값과 신뢰 프록시 헤더를 확인한다. 행사 공유 NAT에서 실제 사용량을 측정하고, 원본 IP를 저장하지 않는다.

# 실제 AI·음성·공개 흐름

- [ ] 기존 환경의 서로 다른 DRAFT·QA 값을 제거하고 `AI_ROUTE_DOCENT` 하나로 이전한다. 기본 도슨트는 Liner Luna, 독립 판정은 Sonnet이며 명시적 기존 JUDGE 값도 의도한 모델인지 확인한다. 원격 환경 변경은 배포 담당 작업이다. [실측·토큰·음성 수정 근거](../research/liner-docent-live-validation.md).
- [ ] Gemini TTS는 PCM 요청→서버 MP3 변환 경로를 확인한다. raw PCM을 MP3로 이름만 바꿔 보내지 않는다. 짧은 실제 답변으로 저장·재전송·브라우저 재생을 확인하고 큰 음성/모바일 호환은 별도 점검한다.

- [ ] `AI_PROVIDER_MODE=live`, 업무별 제공사·모델 ID·키 권한을 확인한다. `npm run ai:check`는 설정 검사일 뿐 실제 호출 성공이 아니다.
- [ ] 플러그인 버전·해시, 모델/음성 설정 버전과 배포 SHA를 기록한다. 평가 모델은 생성 모델과 다른 계열이라는 기존 계약을 확인한다.
- [ ] 권리 확인된 작가/전시/작품 자료로 생성→수정→근거/해설 승인→명시적 게시를 실행한다. 승인 전 데이터·미리보기 대화·다른 작가 자료가 공개 응답에 없는지 확인한다.
- [ ] 시험용 해설·모의 음성은 운영 게시/재개에서 거부되는지 확인한다. 실제 결과의 사람 검수와 모의 성공을 혼동하지 않는다.
- [ ] 개발 DB를 운영으로 전환할 때는 먼저 개발 공개 전시를 중지하고 모든 활성 작품을 live 모드로 명시적 재게시한다. 모의 Q&A는 신규 snapshot에서 제외되며 기존 모의 Q&A 공개본의 운영 재개·미선택 유지·재전송은 거부된다. 환경 변수만 live로 바꾸는 것은 공개 데이터 전환이 아니다. 기존 read API는 배포 모드를 판별하지 않으므로 중지/재게시 전에는 운영 트래픽을 열지 않는다.
- [ ] 기존 DB에는 누락된 공유 migration 번호도 확인하여 전진 적용한다(`--include-all` 필요 여부 확인). 이미 적용/공유한 파일의 이름·본문·ledger를 바꾸거나 reset하지 않는다. 새 DB CI 성공은 기존 DB의 전진 적용 증거와 구분한다.
- [ ] 답변의 근거 정확성·자료에 없는 질문의 유보·잘못된 번호·모호한 작품 지칭을 사람이 검토한다. 기대 근거와 실패 유형을 기록하고 근거 없는 내용을 추가하지 않는다.
- [ ] 한국어 TTS의 작품명·숫자·고유명사 발음, 끊김·첫 재생 지연·모바일 음소거를 확인한다. 작품 선택만으로 호출하지 않고, 음성 인식문은 사용자가 확인한 뒤 전송한다.
- [ ] 게시 교체·중지·근거 철회 후 기존 답변 캐시와 저장 음성·이미지 접근을 다시 검사한다. 오래된 공개본을 계속 사용하지 않는지 확인한다.
- [ ] 글 게시/자동 TTS·Q&A 필수 여부는 최신 결정과 실제 배포의 플래그를 대조한다. 과거 문서 기본값만으로 운영 설정을 결정하지 않는다.

# 참고 파일 읽기와 승인 연결

- [ ] `FEATURE_MATERIAL_EXTRACTION`은 기본 off를 유지하고 후보 검수 화면과 외부 전송 동의가 준비된 뒤 활성화한다. 승인된 테스트 PDF·이미지로만 실행한다.
- [ ] 텍스트 PDF는 로컬 추출, 스캔 PDF·참고 이미지는 실제 Liner 요청과 명시적 OpenAI 대체 경로를 각각 확인한다. 모델 ID·이미지/PDF payload·쪽 제한·혼합/부분 스캔의 누락·오류·비용/지연을 기록한다.
- [ ] 파일 읽기→W2 후보 조회→작가의 명시적 적용→근거/해설 승인→게시를 확인한다. 읽기 성공만으로 자동 적용·승인·공개되지 않으며 비공개 원문·다른 작가 파일이 공개 응답에 없는지 검사한다.
- [ ] 같은 파일 해시 재전송의 캐시·작가 일일 한도·삭제 후 재접근 거부를 확인한다. 파일 읽기와 W2 정리의 작업 한도 소비를 구분하고 실패 캐시의 무단 자동 재시도를 피한다.

# 지연·비용·호스팅

- [ ] 가입/공개 조회/질문/전사/합성을 구분해 표본 수, 동시 사용자 수, 입력 길이, 모델, 캐시 적중 여부와 p50/p95를 기록한다. 표본이 적으면 그 한계를 명시하며 목표 달성으로 과장하지 않는다.
- [ ] 토큰·음성 길이·요청 수에 따른 실제 사용량과 계정 청구 정보를 대조한다. 작가/관람 한도 초과 후 새 생성은 제한되고 승인 해설 조회는 가능한지 확인한다.
- [ ] Vercel Hobby의 현재 계정 설정·실행 시간·요청 본문 제한을 배포 화면과 공식 문서에서 재확인한다. 저장소의 작가150/관람110/음성90초 설정이 실제 함수 제한 안에 들어가는지 확인한다.
- [ ] 4.5MB를 넘는 자료는 호스팅 요청 본문에 싣지 않고 서명 Storage 업로드 경로로 전달되는지 실제 배포에서 검사한다. 이미지3MiB/PDF6MiB 계약과 초과 거부를 확인한다.
- [ ] 실제 브라우저에서 최초 방문·쿠키·공개 주소·이미지·모바일 음성 재생을 확인한다. API 검사만으로 화면 완료를 표시하지 않는다.

# 스케줄과 운영 인계

- [ ] 정리는 인증된 `GET /api/cron/purge`를 하루 1회 Vercel cron에 등록한다. 기존 POST 호출도 유지한다. Bearer `CRON_SECRET`은 서버 비밀 저장소에 두고 UTC 주기·실행 시각·실패 복구·담당자를 기록한다. 현재 저장소에는 실제 스케줄을 등록하지 않았다. 발송 `POST /api/cron/automation`은 별도 후속 범위다.
- [ ] Hobby Cron의 작업별 하루 1회·시간 단위 실행 정밀도를 재확인한다. 매시간 실행이나 정확한 삭제 시각을 보장한다고 쓰지 않는다. 더 잦은 주기가 실제 필요할 때 별도 스케줄러를 결정한다. [호출 방식](https://vercel.com/docs/schedules/cron-jobs) · [제한](https://vercel.com/docs/schedules/cron-jobs/usage-and-pricing).
- [ ] 인증 없는 cron 요청 거부, 정상 실행 시각·처리 건수·실패 복구를 확인한다. 만료 접근 차단과 파일/본문 물리 삭제를 구분하고 실제 삭제 전 완료로 쓰지 않는다.
- [ ] 업무 발송·채널톡 연동은 별도 범위다. 필요한 경우 수신 동의·운영자 승인·고정 발송 대상과 쿼리 토큰 로그 제거를 확인한다. 예약 안내·Alt·브리핑·운영 집계의 제외 범위를 유지한다.
- [ ] 환경 변수 이름·설정 위치·최종 플래그·배포/복구 순서·미검증 항목을 인계한다. 복구 시 기능 비활성화와 호환 앱 배포를 우선하고 공유 DB를 reset하지 않는다.
