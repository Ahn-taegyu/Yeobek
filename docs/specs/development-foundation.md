---
type: Specification
id: SPEC-012
title: MVP 개발 기반과 검증 범위
description: 실제 Next.js·Supabase 코드의 구성, 현재 구현 범위와 후속 개발 경계.
status: draft
updated: '2026-11-14'
tags: [yeobek, development, database, api]
rag_include: true
generated:
  by: codex/gpt-6
  at: '2026-11-13T14:02:00+09:00'
decision_status: proposed
work_status: in_progress
sources:
- id: backend
  resource: /references/user-backend-completion.md
  title: 백엔드 완성 계획 요청 원문
- id: harness
  resource: /specs/ai-harness.md
  title: 제품 AI 실행 하네스 준비 범위
- id: review-implementation
  resource: /references/user-review-implementation.md
  title: MVP 기반 리뷰 반영 요청
- id: request
  resource: /references/user-development-start.md
  title: MVP 개발 시작·협업·위임 검증 요청
- id: api
  resource: /specs/api-contract.md
  title: HTTP 계약
- id: data
  resource: /specs/data-model.md
  title: 최소 데이터 모델
- id: knowledge
  resource: /specs/artist-knowledge.md
  title: 내부 지식 계약
- id: next
  resource: https://nextjs.org/docs/app/getting-started/installation
  title: Next.js 설치
- id: ssr
  resource: https://supabase.com/docs/guides/auth/server-side/creating-a-client
  title: Supabase 서버 인증
- id: local
  resource: https://supabase.com/docs/guides/local-development
  title: Supabase 로컬 개발
---

# 현재 범위

사용자의 개발 시작 요청에 따라 `feat/mvp-foundation`에서 Next.js App Router·TypeScript와 Supabase PostgreSQL/Auth를 연결한다. 기획 검색용 `docs/`와 작가 입력의 DB 원본은 분리한다. 현재 UI는 비밀번호 표시 전환을 포함한 로그인과 계정 이메일·작가명 미입력 안내·전시 기간/장소/작품 수를 제공하는 자기 전시 목록의 최소 골격이다. 작가 정보·전시·작품의 편집 폼과 관람 화면은 아직 연결하지 않았다.

| 구분 | 현재 코드 | 후속 |
| --- | --- | --- |
| 앱 | Next.js 16.4.6, React 19.3.1, Tailwind CSS 4·PostCSS 설정, Route Handlers, Zod 입력 검사 | 전시/작품 편집 UI, 관람 온보딩·채팅 |
| 인증 | 사전 생성 계정 로그인·로그아웃, 서버 getUser 검증, HttpOnly 쿠키 | 운영 계정 발급·복구 절차 |
| 작가 자료 | 전시·작품 생성/조회/수정, 프로필·문서 조회/수정 API. 프로필·문서는 관련 작업에서 자동 생성 | 이미지/PDF 직접 업로드·검수 |
| 데이터 | 기초 DB와 작업 원장·근거·승인·음성 준비·게시 관련 테이블, RPC·RLS·버전 검사 | 음성 저장·실제 운영 정리 스케줄러 |
| AI | 서버 어댑터·하네스와 W1 해설 작업 원장·생성/조회/재시도/명시적 초안 적용 경로 | 제공사 접근·음성 품질·의미 평가 실측 |
| 배포 | 로컬 Supabase·Next.js, CI 구성 | 실제 클라우드 프로젝트 연결·배포·성능 측정 |

의존성 버전은 루트 `package.json`과 `package-lock.json`이 기준이며 Node 24·npm을 사용한다. 설치 시 발견한 개발 도구의 minimatch 취약점은 `@typescript-eslint/typescript-estree` 하위 패키지에 11.0.1 override를 둔다. 상위 도구가 수정 버전을 채택하면 override를 제거하고 린트를 재확인한다. Next.js의 자동 AGENTS 갱신은 껐으며 버전별 문서는 설치된 `node_modules/next/dist/docs/`를 먼저 읽는다.

앱 설정은 부분 CSP(`base-uri`, `object-src`, `frame-ancestors`)와 frame·MIME·referrer 헤더를 제공한다. 전체 CSP 보호를 구현했다는 뜻은 아니다. App checks CI는 main push, PR, 수동 실행으로 구성한다.

