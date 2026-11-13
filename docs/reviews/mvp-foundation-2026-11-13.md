---
type: Guide
id: GUIDE-006
title: Yeobek MVP 개발 기반 작업 검토서
description: 초기 구현의 근거·재검토 이력과 검토 결과를 실제 코드에 반영한 내용 및 재검증 범위를 기록한다.
status: stable
updated: '2026-11-13'
tags: [yeobek, review, foundation]
rag_include: false
generated:
  by: codex/gpt-6
  at: '2026-11-13T14:29:32+09:00'
sources:
- id: review-implementation
  resource: /references/user-review-implementation.md
  title: 검토 내용의 실제 구현 반영 요청
- id: code-plan-review-request
  resource: /references/user-code-plan-review.md
  title: 실제 코드 검토와 기획 대조 기록 요청
- id: screens
  resource: /specs/screen-spec.md
  title: SC-A01·A02 화면 명세
- id: scenarios
  resource: /specs/user-scenarios.md
  title: UC·AC·EX 시나리오와 예외 코드
- id: knowledge-contract
  resource: /specs/artist-knowledge.md
  title: 내부 지식 저장·재사용 계약
- id: stack
  resource: /specs/technology-stack.md
  title: 기술 스택과 저장 단위
- id: revision-request
  resource: /references/user-review-revision.md
  title: 검토서 재확인과 수정 요청
- id: project-name
  resource: /references/user-project-name.md
  title: 프로젝트 이름을 Yeobek으로 정정
- id: review-request
  resource: /references/user-review-request.md
  title: 작업 근거를 포함한 검토 자료 요청
- id: development-request
  resource: /references/user-development-start.md
  title: 개발 착수·협업·교차 검증 요구
- id: knowledge-decision
  resource: /decisions/D-011-knowledge-and-screens.md
  title: DB 원본과 내부 지식·화면 요구
- id: requirements
  resource: /specs/functional-spec.md
  title: 기능·업무 규칙과 API 작업
- id: foundation
  resource: /specs/development-foundation.md
  title: 개발 기반 현황
- id: ci
  resource: https://github.com/Ahn-taegyu/Yeobek/actions/runs/43370914655
  title: 497b61b의 App checks 성공
---

# 먼저 판단할 내용

**최신 구현 반영 결과는 12절이다.** 1~11절은 당시 커밋의 검토 이력이다. 그 절의 미수정·검사 수·코드 기준은 과거 시점이며, 현재 계약은 [API 계약](../specs/api-contract.md)과 [개발 기반](../specs/development-foundation.md)을 따른다.

현재 Yeobek은 **작가 초안을 소유자별로 저장할 개발 기반**까지 구현했다. 로그인과 전시 목록의 최소 화면, 전시·작품 생성/조회/수정 API, 작가 프로필·내부 문서 조회/수정 API가 있다. 프로필과 내부 문서는 관련 조회·생성 작업에서 자동으로 마련된다. **작가 정보·전시·작품 편집 폼, 파일 업로드, AI 해설·Q&A·음성, 승인/게시, 관람 채팅은 후속 구현 범위다.**

작가 위키는 DB의 구조화된 문서와 관계로 구현했다. AI가 이 문서를 검색해 답변하는 제품 RAG는 아직 없다. 기존 docs의 OKF·Bases·로컬 검색은 기획용으로 유지한다. 따라서 “위키 저장 기반을 만들었다”와 “AI가 그 자료로 정확하게 설명한다”를 별도로 검토해야 한다.

**이번 재검토의 코드 기준은 460e87d**다. 최초 기반 구현은 `497b61b`이며 이후 앱 변경은 헤더의 `YEOBEK` → `Yeobek` 표기뿐이다. API·DB·테스트 소스는 두 커밋에서 동일하므로 아래 초기 구현 증거 링크는 `497b61b`에 고정한다. 이번 수정은 검토서와 연결된 현황·계약 문서에 한정하며 제품 코드는 바꾸지 않았다.

**이전 검토의 오류를 정정한다.** 설치된 Zod 4.6.7을 직접 실행하고 소스를 확인한 결과 문자열 상한은 코드포인트 기준이다. 이전의 “Zod는 UTF-16, SQL은 코드포인트라 서로 다르다”는 진단은 철회한다. 결합 문자·복합 이모지를 화면에서 몇 자로 표시할지는 별도의 UI 정책 문제이며, 확인된 서버 간 길이 불일치로 취급하지 않는다.

# 1. 검토할 변경 범위

