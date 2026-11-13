---
type: Specification
id: SPEC-012
title: MVP 개발 기반과 검증 범위
description: 실제 Next.js·Supabase 코드의 구성, 현재 구현 범위와 후속 개발 경계.
status: draft
updated: '2026-11-13'
tags: [yeobek, development, database, api]
rag_include: true
generated:
  by: codex/gpt-6
  at: '2026-11-13T14:02:00+09:00'
decision_status: proposed
work_status: in_progress
sources:
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

사용자의 개발 시작 요청에 따라 `feat/mvp-foundation`에서 Next.js App Router·TypeScript와 Supabase PostgreSQL/Auth를 연결한다. 기획 검색용 `docs/`와 작가 입력의 DB 원본은 분리한다. 현재 UI는 로그인과 자기 전시 목록 조회의 최소 골격이다. 작가 정보·전시·작품의 편집 폼과 관람 화면은 아직 연결하지 않았다.

| 구분 | 현재 코드 | 후속 |
| --- | --- | --- |
| 앱 | Next.js 16.4.6, React 19.3.1, Route Handlers, Zod 입력 검사 | 전시/작품 편집 UI, 관람 온보딩·채팅 |
| 인증 | 사전 생성 계정 로그인·로그아웃, 서버 getUser 검증, HttpOnly 쿠키 | 운영 계정 발급·복구 절차 |
| 작가 자료 | 전시·작품 생성/조회/수정, 프로필·문서 조회/수정 API. 프로필·문서는 관련 작업에서 자동 생성 | 이미지/PDF 직접 업로드·검수 |
| 데이터 | 7개 테이블·RPC·RLS·버전 검사·공개 조회 gate | 승인·게시·철회 실행 경로와 TTL 정리 |
| AI | 아직 호출하지 않음 | Liner 해설 생성, 승인 근거 Q&A, 독립 STT/TTS |
| 배포 | 로컬 Supabase·Next.js, CI 구성 | 실제 클라우드 프로젝트 연결·배포·성능 측정 |

의존성 버전은 루트 `package.json`과 `package-lock.json`이 기준이며 Node 24·npm을 사용한다. 설치 시 발견한 개발 도구의 minimatch 취약점은 `@typescript-eslint/typescript-estree` 하위 패키지에 11.0.1 override를 둔다. 상위 도구가 수정 버전을 채택하면 override를 제거하고 린트를 재확인한다. Next.js의 자동 AGENTS 갱신은 껐으며 버전별 문서는 설치된 `node_modules/next/dist/docs/`를 먼저 읽는다.

# DB 구현

실제 SQL은 저장소 루트의 `supabase/migrations/`에 있으며 [논리 모델](data-model.md)을 다음처럼 구체화한다.

| 테이블 | 핵심 제약 |
| --- | --- |
| artist_profiles | 계정당 하나, 첫 프로필 조회 또는 첫 전시 생성에 프로필·문서 원자 생성 |
| exhibitions | 동일 소유자 작가 FK, 초안과 공개 표시 필드 분리, 날짜 쌍·기간 검사 |
| artworks | 전시 내 번호 유일, 동일 소유자 전시·이미지·publication 참조 |
| knowledge_documents | artist/exhibition/artwork FK 중 하나만 지정, 주체당 하나, section·출처·revision |
| materials | 소유자·주체 범위, 비공개 파일 key/크기 또는 텍스트, 상태·version |
| publications | 작품 공개 스냅샷 행, 해설·음성 글 해시 일치, 수정·삭제 금지·철회 시각 최초 설정만 허용. 근거 내용/버전 검증과 실제 미디어 확인은 후속 |
| api_requests | 미래 관람 요청의 단기 상태, 세션 해시+요청 ID, 만료 시각. 아직 실행·자동 정리 없음 |

인증 사용자의 테이블 읽기는 owner RLS를 적용하고 직접 쓰기는 막는다. 쓰기는 명시적으로 허용한 RPC가 `auth.uid()`·소유권·참조 범위·revision을 다시 검사한다. 앱은 service-role 키를 사용하지 않는다. 테스트 계정 생성 스크립트만 폐기 가능한 로컬 스택의 관리 키를 사용한다.

초안 저장은 정형 필드와 내부 문서를 같은 트랜잭션에서 바꾼다. 두 revision 중 하나라도 오래되면 전체 변경을 되돌린다. 문서는 revision과 출처 검사 후 sections/sourceRefs가 기존 JSONB 값과 다를 때만 revision이 증가한다. 같으면 유지한다. 정형 정보 revision은 성공 저장마다 증가하며 UI는 각각의 서버 반환값을 사용한다. 생성 ID와 정규화 입력의 UTF-8 해시로 재시도를 구분한다. 정상 최초 생성은 201, 같은 소유자의 삭제되지 않은 리소스에 대한 동일 입력 재시도는 현재 저장본과 200, 같은 ID의 다른 입력은 409다. 타인·삭제된 리소스의 ID는 404다.