# DB 구현

현재 dev/build는 Next.js 내장 Webpack을 명시한다. Tailwind 설정 후 이 Windows 환경에서 Turbopack PostCSS worker 종료를 재현했고 Webpack 검증은 통과했다. 번들러 재전환은 같은 스타일·API 검사로 확인한다.

실제 SQL은 저장소 루트의 `supabase/migrations/`에 있으며 [논리 모델](data-model.md)을 다음처럼 구체화한다.

| 테이블 | 핵심 제약 |
| --- | --- |
| artist_profiles | 계정당 하나, 첫 프로필 조회 또는 첫 전시 생성에 프로필·문서 원자 생성 |
| exhibitions | 동일 소유자 작가 FK, 초안과 공개 표시 필드 분리, 날짜 쌍·기간 검사 |
| artworks | 전시 내 번호 유일, 동일 소유자 전시·이미지·publication 참조 |
| knowledge_documents | artist/exhibition/artwork FK 중 하나만 지정, 주체당 하나, section·출처·revision |
| materials | 소유자·주체 범위, 비공개 파일 key/크기 또는 텍스트, 상태·version |
| publications | 작품 공개 스냅샷 행, 해설·음성 글 해시 일치, 수정·삭제 금지·철회 시각 최초 설정만 허용. W4 근거 내용/버전 검증을 적용했고 실제 미디어 확인은 후속 |
| api_requests | 관람 요청 예약·검증된 답변·단계 기록, 세션 해시+요청 ID, TTL·동일 요청 재사용. 정리 RPC/HTTP 구현 |

인증 사용자의 테이블 읽기는 owner RLS를 적용하고 직접 쓰기는 막는다. 쓰기는 명시적으로 허용한 RPC가 `auth.uid()`·소유권·참조 범위·revision을 다시 검사한다. W1 작업 예약·완료는 서버 전용 신뢰 worker가 `SUPABASE_SERVICE_ROLE_KEY`를 사용하며 owner는 검증된 세션에서만 전달한다. 일반 사용자 요청은 세션과 소유권을 검사한다. 테스트 계정 생성은 폐기 가능한 로컬 스택의 관리 키를 사용한다.

초안 저장은 정형 필드와 내부 문서를 같은 트랜잭션에서 바꾼다. 두 revision 중 하나라도 오래되면 전체 변경을 되돌린다. 문서는 revision과 출처 검사 후 sections/sourceRefs가 기존 JSONB 값과 다를 때만 revision이 증가한다. 같으면 유지한다. 정형 정보 revision은 성공 저장마다 증가하며 UI는 각각의 서버 반환값을 사용한다. 생성 ID와 정규화 입력의 UTF-8 해시로 재시도를 구분한다. 정상 최초 생성은 201, 같은 소유자의 삭제되지 않은 리소스에 대한 동일 입력 재시도는 현재 저장본과 200, 같은 ID의 다른 입력은 409다. 타인·삭제된 리소스의 ID는 404다.

출처는 저장하는 section을 가리킨다. 기존 초안의 정확히 같은 참조는 보존하며 변경·이용 불가 여부를 문서 응답의 `sourceWarnings`로 알린다. 신규·변경 참조는 소유·상위 범위와 section 및 현재 revision을 검증한다. 문서 revision 충돌 P1001은 409 `SOURCE_REVISION_CONFLICT`, 사용 불가 P1002는 400 `SOURCE_UNAVAILABLE`이다. 자료 출처는 자기/상위 주체의 ready 자료를 검사하며 material version이나 실제 PDF 총 페이지 수는 확인하지 않는다. 이것은 **초안 연결 검사**이며 승인 근거의 역사·검색·철회 기능을 완료했다는 뜻이 아니다.

프로필 표시 이름은 선택이고 생략 또는 null을 허용한다. section 본문은 JavaScript `trim()` 기준 앞뒤 공백 제거 후 유니코드 코드포인트 5,000개 이하다. 기존 본문과 정규화 결과가 같으면 기존 원문을 유지한다. 정형 PATCH는 전체 값 저장으로 선택 필드 생략 시 null이다.