[초기 구현 변경 비교](https://github.com/Ahn-taegyu/Yeobek/compare/726811827788d92074104dd95d71e23807010062...497b61b4baec776ffd9a9205fb0abc867efae207): 기획 저장소 상태 `7268118`부터 작업 브랜치 `feat/mvp-foundation`의 `497b61b`까지. [후속 변경 비교](https://github.com/Ahn-taegyu/Yeobek/compare/497b61b4baec776ffd9a9205fb0abc867efae207...460e87d18b764a590c90fc9a0de792949b5e4ac8)는 검토서 추가와 이름 정정이다.

| 커밋 | 변경 | 검토 목적 |
| --- | --- | --- |
| [ee5d532](https://github.com/Ahn-taegyu/Yeobek/commit/ee5d5325cce7028bd341ea5e53ba39ce98552524) | 협업 규칙·기여 안내·PR 양식·요청 원문 | 팀 운영 방식이 실제 팀 규모에 맞는지 |
| [e4c0de7](https://github.com/Ahn-taegyu/Yeobek/commit/e4c0de71e6ace094ea09b1b1876a20274a9b1831) | Next.js·Supabase·DB/API·테스트·실행 문서 | 요구와 코드, 완료 범위가 일치하는지 |
| [497b61b](https://github.com/Ahn-taegyu/Yeobek/commit/497b61b4baec776ffd9a9205fb0abc867efae207) | CI 앱 준비 대기의 실패 처리 보완 | 준비되지 않은 서버로 검사하지 않는지 |
| [bc65fcd](https://github.com/Ahn-taegyu/Yeobek/commit/bc65fcd7b4fc0b573b4ea67245f8137ab5b25488) | 최초 검토서와 근거 기록 | 당시 코드·검사 범위와 미해결 차이 |
| [460e87d](https://github.com/Ahn-taegyu/Yeobek/commit/460e87d18b764a590c90fc9a0de792949b5e4ac8) | Yeobek 이름 정정 | 문서·지침·앱 헤더 표기, 과거 원문과 공유 migration 보존 |

초기 구현 비교는 66개 파일 변경이며 추가 줄 중 7,663줄은 의존성 잠금 파일이다. 위 숫자는 후속 이름 정정·검토 문서를 포함한 현재 전체 diff가 아니다. main 병합·PR 생성·클라우드 배포·협업자 권한·브랜치 보호 변경은 수행하지 않았다. 기존 `docs/.obsidian/appearance.json` 개인 변경도 커밋에서 제외한다.

# 2. 요구 근거 → 구현 판단 → 확인할 코드

**사용자 확정**과 **구현자가 구체화한 선택**을 나눴다. 상세 명세의 proposed 항목을 사용자 승인으로 승격하지 않았다.

| 작업 | 근거와 확정 수준 | 이렇게 만든 이유와 대가 | 구현 증거 |
| --- | --- | --- | --- |
| Next.js·Supabase 시작 | [사용자의 직접 지시](../references/user-development-start.md), [D-008](../decisions/D-008-technology-stack.md) | 화면·API를 한 프로젝트에서 개발. 별도 서버 운영을 줄이지만 긴 AI 작업·파일 처리는 후속 경계 설계가 필요 | [버전·명령](https://github.com/Ahn-taegyu/Yeobek/blob/497b61b4baec776ffd9a9205fb0abc867efae207/package.json), [Route Handlers](https://github.com/Ahn-taegyu/Yeobek/blob/497b61b4baec776ffd9a9205fb0abc867efae207/src/app/api/admin/exhibitions/route.ts) |
| 작가·전시·작품을 별도 문서로 연결 | [D-011 사용자 확정](../decisions/D-011-knowledge-and-screens.md#사용자-확정-요구), [BR-15](../specs/functional-spec.md#br-15-내부-지식과-작가-공통-정보) | 정형 정보와 서술 문서를 구분하고 DB를 원본으로 보존. 자유로운 Markdown 그래프 전체를 구현한 것은 아님 | [주체별 문서 FK·section·출처](https://github.com/Ahn-taegyu/Yeobek/blob/497b61b4baec776ffd9a9205fb0abc867efae207/supabase/migrations/20261113030000_mvp_schema.sql#L73) |
| 사전 계정 로그인·소유자 격리 | 사용자 요구는 작가 로그인. 사전 발급 계정과 소유자별 격리는 [역할·접근 설계](../specs/functional-spec.md#3-역할과-접근-권한)를 구체화한 방식 | 서버에서 인증 확인, DB에서도 소유자 제한. 앱에 service-role 키를 넣지 않음 | [getUser](https://github.com/Ahn-taegyu/Yeobek/blob/497b61b4baec776ffd9a9205fb0abc867efae207/src/lib/api/db.ts#L8), [RLS·쓰기 권한](https://github.com/Ahn-taegyu/Yeobek/blob/497b61b4baec776ffd9a9205fb0abc867efae207/supabase/migrations/20261113030000_mvp_schema.sql#L196) |
| 저장을 DB 함수(RPC)로 묶음 | [BR-01](../specs/functional-spec.md#br-01-저장미저장동시-편집), 내부 지식 저장 명세의 원자성 요구. **RPC 자체는 구현 선택** | 정형 정보만 저장되고 문서 저장이 실패하는 상태를 방지. 대신 SQL 로직과 migration 검토 부담이 늘어남 | [프로필과 문서 함께 저장](https://github.com/Ahn-taegyu/Yeobek/blob/497b61b4baec776ffd9a9205fb0abc867efae207/supabase/migrations/20261113030100_mvp_rpc.sql#L253) |
| 두 revision 검사 | BR-01과 원본/문서 분리 설계. **구체 필드 형식은 구현 선택** | 다른 탭의 수정이나 문서 단독 편집을 덮어쓰지 않음. 프런트는 최신 두 버전과 로컬 입력을 함께 관리해야 함 | [문서 저장·잠금·충돌 검사](https://github.com/Ahn-taegyu/Yeobek/blob/497b61b4baec776ffd9a9205fb0abc867efae207/supabase/migrations/20261113030100_mvp_rpc.sql#L174) |
| 생성 재시도 중복 방지 | [BR-14](../specs/functional-spec.md#br-14-실패중복한도). **클라이언트 UUID+입력 해시는 구현 선택** | 연결 실패 후 재전송해도 전시·작품이 중복 생성되지 않음. 같은 작업 재시도에는 같은 ID를 유지해야 함 | [create_exhibition](https://github.com/Ahn-taegyu/Yeobek/blob/497b61b4baec776ffd9a9205fb0abc867efae207/supabase/migrations/20261113030100_mvp_rpc.sql#L296), [병렬 재시도 검사](https://github.com/Ahn-taegyu/Yeobek/blob/497b61b4baec776ffd9a9205fb0abc867efae207/tests/integration/api.test.mjs#L67) |
| 초안과 공개 스냅샷 분리 | [BR-06~08](../specs/functional-spec.md#br-06-일반-수정과-번호-변경), D-011 | 편집 중 정보가 관람객에게 노출되지 않게 함. 게시 시 복사·승인·철회 처리는 추가 구현 필요 | [publication 제약](https://github.com/Ahn-taegyu/Yeobek/blob/497b61b4baec776ffd9a9205fb0abc867efae207/supabase/migrations/20261113030000_mvp_schema.sql#L125), [공개 조회](https://github.com/Ahn-taegyu/Yeobek/blob/497b61b4baec776ffd9a9205fb0abc867efae207/supabase/migrations/20261113030100_mvp_rpc.sql#L464) |
| Origin·쿠키·JSON 제한 | 접근 권한과 입력 검증 요구를 구현자가 구체화 | 외부 출처의 변경 요청, 정의 밖 owner/state, 과도한 본문을 거부. 64KiB·section 2개·출처 24개는 구현 상한이며 사용자 확정값은 아님 | [HTTP 경계](https://github.com/Ahn-taegyu/Yeobek/blob/497b61b4baec776ffd9a9205fb0abc867efae207/src/lib/api/http.ts), [스키마](https://github.com/Ahn-taegyu/Yeobek/blob/497b61b4baec776ffd9a9205fb0abc867efae207/src/lib/api/schemas.ts), [쿠키](https://github.com/Ahn-taegyu/Yeobek/blob/497b61b4baec776ffd9a9205fb0abc867efae207/src/lib/supabase/server.ts#L8) |
| 로컬 DB와 CI | 개발 시작·검증 요청을 구현자가 구체화 | 실제 클라우드 키 없이 새 환경에서 재현 가능. 초기 Docker 다운로드와 로컬 포트/볼륨 관리 필요 | [로컬 시작](https://github.com/Ahn-taegyu/Yeobek/blob/497b61b4baec776ffd9a9205fb0abc867efae207/scripts/start-local.mjs), [CI](https://github.com/Ahn-taegyu/Yeobek/blob/497b61b4baec776ffd9a9205fb0abc867efae207/.github/workflows/app.yml) |
| 역할별 브랜치·협업 절차 | [사용자 직접 요청](../references/user-development-start.md) | 역할별 브랜치는 확정 요구. 리뷰어 1명·squash·긴급 예외·worktree 운영 세부사항은 제가 작성한 기본안이며 GitHub 설정 적용과는 별개 | [협업 규칙](../collaboration.md), [PR 양식](https://github.com/Ahn-taegyu/Yeobek/blob/497b61b4baec776ffd9a9205fb0abc867efae207/.github/pull_request_template.md) |

# 3. 7개 테이블이 지금 하는 일

| 테이블 | 지금 사용하는 범위 | 아직 없는 부분 |
| --- | --- | --- |
| artist_profiles | 자기 프로필 조회·수정, 전시의 작가 참조 | 작가 정보 편집 UI·운영 계정 발급 흐름 |
| exhibitions | 자기 전시 생성·목록·조회·수정 | 입력 UI·게시/중지 실행 |
| artworks | 작품 생성·목록·조회·수정, 전시 내 번호 중복 제한 | 작품 입력 UI·이미지 업로드·삭제 |
| knowledge_documents | 주체별 본문·출처·revision 저장 및 참조 범위 검사 | 승인 근거 추출·관람 RAG·전체 수정 이력 |
| materials | 원자료 메타데이터 구조와 문서 출처의 범위/상태/쪽수 검사에 간접 사용 | 업로드 허가·완료 검사·자료 생성/삭제 API·실제 파일 |
| publications | 작품 공개 조회와 해당 작품 스냅샷 행의 수정·삭제 차단 | 승인·게시·영향 철회 API, 승인 근거와 실제 이미지·음성 검증 |
| api_requests | 단기 관람 요청을 위한 스키마·타입·접근 제한만 준비 | 실제 요청 처리·요금 집계·만료 후 자동 정리 |

7개 묶음은 [기존 데이터 모델](../specs/data-model.md#엔티티)의 제안에 근거한다. `api_requests`는 선행 설계이며 아직 요청 관리 기능이 아니다. 구현 필요성이 생길 때 필드를 재검토한다.

**불변성이 구현된 대상은 작품의 `publications` 행이다.** `revoked_at`을 처음 설정하는 예외 외의 UPDATE/DELETE를 [trigger](https://github.com/Ahn-taegyu/Yeobek/blob/497b61b4baec776ffd9a9205fb0abc867efae207/supabase/migrations/20261113030000_mvp_schema.sql#L182)로 거부한다. 전시의 `public_*`는 [exhibitions의 별도 컬럼](https://github.com/Ahn-taegyu/Yeobek/blob/497b61b4baec776ffd9a9205fb0abc867efae207/supabase/migrations/20261113030000_mvp_schema.sql#L25)이며 같은 불변 버전 테이블이 아니다. [evidence 제약](https://github.com/Ahn-taegyu/Yeobek/blob/497b61b4baec776ffd9a9205fb0abc867efae207/supabase/migrations/20261113030000_mvp_schema.sql#L137)도 현재는 비어 있지 않은 JSON 배열인지 검사할 뿐, 승인 근거의 내용·버전·참조 타당성을 전부 검증하지 않는다. 따라서 테이블·해시 제약만으로 게시 검증이 완성되었다고 볼 수 없다.

# 4. 프런트 개발 전에 알아야 할 API 동작

11개 경로 파일에 GET/POST/PATCH **17개 처리 함수**가 있다. 전체 입력·응답은 [API 계약](../specs/api-contract.md)에 정리했다. 삭제·파일 업로드·AI 생성·게시 API는 후속 구현 범위다.

- **정형 정보 PATCH 3종은 전체 편집 값 계약이다.** 프로필은 displayName, 전시는 title, 작품은 number/title과 함께 sections·sourceRefs·두 revision을 보낸다. 선택 날짜·장소·작품 메타데이터를 생략하면 null로 정규화된다. 문서 단독 PATCH는 sections·sourceRefs·expectedRevision을 보낸다.
- 정형 정보와 문서를 함께 저장하면 `expectedRevision`과 `expectedDocumentRevision`을 검사한다. 한쪽이 오래되어도 409이며 전체 저장이 취소된다.
- 문서 저장은 현재 revision과 출처 검사를 먼저 통과해야 한다. 그 뒤 sections와 sourceRefs가 기존 JSONB 값과 동일하면 문서 revision을 유지하고, 달라지면 증가시킨다. 정형 정보 revision은 저장 성공마다 증가한다. UI는 성공 횟수로 버전을 추정하지 않고 반환값을 사용해야 한다.
- 새 전시/작품 최초 요청은 201이다. 같은 소유자의 삭제되지 않은 리소스에 대해 동일 ID·동일 정규화 입력을 재전송하면 200과 현재 저장본, 같은 ID에 다른 입력을 보내면 409다. 다른 소유자나 삭제된 리소스의 ID는 404로 처리한다.
- `document` 출처는 같은 소유자의 상위 작가/전시 문서로 제한하고, 저장 시 현재 revision과 section 존재를 검사한다. 상위 문서를 나중에 수정해도 이미 저장된 하위 출처는 자동 갱신되지 않으며 재저장할 때 오래된 참조를 409로 거부한다. 이 거부가 미치는 범위와 오류 구분 문제는 [9.1](#91-화면-구현-전에-결정할-항목)에 정리했다. `material` 출처는 자기/상위 주체 소속의 ready 자료 ID와 PDF 쪽수 형식을 검사하며 자료 version을 고정하지 않는다.
- 초안의 공개 조회는 404다. 공개 전시는 게시 상태에 더해 적격 작품이 하나 이상 있어야 한다. 작품은 현재 전시·작품의 게시 상태와 활성·비철회 publication을 확인한다. 게시 API가 없으므로 현재 일반 사용자 경로로 공개 상태까지 만들 수 없다.
- HTTP 요청 크기·Origin 검사는 Next.js API의 경계다. Supabase의 공개 데이터 API를 직접 호출하는 경우에도 안전해야 할 소유권·본문·출처 검사는 SQL/RLS가 담당한다.
- `/api/health`는 DB의 공개 조회 RPC까지 호출해 준비 여부를 확인한다. Auth·Storage·AI 제공사 전체의 상태를 검사하는 엔드포인트는 아니다.

# 5. 실제 검증 증거와 한계

[초기 구현 커밋의 CI 실행 결과](https://github.com/Ahn-taegyu/Yeobek/actions/runs/43370914655/job/131706230721)를 이번 재검토에서 다시 조회했다. `497b61b`의 App checks 작업과 모든 단계가 success다. 아래 초기 앱 테스트 결과는 이 커밋의 기록이며, `460e87d`나 이번 문서 수정 커밋의 CI 결과로 바꿔 부르지 않는다. 앱 CI에는 문서 검사가 없으며 `Knowledge checks`와 로컬 문서 검증은 별도다.

| 검사 | 확인한 결과 | 입증하는 것 / 입증하지 못하는 것 |
| --- | --- | --- |
| lint·typecheck·build | 로컬 및 CI 성공 | 설정·타입·빌드 가능. 요구사항 충족 전체를 보장하지 않음 |
| [단위 검사](https://github.com/Ahn-taegyu/Yeobek/blob/497b61b4baec776ffd9a9205fb0abc867efae207/tests/unit/api-helpers.test.ts) | 16개 성공 | Origin·본문 크기·알 수 없는 필드·오류 은닉·날짜 필드 오류·응답 형식 |
| [pgTAP](https://github.com/Ahn-taegyu/Yeobek/blob/497b61b4baec776ffd9a9205fb0abc867efae207/supabase/tests/mvp_foundation_test.sql) | 53개 성공 | 실제 PostgreSQL의 소유자 격리·권한·출처·저장 충돌·공개 스냅샷 조건 |
| [HTTP 통합](https://github.com/Ahn-taegyu/Yeobek/blob/497b61b4baec776ffd9a9205fb0abc867efae207/tests/integration/api.test.mjs) | 7개 성공: 상위 검사 1 + 하위 시나리오 6 | Node fetch·쿠키 jar로 Auth/API 검사. 전시 생성은 병렬, 작품 생성은 순차 재시도. 로그아웃 후 갱신된 jar의 401 확인이며 실제 브라우저·기존 토큰 폐기 검증은 아님 |
| DB 타입 차이 | CI에서 생성 결과와 Git 파일 동일 | migration과 TypeScript 스키마 결과 일치. 동적 RPC 인자 매핑은 별도 테스트가 필요 |
| 기획 문서 검사 | 당시 81개 노트·23개 기능·3 Bases, 회귀 검사 9개 성공 | 링크·ID·메타데이터·검색 도구. 설계 의미나 사용자 동의까지 판정하지 않음 |
| 브라우저 | 로그인 렌더링과 form method=post, password 필드 확인 | 실제 브라우저 로그인→편집→게시 전체 E2E, 모바일·음성·접근성 종합 검증은 아님 |

최초 검토서 작성 때는 **83개 노트·회귀 검사 9개**, 이름 정정 때는 **84개 노트·회귀 검사 9개**가 통과했다. 이름 정정 작업 중 로컬 lint·typecheck·단위 16개·build도 통과했다. 이는 각각 당시 실행 기록이다. 이번 재검토에서는 전체 앱 테스트를 반복하지 않고 소스·CI를 대조하고, 아래 입력 스키마를 직접 실행했다.

이번 수정본은 `python scripts/knowledge.py verify`로 **85개 노트·23개 기능·3 Bases·회귀 검사 9개**를 확인했다. 문서 검사 결과를 앱 기능의 완료 판정으로 사용하지 않는다.

공개 정상 응답과 철회 조건은 **SQL에서 신뢰된 테스트 역할로 준비한 데이터**로 확인했다. 작품 제목 덮어쓰기 거부, 작품 초안 수정 후 공개 제목 유지, 유일한 적격 작품 철회 뒤 전시 조회 차단을 검사한다. 게시 API·전시 공개 버전 불변성·다전시 공통 근거 철회까지 검증한 것은 아니다. HTTP에서는 두 초안 공개 경로의 404를 확인한다.

PDF는 메타데이터 픽스처로 pgTAP에서 자기 전시 자료의 1~2쪽 참조 허용, 다른 전시 자료·역순 범위 거부를 확인했다. 숫자 상한은 단위 검사에서 확인한다. SQL에는 양의 정수 검사도 있지만 그 모든 경계값을 테스트한 것은 아니다. 실제 파일 페이지 수·추출·Storage 전송은 검사하지 않았다. HTTP 테스트의 sourceRefs는 빈 배열이므로 중첩 출처의 HTTP→RPC 매핑도 해당 통합 테스트로 입증되지 않는다. 정상 동일 내용 문서 재저장, 선택 필드 생략으로 기존 값을 지우는 동작의 HTTP 회귀 사례는 아직 없다.

시간 부하·대용량 자료·네트워크 끊김·운영 HTTPS 세션·AI 품질은 미검증이다.

## 이번에 직접 실행한 입력 검사

설치된 패키지와 현재 `src/lib/api/schemas.ts`를 Node로 불러 확인했다. DB나 외부 AI는 호출하지 않았다.

| 입력 | 관찰 결과 | 해석 |
| --- | --- | --- |
| profileSchema에 displayName 누락 또는 빈 문자열 | 둘 다 실패 | 프로필 통합 저장의 이름 필수 동작 확인. 문서 단독 PATCH까지 차단한다는 뜻은 아님 |
| 전시 PATCH에서 날짜·장소 생략 | startDate/endDate/place 모두 null | 일반적인 일부 필드 병합이 아님 |
| section body에 😀 2,501개 | 통과: UTF-16 단위 5,002, 코드포인트 2,501 | 기존 UTF-16 진단이 틀렸음을 확인 |
| Zod 문자열 max(1)에 😀 / e+결합 악센트 / 가족 이모지 | 각각 통과 / 실패 / 실패 | 코드포인트와 화면의 문자 묶음은 구분해야 함 |
| section body에 앞뒤 공백 + a 5,000개 | 원문 5,002자 기준으로 거부 | 현재는 본문을 trim한 5,000자로 계산하지 않음 |

Zod 4.6.7의 설치 소스 `node_modules/zod/v4/core/checks.js`는 문자열 상한 검사에서 `codePointLength`를 사용한다. 다음 명령은 저장소 루트에서 이 동작을 재현한다. 잠금 파일과 다른 버전을 사용하면 같은 결과라고 가정하지 않는다.

```sh
node --input-type=module -e 'import { z } from "zod"; console.log(z.string().max(1).safeParse("😀").success);'
```

# 6. 위임 후 실제로 고친 사항

초기 개발에서는 Sol이 DB와 협업 규칙을, Terra가 API 문서와 단위 테스트를 담당했다. 주 에이전트가 요구/코드/테스트를 대조하고 통합 검사를 실행했으며, 아래는 당시 수정 기록이다. 이번에는 Sol이 보고서를 읽기 전용으로 교차 검토했고 주 에이전트가 SQL·HTTP·테스트 소스로 피드백을 재확인했다. Zod 길이 판단은 양쪽에서 실행한 결과를 근거로 이전 보고서의 오류를 정정했다.

| 검토에서 발견한 문제 | 반영한 수정과 확인 |
| --- | --- |
| JSON 텍스트를 bytea로 직접 바꾸면 줄바꿈·따옴표·역슬래시 처리 실패 가능 | UTF-8 변환 후 해시, 해당 문자열 생성/재시도 pgTAP 추가 |
| 같은 문서의 section을 출처로 쓰면 저장 직후 참조 revision이 오래됨 | 현재 모델은 상위 문서 참조만 허용, 자기 문서 참조 거부 검사 |
| 생성 성공과 동일 재시도를 HTTP에서 구별할 수 없음 | RPC가 내부 `_created`를 반환하고 HTTP가 201/200으로 바꾼 뒤 필드를 제거 |
| 로그인 폼이 JS 적용 전 기본 GET으로 제출될 수 있음 | form method=post, 브라우저 DOM 확인 |
| 인증 서비스 장애가 로그인 실패처럼 처리됨 | 503·429·401 분리, 단위 검사 |
| 서버 전용 인증 쿠키가 JS에서 읽히는 기본 설정 | HttpOnly/Lax 적용, 실제 로그인 응답의 쿠키 속성 검사. HTTPS Secure는 설정 코드 확인 단계 |
| 전시 날짜 오류에 필드 정보가 없음 | 날짜 쌍·기간 순서 검증과 startDate/endDate 오류 검사 |
| 단위 테스트는 통과했지만 테스트 자체의 TS 헤더 타입이 잘못됨 | 명시적인 헤더 자료형으로 정정 후 typecheck·단위 검사 재실행 |
| 로컬 이메일 로그인이 꺼진 설정·DB 테스트 네트워크 불일치 | 발급 계정 로그인 활성화와 공개 가입 금지를 분리, 같은 격리 네트워크로 실제 HTTP/DB 검사 |
| CI 준비 대기문의 검사 경고 | 별도 후속 커밋 497b61b로 실패 처리, 최종 CI 성공 |

이 결과로 모든 결함이 없다고 단정하지 않는다. 다음 절은 이번 근거 대조에서 새로 확인한 차이다.

# 7. 수정할 항목과 별도 설계 선택

다음 구분은 개발 순서 판단이다. 새 사용자 승인이나 기능 완료를 뜻하지 않는다.

| 구분·시점 | 근거와 현재 상태 | 후속 조치 |
| --- | --- | --- |
| **명세 차이 / 프로필 폼 연결 전** | [기능명세](https://github.com/Ahn-taegyu/Yeobek/blob/497b61b4baec776ffd9a9205fb0abc867efae207/docs/specs/functional-spec.md#L118)는 초안 이름 선택. [HTTP 스키마](https://github.com/Ahn-taegyu/Yeobek/blob/497b61b4baec776ffd9a9205fb0abc867efae207/src/lib/api/schemas.ts#L22)는 필수, DB는 null 허용 | 이름 없는 소개 통합 저장과 이름 지우기를 기존 명세에 맞추고 회귀 검사. 지금 새 상품 결정을 사용자에게 다시 요구할 항목은 아님. 코드 수정은 미실행 |
| **계약 명시 / 모든 편집 폼 연결 전** | 전체 값 PATCH와 선택 필드 생략 시 null 동작은 확인됨. 기존 API 문서에는 이 효과가 명확하지 않았음 | 이번에 계약 문서 보완. 호출자는 전체 폼 값을 보내고 서버 반환 revision을 사용. 일부 필드만 합치는 방식으로 바꾸려면 별도 API 설계 변경 |
| **명세 정합성 / 본문 편집기 연결 전** | Zod와 SQL의 코드포인트 계산 불일치 진단은 철회. 기능명세는 앞뒤 공백 제거·표시 문자 기준인데 section body는 양쪽 모두 원문을 보존해 계산 | 본문 공백 보존 여부와 표시 문자 단위를 명확히 하고 프런트 카운터를 맞출 것. 존재하지 않는 UTF-16 결함을 고치는 작업으로 만들지 않음 |
| **계획 미반영 / 화면 스타일 작업 전** | D-008·SPEC-007의 Tailwind가 package에 없고 현재는 globals.css 사용 | 계획대로 추가할 때 검증. 다른 스타일 방식을 채택하면 명세를 함께 변경. 사용자에게 같은 기술 선택을 다시 묻는 선행 조건으로 삼지 않음 |
| **문서 정정 / 이번 반영** | D-011·SPEC-010의 DB·앱 미착수 문구, 프로필 생성 시점, SPEC-012의 무변경 문서 저장 예외가 오래되거나 누락됨 | 현재 구현과 후속 기능을 구분해 연결 문서 수정. 사전 계정 생성·로그인·전시 목록 조회만으로는 프로필이 생기지 않고 첫 프로필 조회 또는 전시 생성에서 생김 |
| **검증 보완 / 입력 폼·출처 연결 시** | 동적 RPC 인자 매핑은 타입 단언을 사용. HTTP tests는 빈 sourceRefs만 다룸 | 문서/자료 출처의 실제 HTTP 저장, 무변경 저장, 선택 필드 처리 등 사용자 흐름을 검증. DB 타입 생성 성공을 모든 호출 인자 보장으로 해석하지 않음 |
| **후속 구현 / 승인·게시·관람 연결 시** | api_requests는 미사용. 근거 승인·영향 철회·미디어 전달·공개 번호 정책은 미구현 | 최소 사용 흐름에 필요한 범위로 구현·검증. 7개 테이블 수 자체를 고정 목표로 삼지 않음 |

검사 성공은 위 명세 차이나 미구현 범위의 해소를 뜻하지 않는다. 이번에는 문서의 사실·계약을 정정했으며 작가명·본문 처리 등 제품 동작은 수정하지 않았다.

# 8. 직접 검토하는 순서

1. [개발 착수 요청 원문](../references/user-development-start.md)과 [내부 지식 확정 요구](../decisions/D-011-knowledge-and-screens.md)를 읽고, 위 2번 표에서 요구가 누락되거나 제가 범위를 넓힌 부분을 본다.
2. 위 7번 표에서 **명세에 맞춰 고칠 항목·이미 보완한 문서·별도 설계 변경**을 나눠 읽는다. 작가명은 현재 명세 차이이며, UTF-16 오류는 이번에 철회한 진단이다.
3. [스키마](https://github.com/Ahn-taegyu/Yeobek/blob/497b61b4baec776ffd9a9205fb0abc867efae207/supabase/migrations/20261113030000_mvp_schema.sql) → [RPC](https://github.com/Ahn-taegyu/Yeobek/blob/497b61b4baec776ffd9a9205fb0abc867efae207/supabase/migrations/20261113030100_mvp_rpc.sql) → [HTTP 계약](../specs/api-contract.md) 순서로 DB와 API의 역할을 확인한다.
4. [CI 결과](https://github.com/Ahn-taegyu/Yeobek/actions/runs/43370914655)와 [테스트](https://github.com/Ahn-taegyu/Yeobek/blob/497b61b4baec776ffd9a9205fb0abc867efae207/tests/integration/api.test.mjs)에서 정상 저장뿐 아니라 거부되는 요청도 확인한다.
5. [협업 규칙](../collaboration.md)의 리뷰어 1명·squash·긴급 예외·공유 migration 수정·worktree 격리를 팀 운영 기준으로 채택할지 검토한다. 작성된 규칙과 실제 원격 보호 설정을 구별한다.

로컬 재현 명령은 저장소 루트 README의 앱 실행·검사 절을 따른다. 리뷰를 위해 전체 DB를 초기화할 필요는 없다. 실제 작가 자료·키를 문서나 PR에 붙이지 않고, 가짜 로컬 계정과 테스트 자료만 사용한다.

# 9. 후속 교차 검토에서 추가한 항목

2026-11-13에 Claude Code가 `497b61b`의 스키마·RPC·API·테스트 소스를 이 검토서와 읽기 전용으로 대조한 결과다. 1~8절의 수치(단위 16·pgTAP 53·HTTP 1+6, 경로 파일 11·처리 함수 17)와 CI 성공은 소스·실행 기록과 일치했다. Zod 문자열 상한이 코드포인트 기준이라는 정정도 설치된 4.6.7의 `checks.js`에서 `codePointLength` 사용을 확인했다. 아래는 1~8절에 없거나 범위가 덜 드러난 항목이며 **기록만 했고 제품 코드와 테스트는 수정하지 않았다.** 앱 검사를 다시 실행하지 않았고 동작은 코드와 기존 테스트를 읽어 판단했다.

## 9.1 화면 구현 전에 결정할 항목

4절은 오래된 상위 참조를 재저장 때 409로 거부한다고 적었다. 아래는 그 거부가 화면에 미치는 범위다.

| 항목 | 확인한 내용 | 권고 |
| --- | --- | --- |
| **상위 문서 수정 후 하위 리소스의 모든 저장이 409** | 정형 정보 PATCH는 전체 값 계약이어서 기존 `sourceRefs`를 다시 보낸다. [save_document](https://github.com/Ahn-taegyu/Yeobek/blob/497b61b4baec776ffd9a9205fb0abc867efae207/supabase/migrations/20261113030100_mvp_rpc.sql#L189)는 동일 내용 확인보다 출처 검증을 먼저 실행한다. 따라서 상위 문서 revision이 오른 뒤에는 출처와 무관한 변경(예: 작품 제목만 수정)도 거부된다. [pgTAP 78~80행](https://github.com/Ahn-taegyu/Yeobek/blob/497b61b4baec776ffd9a9205fb0abc867efae207/supabase/tests/mvp_foundation_test.sql#L78)이 이 거부를 검사하므로 의도된 동작이다 | 유지 여부를 먼저 결정. 유지한다면 아래 두 행을 함께 처리 |
| 위 충돌을 일반 충돌과 구별할 수 없음 | 출처 revision 불일치와 자기 revision 충돌이 모두 `40001`이며 [HTTP에서 같은 `REVISION_CONFLICT`와 같은 안내 문구](https://github.com/Ahn-taegyu/Yeobek/blob/497b61b4baec776ffd9a9205fb0abc867efae207/src/lib/api/errors.ts#L18)로 나간다. BR-01의 "최신본 조회·수동 재적용"을 따라 리소스를 다시 불러와도 같은 낡은 참조가 돌아와 해결되지 않는다. 화면이 상위 문서의 현재 revision을 따로 조회해 참조를 고쳐 써야 한다 | 별도 오류 코드와 해당 참조 정보를 반환하는 안. 또는 저장본과 달라지지 않은 참조는 재검증에서 제외하는 안 |
| 같은 유형의 400 | 참조한 상위 section이 삭제되거나 참조 자료가 `revoked`가 되면 400 `INVALID_INPUT`으로 같은 방식의 저장 차단이 생긴다 | 위 결정과 같은 계약으로 처리 |

## 9.2 테스트가 실제로 닿지 않는 경로

5절이 이미 적은 공백(빈 `sourceRefs`만 다루는 HTTP 검사, 무변경 문서 재저장, 선택 필드 생략, 기존 토큰 폐기) 외에 아래 경로도 검사가 없다. 결함을 확인한 것이 아니라 검사가 없다는 뜻이다.

| 경로 | 현재 상태 |
| --- | --- |
| `update_exhibition` 성공 | SQL·HTTP 모두 없음. 문서 revision 충돌 1건만 검사 |
| 유효한 전시 날짜 저장 | 없음. 날짜 쌍 오류의 거부만 검사 |
| 전시·작품 PATCH의 HTTP 성공 | 없음. 작품 PATCH는 409만, 전시 PATCH는 호출 자체가 없음 |
| `list_artworks`와 두 목록 GET 경로 | 없음. `list_exhibitions`는 타인 계정의 빈 목록만 검사 |
| 익명 로그인 차단 | SQL의 `is_anonymous` 조건은 있으나 검사 없음. 로컬 설정은 익명 로그인을 끄지만 클라우드 프로젝트 설정은 별개 |

우선 `update_exhibition` 성공, 날짜 저장, HTTP PATCH 성공을 채우는 것을 권고한다.

## 9.3 작은 항목

| 항목 | 확인한 내용 | 권고 |
| --- | --- | --- |
| 작품 번호 재사용 | [`unique (exhibition_id, number)`](https://github.com/Ahn-taegyu/Yeobek/blob/497b61b4baec776ffd9a9205fb0abc867efae207/supabase/migrations/20261113030000_mvp_schema.sql#L68)가 논리 삭제된 행도 포함 | 삭제 API 구현 때 `deleted_at is null` 부분 유니크 인덱스로 변경 |
| 409 `CONFLICT` 구분 | 번호 중복과 생성 ID 재사용이 같은 코드·문구 | 화면에서 번호 필드를 표시하려면 코드 또는 `fields` 분리 |
| 없는 구성요소를 가리키는 주석 | [server.ts 20행](https://github.com/Ahn-taegyu/Yeobek/blob/497b61b4baec776ffd9a9205fb0abc867efae207/src/lib/supabase/server.ts#L20)이 "page proxy"를 언급하나 미들웨어·proxy 파일이 없음 | 주석 정정 |
| 배포 전 설정 | `next.config.ts`에 CSP·프레임 차단 등 보안 헤더 없음. `APP_ORIGIN`이 없으면 `request.url`로 대체 | 배포 전에 헤더 추가, 운영에서는 `APP_ORIGIN` 필수화 |
| 계정 삭제 | `auth.users`를 참조하는 FK에 삭제 동작이 없어 작가 계정을 지울 수 없음 | 의도라면 명세에 기록, 아니면 탈퇴 절차와 함께 설계 |
| CI | health 대기 실패 시 앱 로그를 출력하지 않음. `push`와 `pull_request`가 모두 걸려 PR 브랜치는 두 번 실행 | 실패 시 로그 출력, 트리거 범위 조정 |
| 오류 문구 | [artist-home.tsx 21행](https://github.com/Ahn-taegyu/Yeobek/blob/497b61b4baec776ffd9a9205fb0abc867efae207/src/components/artist-home.tsx#L21)은 응답이 JSON이 아니면 파싱 오류 원문을 표시 | 고정 안내 문구로 대체 |

7절의 Tailwind·프로필 생성 시점 항목은 이번 대조 범위에 넣지 않았다.

# 10. 실행으로 확인한 결과

[SRC-021](../references/user-code-plan-review.md)에 따라 Claude Code가 2026-11-13에 `0e9675d`(앱·DB·테스트 소스는 `497b61b`와 동일)를 별도 worktree에서 직접 설치·빌드·실행했다. 제품 코드와 테스트는 수정하지 않았다. 9절은 코드를 읽어 판단한 기록이고, 이 절은 실행해서 관찰한 기록이다.

## 10.1 실행한 검사

| 검사 | 결과 | 방법 |
| --- | --- | --- |
| `npm ci`, lint, typecheck, build | 성공 | worktree에서 새로 설치 후 실행 |
| 단위 검사 | 16개 통과 | `npm test` |
| pgTAP | 53개 통과 | 이미 실행 중이던 로컬 `yeobek-mvp` 스택에 `npm run db:test` |
| HTTP 통합 | 7개 통과(상위 1 + 하위 6) | 빌드한 앱을 3100번 포트에 띄우고 `TEST_APP_ORIGIN` 지정 |
| SQL 직접 실행 | 아래 표 | 로컬 DB에서 한 트랜잭션으로 실행 후 rollback. 남은 행 0건 확인 |
| HTTP 직접 요청 | 아래 표 | 로컬 테스트 계정 1개로 로그인해 Node fetch·쿠키 jar로 요청 |

HTTP 통합 검사와 직접 요청은 프로젝트 통합 테스트와 같은 방식으로 가짜 계정 3개와 그 초안을 폐기 가능한 로컬 DB에 남겼다. 실제 브라우저·모바일·운영 HTTPS·클라우드 프로젝트는 여전히 미검증이다.

## 10.2 새로 확인한 결함: 잘못된 입력이 500으로 응답

| 입력 | 관찰한 응답 | 원인 | 기획 기준 |
| --- | --- | --- | --- |
| 전시 `startDate: "0000-01-01"`, `endDate: "0000-01-02"` | 500 `INTERNAL_ERROR` | Zod `z.iso.date()`는 통과, PostgreSQL이 `22008`로 거부. [오류 매핑](https://github.com/Ahn-taegyu/Yeobek/blob/497b61b4baec776ffd9a9205fb0abc867efae207/src/lib/api/errors.ts#L20)에 이 코드가 없음 | EX-01은 형식·기간 오류를 필드 옆 사유로 안내하는 입력 오류 |
| 전시 제목에 NUL 문자(`\u0000`) | 500 `INTERNAL_ERROR` | PostgreSQL이 `22P05`로 거부, 매핑 없음 | 같음 |
| section 본문에 NUL 문자 | 500 `INTERNAL_ERROR` | 같음 | 같음 |

500은 서버 오류 로그에도 남는다. 스키마에서 거르거나 두 SQLSTATE를 400으로 매핑하면 된다. `startDate: "2026-02-30"`은 Zod가 400과 `startDate` 필드 오류로 정상 거부했다. 수정은 하지 않았다.

## 10.3 실행으로 재현한 기존 항목

| 항목 | 관찰 |
| --- | --- |
| 9.1 상위 문서 수정 후 409 | 작가 소개 문서를 수정한 뒤 작품 제목만 바꾸는 PATCH가 409 `REVISION_CONFLICT`. 작품을 다시 조회해 받은 revision·sections·sourceRefs를 그대로 보내도 409. 일반 revision 충돌 응답과 코드·문구가 동일함을 비교로 확인. 상위 문서 수정 전에는 같은 PATCH가 200이며 문서 revision은 유지 |
| 9.1 같은 유형의 400 | 참조한 상위 section을 삭제한 뒤 최신 revision으로 고쳐 보내도 SQL `22023` |
| 7절 작가명 | 이름 없이 소개만 보내는 프로필 PATCH는 400, `displayName` 필드 오류 |
| 9.3 작품 번호 재사용 | 논리 삭제한 작품의 번호로 새 작품을 만들면 `23505`. 삭제된 작품 ID의 생성 재시도는 `P0002` |
| 보이지 않는 제목 | 폭 없는 공백(`​`)만 있는 전시 제목이 201로 저장. 전각 공백(`　`)만 있는 제목은 400 |
| 409 `CONFLICT` | 번호 중복과 같은 ID·다른 입력이 모두 409 `CONFLICT` |

## 10.4 검사는 없지만 실행하면 동작하는 경로

9.2는 검사가 없다는 기록이다. 아래는 직접 실행해 동작을 확인한 결과이며, 회귀 검사가 생겼다는 뜻은 아니다.

| 경로 | 관찰 |
| --- | --- |
| `update_exhibition` 성공·날짜 저장 | SQL과 HTTP PATCH 모두 성공. 제목·장소 앞뒤 공백 제거, 날짜 저장, revision 증가. 날짜를 생략하면 null로 바뀜 |
| 작품 PATCH의 HTTP 성공 | 200 |
| 문서 출처의 HTTP 전달 | `sourceDocumentId` 등 camelCase 출처로 작품 생성 201, 저장된 `sourceRefs`가 같은 값으로 반환 |
| 목록 GET 두 경로 | 200, 생성한 건수와 일치 |
| 익명 JWT 차단 | `is_anonymous: true` claims에서 RPC는 `42501`, RLS로 보이는 행 0건 |
| 로그아웃 후 이전 쿠키 재전송 | 401. 로그아웃 전 access token으로 Supabase API를 직접 호출하는 경우는 확인하지 않음 |

# 11. 기획 내용과 구현 대조

기능명세(SPEC-005)·화면 명세·시나리오·내부 지식 계약(SPEC-010)·기술 스택·D-011을 `0e9675d`의 코드와 항목별로 대조했다. 판정은 **적용**(기획대로 구현), **부분**(일부만 구현하거나 화면이 없음), **불일치**(구현이 기획과 다르게 동작), **후속**(아직 구현 범위가 아님)이다. 기획 문서의 proposed 값을 확정으로 올리지 않았고, 이 대조로 명세나 코드를 바꾸지 않았다.

## 11.1 기획과 다르게 동작하는 항목

| 기획 | 구현 | 판단 |
| --- | --- | --- |
| [기능명세 4.1](../specs/functional-spec.md#41-입력-필드와-검증): 작가 표시 이름은 프로필 초안에서 선택 | HTTP는 1자 이상 필수(10.3에서 400 재현), DB는 null 허용 | 불일치. 7절과 같은 항목이며 HTTP 스키마를 명세에 맞추면 해소 |
| [EX-01~04·21 예외 코드](../specs/user-scenarios.md#예외-처리-목록): `VALIDATION_ERROR`, `AUTH_REQUIRED`/`INVALID_CREDENTIALS`, `RESOURCE_UNAVAILABLE`, `DUPLICATE_NUMBER`, `REQUEST_ID_CONFLICT` | `INVALID_INPUT`, `UNAUTHENTICATED`, `NOT_FOUND`, `CONFLICT`. 로그인 실패와 세션 없음이 같은 코드이고, 번호 중복과 요청 ID 충돌도 같은 코드. `REVISION_CONFLICT`만 일치 | 불일치. [API 계약](../specs/api-contract.md)은 구현 쪽 이름을 쓰며 EX 코드와의 대응을 적지 않았다. 화면 구현 전에 한쪽으로 통일하거나 대응표를 둘 것 |
| [기능명세 8.1](../specs/functional-spec.md#81-공통-응답-요구): 오류에 `retryable`과 필요한 `retry_after` | 오류 본문은 `code`·`message`·선택 `fields`·`requestId`뿐 | 불일치. 429·503을 구별하지만 재시도 가능 여부와 대기 시간은 응답에 없음 |
| EX-01: 입력 형식 오류는 입력 오류로 안내 | 10.2의 두 입력은 500 | 불일치. 결함 |
| [SPEC-010 재사용·승인·철회 3항](../specs/artist-knowledge.md#재사용승인철회), UC-17 3단계, OP-22의 "변경 여부": 작가 원본을 고치면 하위는 이전 버전을 유지하고 수정이 필요하다는 표시를 본 뒤 필요한 전시에서 적용 | 초안 출처에 고정한 상위 revision이 낡으면 그 하위 리소스의 저장 자체를 거부(9.1, 10.3) | 불일치 소지. 기획 문장은 승인 근거를 대상으로 하지만, 초안 참조도 같은 고정 revision 구조를 쓴다. 기획의 흐름은 낡은 참조를 "표시할 상태"로 다루고 구현은 "저장 오류"로 다룬다. 9.1의 결정 때 이 기획 흐름을 기준으로 삼을 것 |
| [기능명세 4.1](../specs/functional-spec.md#41-입력-필드와-검증): 앞뒤 공백 제거 후 길이 계산 | 제목·장소·메타데이터는 제거 후 계산, section 본문은 원문 그대로 계산 | 불일치. 7절의 본문 공백 항목과 같음 |
| [SC-A01](../specs/screen-spec.md#sc-a01-작가-로그인): 비밀번호 표시/숨김 | 로그인 폼에 전환 버튼 없음 | 불일치. 작은 화면 누락 |
| [SC-A02](../specs/screen-spec.md#sc-a02-작가-홈): 전시 기록에 기간·장소·작품 수, 최근 수정순 제안, 로그인 계정 표시, 작가 정보 미입력 안내 | 제목과 상태만 표시, 생성일 내림차순, 계정 표시 없음, 이름이 없으면 "나의 전시"로 대체. 목록 API는 기간·장소를 반환하지만 작품 수는 반환하지 않음 | 부분. 화면 골격 단계이나 작품 수는 API에도 없으므로 화면 작업 때 계약 추가 필요 |
| 기술 스택·D-008: Tailwind | package에 없음 | 불일치. 7절과 같은 항목 |

## 11.2 기획대로 적용된 항목

| 기획 | 확인한 구현과 근거 |
| --- | --- |
| [기능명세 3절](../specs/functional-spec.md#3-역할과-접근-권한): 사전 계정 인증, 자기 소유만 조회·수정, 타인 리소스 존재를 드러내지 않음 | 서버 `getUser`, 소유자 RLS, RPC의 소유권 재검사. 타인 전시·작품·문서 ID는 404(통합 검사, pgTAP). 클라이언트가 보낸 `ownerId`·`state`는 400 |
| 4.1 전시 제목·기간·장소 | 제목 1~100자 필수, 날짜는 한 쌍·시작≤종료·둘 다 미정 허용, 장소 200자. HTTP와 SQL 양쪽에서 검사 |
| 4.1 연결 작가는 서버 지정 | 전시 생성 시 서버가 소유 프로필을 지정. 요청에 작가 ID를 넣을 필드가 없음 |
| 4.1 작품 번호·제목·제작연도·재료·크기 | 번호 1~9999 정수, 전시 내 중복 409, 제목 1~100자, 50/200/100자 |
| 4.1 작가 소개·작품 세계, 전시 소개·주제, 작가 메모 각 5,000자 | 주체별 section 2개(`bio`/`practice`, `introduction`/`theme`, `description`/`notes`), 본문 5,000자 |
| 4.1 PDF 쪽수는 1부터, 끝≥시작 | 자료 출처의 쪽수 검사(pgTAP) |
| 4.2 작가/전시/작품·내부 지식의 보존 정보 | 불변 ID, 계정과 구분한 작가 프로필, 전시의 artist ID, 작품의 exhibition ID, revision, 활성 묶음 참조, 문서 ID·subject·section·출처·revision |
| BR-01 기준 revision 검사와 충돌 시 덮어쓰기 금지 | 정형 정보와 문서의 두 revision 검사, 한쪽이 낡으면 전체 취소 후 409. 응답에 revision과 `updatedAt` 포함 |
| BR-14 같은 ID·내용 재전송은 기존 결과, 다른 내용은 거부 | 생성 ID와 정규화 입력 해시. 병렬 재시도에서 전시 1건만 생성(201 1회, 200 1회), 다른 입력은 409 |
| BR-07 삭제 ID 재사용 금지 | 논리 삭제된 작품 ID의 생성 재시도는 404(10.3) |
| BR-08 공개 접근 게이트 | 전시 상태·작품 상태·활성 publication·철회·논리 삭제를 공개 조회에 모두 적용. 초안은 404. 공개 응답에 파일 경로·내부 문서 없음, `no-store` |
| BR-15·D-011: 작가·전시·작품을 연결된 내부 문서로 저장, DB 원본, 위키 화면 없음 | `knowledge_documents`가 주체당 하나, 정형 정보와 같은 트랜잭션으로 저장. 별도 Markdown 원본·위키 UI 없음 |
| SPEC-010 5항: 타인 문서·다른 전시 작품을 링크로 연결해 접근 범위를 늘리지 않음 | 문서·자료 출처를 자기/상위 주체 범위로 제한. 다른 전시 문서·자료 참조 거부(pgTAP) |
| 6절 전시 상태 `draft / published / paused` | 전시·작품 모두 같은 세 값의 check 제약 |
| OP-01~04, OP-21과 UC-01의 AC-01(API 수준) | 로그인·로그아웃, 전시·작품 생성/조회/수정, 프로필 조회/수정. 전시 1건만 생성, 소유자·작가 서버 지정, 기간·장소 미정 저장, 재조회, 다른 계정에 보이지 않음 |
| SC-A01의 중복 제출 방지·일반 인증 오류·성공 시 작가 홈 이동, 공개 가입·비밀번호 찾기 없음 | 제출 중 버튼·입력 비활성, 계정 존재를 구별하지 않는 문구, `/artist` 이동. 로컬 설정은 공개 가입을 끔 |
| 기술 스택: Next.js 16.4·TypeScript·App Router, Supabase Auth·`@supabase/ssr`, Zod, 7개 저장 단위, 앱에 서버용 secret 없음 | `package.json`과 migration에서 확인. 앱은 공개 키만 사용 |
| 4.1 파일 상한 3MB·6MB, 해설 2,000자 | 아직 쓰지 않는 `materials.byte_size`와 `narration_draft`·`publications.narration_text` 제약 값이 기획 값과 일치 |

## 11.3 기획에 있으나 아직 구현 범위가 아닌 항목

| 기획 | 현재 상태 |
| --- | --- |
| SC-A02의 작가 정보 편집·새 전시 시작, SC-A03 이후 작가 화면, 관람 화면 전체 | 화면 없음. D-011 사용자 확정 요구 중 작가 로그인만 화면으로 충족하고 작가 홈은 목록 조회 골격 |
| 4.1 작품 이미지, 도록 PDF, 근거 본문·출처 라벨·근거 대상(OP-05~07) | `materials` 테이블과 제약만 있고 업로드·자료·근거 API 없음. 출처 라벨을 담을 필드는 현재 `source_refs`에 없음 |
| 초안 해설·대표 이미지 연결 | `artworks.narration_draft`·`image_material_id` 열은 있으나 저장할 API가 없고 `narration_draft`는 응답에도 없음 |
| BR-03~05, OP-08~13: 생성·검수·승인·음성·게시·중지·철회 | 없음. `publications`는 신뢰된 테스트 데이터로만 채움 |
| BR-06 초안 번호와 공개 번호의 충돌 예약·게시 검사 | 없음. `publications.number`에 유일성 제약이 없어 게시 구현 때 검사 필요 |
| BR-07 마지막 공개 작품 중지 시 전시 `paused` 전이, 공통 근거 철회의 영향 범위 | 상태 전이는 없음. 공개 조회가 적격 작품이 없으면 전시를 반환하지 않아 조회 결과는 같음 |
| OP-09·11·20의 작가 쪽 생성·음성 작업 상태(논리 모델 GenerationJob) | 저장할 곳이 없음. `api_requests`는 세션 해시와 전시를 요구하고 종류가 관람 요청 3종뿐이어서 작가 쪽 작업에 그대로 쓸 수 없음. 해설 생성 구현 전에 설계 필요 |
| OP-14~19, BR-09~13: 라벨·번호 해석·채팅·녹음·낭독·미디어 | 없음. 공개 전시·작품 조회(OP-15 일부)만 있음 |
| BR-14·API 계약의 분당 6회·일일 상한 | 앱의 요청 횟수 제한 없음. 로그인은 Supabase Auth 정책에 의존 |
| OP-22의 전시 단위 내부 지식 조회·근거 적용 | 문서 ID 단위 조회·수정만 있음 |
| AC-15·AC-17의 검색·철회·관람 범위 | 소유자 격리와 문서 분리·출처 범위까지 확인. 승인·게시·철회·제품 RAG가 없어 전체 수용 기준은 미실행 |

## 11.4 종합

이번에 구현한 범위(인증, 소유자 격리, 초안 저장, revision·재시도, 공개 게이트, 내부 문서 구조)는 기획의 업무 규칙과 대부분 일치하고, 일치 여부를 실행 검사로 확인했다. 기획과 다르게 동작하는 것은 11.1의 항목이다. 그중 화면 작업 전에 먼저 정할 것은 다음 세 가지다.

1. 낡은 상위 참조의 처리(9.1, 11.1). 기획 흐름은 저장을 막지 않고 변경 여부를 표시한다.
2. 오류 코드 체계(11.1). 시나리오의 EX 코드와 API 계약·구현의 코드가 다르고 `retryable`이 없다.
3. 작가명 선택 여부와 500 응답 두 건(7절, 10.2). 명세에 맞춰 바로 고칠 수 있다.

AC-01~19 가운데 API 수준에서 확인한 것은 AC-01뿐이며 화면을 포함한 시나리오 실행은 아니다. 나머지는 [시나리오 문서](../specs/user-scenarios.md)의 표시대로 미실행이다.

# 12. 검토 내용의 구현 반영

2026-11-13 [SRC-022](../references/user-review-implementation.md)에 따라 별도 검토 worktree의 `b966cce`·`ea92e2a`를 `feat/mvp-foundation`에 fast-forward로 통합한 뒤 수정했다. 변경 기준은 `ea92e2a`다. 공유된 초기 migration을 고치지 않고 `supabase/migrations/20261113070000_review_fixes.sql`을 추가했다. 기존 개인 Obsidian 설정 변경은 제외했다.

## 12.1 처리 결과와 근거

| 검토 항목 | 반영 결과와 이유 | 확인할 코드·검사 |
| --- | --- | --- |
| 9.1·11.1 상위 출처 변경 후 모든 저장 차단 | 같은 초안·같은 section의 기존 출처 객체는 저장된 개수만큼 보존한다. 원본 revision은 자동 갱신하지 않는다. `sourceWarnings`로 변경·이용 불가를 알리고 다른 편집을 허용한다. 새 문서·새 section·추가 복사·변경 참조는 재검증한다. 초안 복구를 위한 기술 판단이며 승인·게시 검증을 생략하는 결정은 아니다. | 새 migration의 validate_document·save_document·document_json, pgTAP 및 실제 HTTP |
| 출처 오류와 자기 revision 충돌 혼동 | 신규/변경 출처가 낡으면 P1001→409 SOURCE_REVISION_CONFLICT, 사용할 수 없으면 P1002→400 SOURCE_UNAVAILABLE. 자기 revision 충돌은 REVISION_CONFLICT 유지. | errors.ts, 신규/기존 출처 HTTP 검사 |
| 7·10.2·11.1 입력 검증 | 작가명 선택·null/빈 값 저장, 연도 0·NUL 거부, 제어/기본 비표시 문자만 있는 제목 거부. SQLSTATE 22008·22P05도 400 처리. 본문은 앞뒤 공백 제거 후 코드포인트 5,000개로 검사·저장. 기존 본문과 정규화 결과가 같으면 원문을 보존하며 생성 재시도 해시는 기존 raw 본문 입력 유지. | schemas.ts, 새 migration, 단위·SQL·HTTP 경계 검사 |
| 전체 값 PATCH | 선택 필드 생략 시 null 계약 유지·명시. 부분 PATCH로 바꾸지 않는다. | 날짜/장소 저장 후 생략, 이름 지우기 HTTP 검사 |
| 9.3·11.1 오류 식별·재시도 | 번호 중복·생성 ID 재사용·잘못된 자격 정보를 별도 코드로 구별. retryable, 선택적 retryAfter와 Retry-After 헤더 추가. 기존 EX ID와 HTTP 이름은 매핑표로 연결. | errors.ts·http.ts, API 계약, 실제 SQLSTATE 변환 검사 |
| 11.1 로그인·작가 홈 | 비밀번호 표시 전환, 자기 계정 이메일, 작가명 미입력 안내, 전시 기간·장소·삭제되지 않은 작품 수. 최근 수정순 및 ID 동률 정렬. JSON 파싱 오류 원문 대신 안내 문구. | 두 client 컴포넌트, 프로필 GET, list_exhibitions, 브라우저·목록 검사 |
| 7 Tailwind | Tailwind 4/PostCSS 설정. Windows에서 Turbopack PostCSS worker 종료를 샌드박스 안/밖 모두 재현해 설치된 Next.js 16.4.6 문서가 지원하는 --webpack으로 dev/build를 맞췄다. 모든 Windows 환경의 결함으로 일반화하지 않는다. | package/lockfile, PostCSS, 프로덕션 build |
| 9.3 설정·주석 | 운영 APP_ORIGIN 누락·잘못된 URL은 503 SERVER_CONFIGURATION_ERROR와 retryable:false. 기본 프레임/MIME/referrer 헤더와 제한된 CSP 추가. 없는 proxy 주석 정정. CSP의 script 제한 전체를 구현한 것은 아니다. | next.config.ts, http.ts, 단위 검사 |
| 9.3 CI·검사 공백 | 앱 CI는 main push·PR·수동 실행, health 실패에 앱 로그 출력. 중첩 .claude/worktrees를 lint/TypeScript 범위에서 제외. 전시 PATCH·유효 날짜·목록·작품 PATCH·익명 JWT·nonempty 출처·no-op·기존 본문 보존 검사 추가. | workflow, eslint/tsconfig, SQL·HTTP tests |

`sourceWarnings`는 현재 초안 상태에서 계산하는 메타데이터이며 영구 승인 이력이 아니다. 문서 경고는 `sectionId`, `sourceDocumentId`, `sourceSectionId`, `sourceRevision`, 자료 경고는 `sectionId`, `materialId`를 포함한다. `source_changed`에만 안전하게 조회한 `currentRevision`을 추가하며 원본 본문·비공개 파일 경로는 노출하지 않는다.

과거에 저장한 보이지 않는 문자만의 제목은 전체 값 PATCH 전에 정상 제목으로 수정해야 한다. 생성 재전송도 현재 HTTP 검사를 통과해야 한다. 기존 생성 요청에서 본문의 앞뒤 공백만 다르게 보내면 별도 입력으로 판단될 수 있으므로 재시도는 원래 요청을 그대로 사용한다.

## 12.2 직접 재검증과 교차 검토

- 주 담당자가 위임된 SQL·UI·문서 diff를 요구·기존 코드와 대조했다. Sol이 API·SQL을 교차 검토하고 Terra가 UI와 문서를 작업했다. 피드백으로 경고의 sourceSectionId, 제어 문자 검증, Origin 설정의 비재시도 오류, 로그인 장애 안내를 보완했다. 성공 보고만으로 완료 처리하지 않고 아래 검사를 직접 실행했다.
- 단위 **35개**, 로컬 Supabase pgTAP **79개**, 실제 Auth 쿠키 HTTP **10개(상위 1 + 하위 9)** 통과. HTTP는 프로덕션 서버 localhost:3200과 가짜 계정으로 수행했다. 로컬 fixture는 남고 pgTAP 변경은 rollback한다.
- npm run lint·typecheck·build·db:types 통과. 생성 타입은 기존 파일과 차이가 없다. build는 Webpack으로 전 경로를 생성했다. Turbopack 실패는 12.1의 선택 근거다.
- 브라우저에서 비밀번호 표시/숨김, 가짜 계정 로그인, 계정·미입력 안내·전시 기간/장소/작품 수를 확인했다. 1280px 기본 화면과 390px viewport를 확인했고 390px에서 문서 가로폭도 390px이었다. 전체 기획 시나리오나 실제 휴대기기 검증은 아니다.
- 신규 migration은 기존 로컬 스키마·fixture에 업그레이드해 검증했다. 새 DB·잠금 설치는 원격 App checks 결과로 별도 확인한다. 문서·원격 검사 결과는 아래 최종 기록을 따른다.

## 12.3 후속으로 남긴 항목

| 항목 | 유지 이유와 다음 작업 |
| --- | --- |
| 삭제 작품 번호 재사용(9.3) | 현재 유일 제약 유지. 삭제·게시 API가 없고 공개 번호 예약과 함께 설계해야 하므로 부분 unique만 먼저 적용하지 않는다. OP-05·OP-12에서 확정·검사. |
| 계정 삭제 FK(9.3) | 자료가 있는 작가 계정의 즉시 삭제 제한 유지. 탈퇴·자료 보존·공개 차단·파일 정리 순서를 설계한 뒤 실행 경로 제공. cascade 자동 추가 없음. |
| 작가 생성 작업 상태(11.3) | api_requests는 관람 세션 계약이므로 GenerationJob으로 재사용하지 않는다. 해설/음성 생성 단계에서 최소 작업 저장·재시도 설계. |
| 승인·게시·파일·관람(11.3) | 편집 폼 → 업로드·발췌 → 생성·검수·음성·게시 → QR/번호/통합 채팅 순서로 구현. 변경 출처의 승인 근거 재확인도 그 단계에서 검증. |

F-001·F-002·F-023과 전체 MVP는 완료로 올리지 않는다. AI 호출·클라우드 배포·실제 작가/관람객 검증·원격 권한 설정은 이번 수정 범위가 아니다.

## 12.4 최종 기록

구현 커밋은 [03459bf](https://github.com/Ahn-taegyu/Yeobek/commit/03459bf6e9ea121f20d41110dff740edac964957)이며 `feat/mvp-foundation`에 push했다. 문서 검사는 87개 문서·23개 기능·3개 Bases에서 오류 0개, 검색 회귀 9개 통과, 373개 청크를 재생성했다. 생성 인덱스는 커밋하지 않았다.

[Draft PR #1](https://github.com/Ahn-taegyu/Yeobek/pull/1)에 main 대비 전체 기반 구현과 근거·검증 범위를 정리했다. 새 DB·잠금 설치를 포함하는 원격 App checks와 Windows/Linux Knowledge checks의 최신 결과는 PR의 Checks에서 해당 head를 확인한다. 문서의 이전 CI 성공 링크는 초기 커밋의 증거이며 현재 head 성공을 대신하지 않는다.