출처는 저장하는 section을 가리킨다. 문서 출처는 같은 소유자의 상위 작가·전시 문서로 제한하고 저장 시 원본의 현재 revision과 section 존재를 검사한다. 상위 문서 수정 후 이미 저장된 참조는 자동 갱신되지 않으며 오래된 참조로 재저장하면 409다. 자료 출처는 자기/상위 주체의 ready 자료 ID를 검사하며 material version을 고정하지 않는다. PDF 쪽수는 양의 정수·순서·정수 상한을 검사하며 실제 파일의 총 페이지 수는 확인하지 않는다. 이것은 **초안 연결 검사**이며 승인 근거의 역사·검색·철회 기능을 완료했다는 뜻이 아니다.

# API와 공개 경계

[API 계약](api-contract.md)의 초기 경로를 구현한다. 요청 JSON은 최대 64KiB이며 실제 수신 바이트도 검사한다. owner·state 등 정의 밖 필드는 거부한다. 변경 요청은 Origin을 검사하며 운영 환경에서는 `APP_ORIGIN`을 실제 앱 주소로 지정한다. 인증 서비스 장애 503, 요청 제한 429, 로그인 필요 401을 구별한다. 세션 쿠키는 HttpOnly/Lax이며 HTTPS 앱에서 Secure로 설정한다.

공개 전시/작품 RPC는 현재 전시와 작품이 게시 상태이고 활성 publication이 철회되지 않은 경우에만 명시된 공개 필드를 반환한다. 전시는 적격 작품이 최소 하나 있어야 한다. 작품의 publications 행은 불변성 제약이 있지만 전시의 public_*는 별도 가변 컬럼이며 버전 이력 테이블이 아니다. 내부 문서, 비공개 파일 경로, PDF 원본은 반환하지 않고 이미지·음성 전달도 아직 구현하지 않았다. 게시 실행 API가 없으므로 현재 앱으로 만든 초안의 공개 조회는 404가 정상이다. SQL 테스트의 승인 데이터는 신뢰된 테스트 픽스처이며 제품의 게시 기능으로 세지 않는다. 공개·관리자 응답은 모두 no-store다.

# 실행과 검증

설치·로컬 시작·환경 설정 명령은 저장소 루트 README에 있다. `npm run db:reset`은 자신이 소유한 폐기 가능한 로컬 DB에서만 사용한다. 실제 작가 자료·방문객 자료·클라우드 DB를 검증에 사용하지 않는다.

- `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`: 앱 정적 검사·입력/응답 회귀 검사.
- `npm run db:test`: pgTAP으로 소유자 격리·직접 쓰기 차단·출처·버전 충돌·공개 snapshot 검증. 테스트 트랜잭션은 rollback한다.
- `npm run test:integration`: 실행 중인 로컬 앱과 Supabase에서 실제 쿠키 로그인→자료 저장→충돌/타인 접근 거부→로그아웃. 가짜 계정·초안은 로컬 DB에 남는다.
- `python scripts/knowledge.py verify`: 문서/검색 검사이며 제품 테스트와 별개.

초기 구현 497b61b에서 로컬 lint·typecheck·프로덕션 build, 단위 테스트 16개, Supabase pgTAP 53개, HTTP 통합 테스트 7개(상위 1 + 하위 6)가 통과했다. HTTP는 Node fetch와 쿠키 jar로 확인했고 실제 브라우저는 로그인 렌더링·기본 POST 폼만 확인했다. 해당 커밋의 App checks CI도 성공했으며 [재검토서](../reviews/mvp-foundation-2026-11-13.md)에 링크·범위·확인 시점을 기록한다. 배포·음성·실제 작가 자료·관람 시연은 미검증이다.

# 다음 구현 순서

1. 이 API 위에 작가 정보·전시·작품 입력 폼과 충돌 재조회 UX를 연결한다.
2. 비공개 이미지/PDF 업로드와 수동 발췌·출처 확인을 붙인다.
3. Liner 초안 생성→검수→승인된 해설·음성 준비→원자적 게시를 연결한다. 공개 번호 중복과 근거 철회를 이 단계에서 검증한다.
4. QR/번호·작품 선택과 한 채팅을 연결하고 입력/출력의 네 조합을 테스트한다.

[협업 규칙](../collaboration.md)에 따라 위임 결과는 직접 diff·요구 대조, 교차 검토, 수정 피드백, 실제 검사 후 반영한다. 원격 브랜치 보호와 유료 서비스 설정은 이 작업으로 적용하지 않는다.