# API와 공개 경계

기존 계정 삭제 FK 제한과 논리 삭제된 작품의 번호 예약은 유지했다. 자동 cascade나 부분 unique 변경은 하지 않았으며 탈퇴·삭제·게시 기능에서 공개 차단 및 번호 예약 정책과 함께 구현한다.

[API 계약](api-contract.md)의 초기 경로를 구현한다. 요청 JSON은 최대 64KiB이며 실제 수신 바이트도 검사한다. owner·state 등 정의 밖 필드는 거부한다. 변경 요청은 Origin을 검사하며 운영 환경에서는 `APP_ORIGIN`을 실제 앱 주소로 지정한다. 인증 서비스 장애 503, 요청 제한 429, 로그인 필요 401을 구별한다. 잘못되거나 운영에서 누락된 `APP_ORIGIN`은 503 `SERVER_CONFIGURATION_ERROR`이며 재시도 불가로 표시한다. 오류에는 `retryable`과 선택적 `retryAfter`를 반환한다. 프로필 조회는 `accountEmail`을 포함하고 전시 목록은 삭제되지 않은 작품 수 `artworkCount`와 최근 수정순을 제공한다. 세션 쿠키는 HttpOnly/Lax이며 HTTPS 앱에서 Secure로 설정한다.

공개 전시/작품 RPC는 현재 전시와 작품이 게시 상태이고 활성 publication이 철회되지 않은 경우에만 명시된 공개 필드를 반환한다. 전시는 적격 작품이 최소 하나 있어야 한다. 작품의 publications 행은 불변성 제약이 있지만 전시의 public_*는 별도 가변 컬럼이며 버전 이력 테이블이 아니다. 내부 문서, 비공개 파일 경로, PDF 원본은 반환하지 않고 이미지·음성 전달도 아직 구현하지 않았다. W4 글 게시 API는 로컬 DB·HTTP와 PR #6 CI를 통과해 병합됐다. 유효한 공개본이 없으면 404다. 공개·관리자 응답은 모두 no-store다.

# W4 글 게시 (PR #6 병합, 음성 후속)

근거와 해설을 별도 승인하고 선택 작품과 승인된 소개 근거 핀을 원자적으로 게시한다. 중지·재개와 다른 전시를 포함한 철회, 출처 버전 변경 검사를 구현했다. 현재 음성 없는 게시·재게시에는 `FEATURE_VOICE_REQUIRED=false`가 필요하다. 서버 worker가 현재 설정을 전달하고 같은 DB 트랜잭션에서 검사하며 기존 공개본은 플래그 변경만으로 바뀌지 않는다. 음성 작업·Storage는 W3 이후다. W4 로컬 DB 197개·단위 357개·build·게시 HTTP 5개와 CI를 통과했다. W5 관람 글 HTTP가 이 공개 문맥 RPC를 사용한다.

# W1 작업 원장 (PR #5 병합)

작가별 일일 작업 한도 초기값은 100회, lease는 180초, 작업 만료는 30일이다. 생성·재시도는 요청 중 동기 실행하며 중단은 GET 상태 확인과 재시도로 복구한다. 소유자 경계와 입력 revision을 검사하고 생성 결과는 별도 PATCH로만 초안에 적용한다. 모의 모드는 development/test에서만 사용한다. DB 타입·권한과 모의 HTTP 로컬 검증을 확인했으며 PR #5 CI를 통과하고 `54437476`으로 병합됐다. 30일 만료 후 접근을 차단하고 물리 삭제는 W5 purge RPC와 보호된 HTTP로 실행한다. 운영 스케줄러 배포는 아직이다. 외부 모델 호출 검증은 아직 없다.

# 실행과 검증

설치·로컬 시작·환경 설정 명령은 저장소 루트 README에 있다. `npm run db:reset`은 자신이 소유한 폐기 가능한 로컬 DB에서만 사용한다. 실제 작가 자료·방문객 자료·클라우드 DB를 검증에 사용하지 않는다.

