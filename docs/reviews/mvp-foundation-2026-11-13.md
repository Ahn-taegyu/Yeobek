---
type: Guide
id: GUIDE-006
title: Yeobek MVP 개발 기반 작업 검토서
description: 초기 구현 497b61b와 이름 정정 후 460e87d를 대조해 근거·검증 범위·명세 차이 및 이전 검토의 오류를 정정한다.
status: stable
updated: '2026-11-13'
tags: [yeobek, review, foundation]
rag_include: false
generated:
  by: codex/gpt-6
  at: '2026-11-13T14:29:32+09:00'
sources:
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

2026-11-13에 Claude Code가 `497b61b`의 스키마·RPC·API·테스트 소스를 이 검토서와 읽기 전용으로 대조한 결과다. 1~8절의 수치(단위 16·pgTAP 53·HTTP 1+6, 경로 파일 11·처리 함수 17)와 CI 성공은 소스·실행 기록과 일치했다. Zod 문자열 상한이 코드포인트 기준이라는 정정도 설치된 4.6.7의 `checks.js`에서 `codePointLength` 사용을 확인했다. 아래는 1~8절에 없거나 범위가 덜 드러난 항목이며 **기록만 했고 제품 코드와 테스트는 수정하지 않았다.** 9.1~9.3은 앱 검사를 다시 실행하지 않고 코드와 기존 테스트를 읽어 판단한 내용이다. 그 뒤 로컬 스택에서 직접 실행해 확인한 결과와 새로 발견한 결함은 [9.4](#94-직접-실행으로-확인한-결과), 기획 문서와의 대조는 [9.5](#95-기획-문서와의-대조)에 따로 적었다.

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

## 9.4 직접 실행으로 확인한 결과

9.1~9.3을 기록한 뒤 `0e9675d` 기준 작업 사본에서 로컬 Supabase 스택과 빌드한 앱을 띄워 직접 실행했다. 앱·DB·테스트 소스는 `497b61b`와 같고 차이는 헤더 표기뿐이다. 가짜 로컬 계정만 사용했고 제품 코드와 테스트는 수정하지 않았다.

| 검사 | 결과 |
| --- | --- |
| lint·typecheck·build | 성공 |
| 단위 검사 | 16개 성공 |
| pgTAP | 53개 성공 |
| HTTP 통합 | 7개 성공 |
| 수동 HTTP 요청·SQL 트랜잭션 | 아래 두 표 |

**새로 발견한 결함 2건.** 잘못된 입력이 400 `INVALID_INPUT`이 아니라 500 `INTERNAL_ERROR`로 나간다. [API 계약](../specs/api-contract.md)의 공통 오류 규칙과 어긋나며 1~8절과 9.1~9.3에는 없던 항목이다.

| 입력 | 관찰 결과 | 원인 | 권고 |
| --- | --- | --- | --- |
| 전시 날짜에 연도 0000 (예: `startDate: "0000-01-01"`) | 500 | `z.iso.date()`는 통과시키지만 PostgreSQL `date`에는 0년이 없어 `22008`로 거부한다. [databaseError](https://github.com/Ahn-taegyu/Yeobek/blob/497b61b4baec776ffd9a9205fb0abc867efae207/src/lib/api/errors.ts#L15)에 이 코드가 없어 기본 500으로 떨어진다 | HTTP 스키마에서 연도 범위를 제한해 `startDate`/`endDate` 필드 오류로 반환. 방어용으로 `22008`도 400에 매핑 |
| 제목·section 본문 등 문자열에 NUL 문자(`\u0000`) | 500 | Zod 문자열 검사는 통과시키지만 PostgreSQL `text`·`jsonb`는 NUL을 저장하지 못해 `22P05`로 거부한다. 같은 매핑 누락 | HTTP 스키마에서 NUL을 거부(또는 제거 정책을 명세에 기록). 방어용으로 `22P05`도 400에 매핑 |

이 세션에서 설치된 Zod 4.6.7로 두 입력이 스키마를 통과하는 것(`z.iso.date()`에 `"0000-01-01"`, 제목·본문 규칙에 NUL 포함 문자열)과 `databaseError`의 매핑 목록에 두 코드가 없는 것을 다시 확인했다. 500 응답 자체는 위 로컬 스택 실행에서 관찰한 것이다. 두 경우 모두 저장은 되지 않고 내부 정보도 노출되지 않으나, 화면은 입력 오류를 서버 장애로 표시하게 되고 단위·pgTAP·HTTP 검사 어디에도 이 입력이 없다. 수정할 때 회귀 검사를 함께 추가한다.

**기존 지적의 실행 재현.**

| 항목 | 실행 결과 |
| --- | --- |
| 9.1 상위 문서 수정 후 하위 저장 | 작가 문서를 수정해 revision을 올린 뒤 그 문서를 출처로 둔 하위 리소스를 PATCH하면 409. 자기 revision 충돌과 같은 `REVISION_CONFLICT`·같은 문구 |
| 9.3 작품 번호 재사용 | SQL로 작품을 논리 삭제한 뒤 같은 번호로 생성하면 `23505`로 거부 (삭제 API가 없어 HTTP로는 재현 불가) |
| 7절 작가 표시 이름 | 이름 없는 프로필 통합 저장은 400 |
| 9.2의 경로 | `update_exhibition` 성공, 유효한 날짜 저장, 전시·작품 PATCH의 HTTP 성공, 두 목록 GET을 수동 요청으로 실행해 정상 동작. **자동 검사가 없다는 지적은 그대로다.** 익명 로그인 차단은 실행하지 않았다 |

## 9.5 기획 문서와의 대조

9.1~9.4의 항목을 [기능명세](../specs/functional-spec.md)·[내부 지식 계약](../specs/artist-knowledge.md)·[API 계약](../specs/api-contract.md)과 대조했다. 명세를 바꾸지 않았고 아래 판단은 새 결정이 아니다.

| 항목 | 명세 | 현재 구현 | 판단 |
| --- | --- | --- | --- |
| 상위 문서 수정 후 하위 저장 | BR-15와 SPEC-010 3절은 작가 원본 수정이 "해당 초안만" 바꾸고 최신 내용 반영은 "필요한 전시에서" 적용·재검수·게시한다고 적는다. revision 고정은 승인 발췌와 공개 묶음에 요구한다 | 초안 단계의 출처 참조도 저장 때마다 상위의 현재 revision과 일치해야 한다. 상위를 고치면 모든 하위 초안이 참조를 고쳐야 저장된다 | **명세와 어긋날 소지.** 명세는 최신 반영을 전시별 선택으로 두는데 구현은 다음 저장의 선행 조건으로 만든다. 9.1의 유지 여부 결정에서 이 문장을 기준으로 삼을 것 |
| 위 충돌의 안내 | BR-01은 충돌 시 "최신본 조회·수동 재적용"을 안내한다 | 하위 리소스를 다시 불러와도 낡은 참조가 그대로여서 같은 409가 반복된다 | BR-01의 안내만으로 해결되지 않는 충돌. 9.1의 오류 구분 권고와 같은 결론 |
| 날짜 범위 | 4.1은 "시작/종료 한 쌍, 시작≤종료"만 정한다 | 0년은 500 (9.4) | 명세에 허용 연도 범위가 없다. 범위를 정하고 400으로 거부 |
| 제어 문자 | 4.1은 "HTML은 실행하지 않고 일반 텍스트로 취급"만 정한다 | NUL은 500 (9.4). 그 밖의 제어 문자는 스키마에 제한이 없고 실행으로 확인하지 않았다 | 명세에 제어 문자 정책이 없다. 최소한 NUL 거부를 계약에 기록 |
| 작품 번호 재사용 | BR-07은 "삭제 ID·URL은 재사용하지 않는다"고만 하고 번호는 제한하지 않는다. 4.1은 "전시 내 중복 금지" | 논리 삭제된 작품의 번호도 영구 점유 | 명세가 요구하지 않는 제한. 삭제 API 구현 때 9.3의 권고대로 수정 |
| 작가 표시 이름 | 4.1은 프로필 초안에서 선택, 전시 게시 시 필수 | 통합 저장에서 필수 | 7절에 이미 기록한 명세 차이. 실행으로 재확인 |
| 오류 코드 목록 | API 계약은 400·401·403·404·409·413·415·429·500·503을 나열 | 소스의 코드·상태 조합이 목록과 일치 | 일치. 9.4의 두 입력만 400이어야 할 것이 500으로 나간다 |
| 본문 길이·공백 | 4.1은 앞뒤 공백 제거 후 표시 문자 기준 | section 본문은 원문 그대로 코드포인트 기준 | 7절에 이미 기록. 추가 차이 없음 |

대조 범위는 초기 기반이 구현한 저장·조회 경로에 한정했다. 업로드·생성·승인·게시·관람 규칙(BR-02~14)은 구현이 없어 대조하지 않았다.