- `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`: 앱 정적 검사·입력/응답 회귀 검사.
- `npm run db:test`: pgTAP으로 소유자 격리·직접 쓰기 차단·출처·버전 충돌·공개 snapshot 검증. 테스트 트랜잭션은 rollback한다.
- `npm run test:integration`: 실행 중인 로컬 앱과 Supabase에서 실제 쿠키 로그인→자료 저장→충돌/타인 접근 거부→로그아웃. 가짜 계정·초안은 로컬 DB에 남는다.
- `python scripts/knowledge.py verify`: 문서/검색 검사이며 제품 테스트와 별개.

과거 초기 검사로서 구현 497b61b에서 로컬 lint·typecheck·프로덕션 build, 단위 테스트 16개, Supabase pgTAP 53개, HTTP 통합 테스트 7개(상위 1 + 하위 6)가 통과했다. HTTP는 Node fetch와 쿠키 jar로 확인했고 실제 브라우저는 로그인 렌더링·기본 POST 폼만 확인했다. 해당 커밋의 App checks CI도 성공했으며 [재검토서](../reviews/mvp-foundation-2026-11-13.md)에 링크·범위·확인 시점을 기록한다. 최신 재검증은 재검토서 12절을 확인한다. 배포·음성·실제 작가 자료·관람 시연은 미검증이다.

# 다음 구현 순서

11/14 후속 요청의 순서와 완료 기준은 [W0~W8 작업 추적](backend-completion.md)이 우선한다. W0에서 기존 HTTP 17개 계약·타입 클라이언트, 서버 기능 플래그, 서비스 역할만 쓰는 `app_policies`와 비공개 RPC 읽기 함수를 추가했다. 정책 테이블은 한도 집행기가 아니며 작업·관람 RPC 연결은 후속이다. 제공사 경로와 모의 모드는 [조사 기록](../research/backend-provider-routing.md)을 따른다. 아래는 초기 화면 연결 순서의 기록이다.

1. 이 API 위에 작가 정보·전시·작품 입력 폼과 충돌 재조회 UX를 연결한다.
2. 비공개 이미지/PDF 업로드와 수동 발췌·출처 확인을 붙인다.
3. Liner 초안 생성→검수→승인된 해설·음성 준비→원자적 게시를 연결한다. 공개 번호 중복과 근거 철회를 이 단계에서 검증한다.
4. QR/번호·작품 선택과 한 채팅을 연결하고 입력/출력의 네 조합을 테스트한다.

[협업 규칙](../collaboration.md)에 따라 위임 결과는 직접 diff·요구 대조, 교차 검토, 수정 피드백, 실제 검사 후 반영한다. 원격 브랜치 보호와 유료 서비스 설정은 이 작업으로 적용하지 않는다.

작가 해설 후보의 서버 실행 및 비교 범위는 [후보 평가 명세](narration-evaluation.md)를 따른다. W4 글 승인·게시 HTTP를 검증했고 음성·UI와 실사용 품질 검증은 후속이다.

# W5 글 관람 검증과 남은 범위

글 채팅, 공개 버전 일괄 확인, 작가 보완 요청 조회·닫기, 비밀값으로 보호한 만료 정리 HTTP를 연결했다. 실제 공개본으로 승인 해설·질의응답을 제공하고 서버 세션 쿠키, DB 분당/일일 상한, 동일 요청 재사용, 자료 부족 질문만 30일 보관을 적용한다. 음성 인식·낭독·미디어는 W3 이후이며 현재 음성 모드는 선호 값만 보존한다. 자세한 호출 계약은 [API 계약](api-contract.md#w5-글-관람보완-요청-계약)을 따른다.

Sol의 SQL·HTTP 테스트를 부모가 읽고 직접 실행했으며 별도 Sol이 서버 코드를 교차 검토했다. 전시 변경을 통한 분당 한도 우회, 비활성 보완 요청의 직접 DB 접근, UUID 대소문자, 취소·재시도 오류 매핑과 기록 장애의 정상 답변 차단을 발견·수정했다. 전진 migration·pgTAP 233개, 단위 383개(381개 전체와 추가 cron 인증 2개), typecheck·build, 관람 HTTP 5개와 기능 비활성 HTTP 2개를 확인했다. 실제 외부 AI 호출은 0회다. 정리 RPC/HTTP는 준비됐지만 운영 스케줄러는 배포 때 별도로 연결해야 한다.
