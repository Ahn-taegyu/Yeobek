---
type: Guide
id: GUIDE-006
title: MVP 개발 기반 작업 검토서
description: 497b61b까지의 요구 근거·구현 판단·실제 변경·검증 증거와 미해결 차이를 검토한다.
status: stable
updated: '2026-11-13'
tags: [yeoback, review, foundation]
rag_include: false
generated:
  by: codex/gpt-6
  at: '2026-11-13T14:29:32+09:00'
sources:
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

이번 결과는 **작가의 자료를 안전하게 저장하고 다음 기능을 연결할 개발 기반**이다. 로그인과 전시 목록의 최소 화면, 전시·작품 생성/조회/수정 API, 작가 프로필·내부 문서 조회/수정 API가 있다. 프로필과 내부 문서는 관련 조회·생성 작업에서 자동으로 마련된다. **입력 폼, 파일 업로드, AI 해설·Q&A·음성, 승인/게시, 관람 채팅은 후속 구현 범위다.**

작가 위키는 DB의 구조화된 문서와 관계로 구현했다. AI가 이 문서를 검색해 답변하는 제품 RAG는 아직 없다. 기존 docs의 OKF·Bases·로컬 검색은 기획용으로 유지한다. 따라서 “위키 저장 기반을 만들었다”와 “AI가 그 자료로 정확하게 설명한다”를 별도로 검토해야 한다.

이 검토서는 이후 파일이 바뀌어도 판단 기준이 유지되도록 **완료 커밋 497b61b**의 코드에 링크한다. 아래의 미해결 사항은 검토 결과이며, 이 문서를 쓰면서 제품 동작을 바꾸지 않았다.

# 1. 검토할 변경 범위

[전체 변경 비교](https://github.com/Ahn-taegyu/Yeobek/compare/726811827788d92074104dd95d71e23807010062...497b61b4baec776ffd9a9205fb0abc867efae207): 기획 저장소 상태 `7268118`부터 작업 브랜치 `feat/mvp-foundation`의 `497b61b`까지.

| 커밋 | 변경 | 검토 목적 |
| --- | --- | --- |
| [ee5d532](https://github.com/Ahn-taegyu/Yeobek/commit/ee5d5325cce7028bd341ea5e53ba39ce98552524) | 협업 규칙·기여 안내·PR 양식·요청 원문 | 팀 운영 방식이 실제 팀 규모에 맞는지 |
| [e4c0de7](https://github.com/Ahn-taegyu/Yeobek/commit/e4c0de71e6ace094ea09b1b1876a20274a9b1831) | Next.js·Supabase·DB/API·테스트·실행 문서 | 요구와 코드, 완료 범위가 일치하는지 |
| [497b61b](https://github.com/Ahn-taegyu/Yeobek/commit/497b61b4baec776ffd9a9205fb0abc867efae207) | CI 앱 준비 대기의 실패 처리 보완 | 준비되지 않은 서버로 검사하지 않는지 |

66개 파일 변경이다. 추가 줄 중 7,663줄은 의존성 잠금 파일이므로 파일 수나 줄 수를 기능 완성도로 보지 않는다. main 병합·PR 생성·클라우드 배포·협업자 권한·브랜치 보호 변경은 이 작업에 포함되지 않았다. 기존 `docs/.obsidian/appearance.json` 개인 변경도 커밋에서 제외했다.

# 2. 요구 근거 → 구현 판단 → 확인할 코드

**사용자 확정**과 **구현자가 구체화한 선택**을 나눴다. 상세 명세의 proposed 항목을 사용자 승인으로 승격하지 않았다.

| 작업 | 근거와 확정 수준 | 이렇게 만든 이유와 대가 | 구현 증거 |
| --- | --- | --- | --- |
| Next.js·Supabase 시작 | [사용자의 직접 지시](../references/user-development-start.md), [D-008](../decisions/D-008-technology-stack.md) | 화면·API를 한 프로젝트에서 개발. 별도 서버 운영을 줄이지만 긴 AI 작업·파일 처리는 후속 경계 설계가 필요 | [버전·명령](https://github.com/Ahn-taegyu/Yeobek/blob/497b61b4baec776ffd9a9205fb0abc867efae207/package.json), [Route Handlers](https://github.com/Ahn-taegyu/Yeobek/blob/497b61b4baec776ffd9a9205fb0abc867efae207/src/app/api/admin/exhibitions/route.ts) |
| 작가·전시·작품을 별도 문서로 연결 | [D-011 사용자 확정](../decisions/D-011-knowledge-and-screens.md#사용자-확정-요구), [BR-15](../specs/functional-spec.md#br-15-내부-지식과-작가-공통-정보) | 정형 정보와 서술 문서를 구분하고 DB를 원본으로 보존. 자유로운 Markdown 그래프 전체를 구현한 것은 아님 | [주체별 문서 FK·section·출처](https://github.com/Ahn-taegyu/Yeobek/blob/497b61b4baec776ffd9a9205fb0abc867efae207/supabase/migrations/20261113030000_mvp_schema.sql#L73) |
| 사전 계정 로그인·소유자 격리 | D-008, [역할과 접근 권한](../specs/functional-spec.md#3-역할과-접근-권한) | 서버에서 인증 확인, DB에서도 소유자 제한. 앱에 service-role 키를 넣지 않음 | [getUser](https://github.com/Ahn-taegyu/Yeobek/blob/497b61b4baec776ffd9a9205fb0abc867efae207/src/lib/api/db.ts#L8), [RLS·쓰기 권한](https://github.com/Ahn-taegyu/Yeobek/blob/497b61b4baec776ffd9a9205fb0abc867efae207/supabase/migrations/20261113030000_mvp_schema.sql#L196) |
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
| publications | 공개 조회와 스냅샷 불변성 검사에 사용 | 작가가 승인·게시·철회할 실행 API |
| api_requests | 단기 관람 요청을 위한 스키마·타입·접근 제한만 준비 | 실제 요청 처리·요금 집계·만료 후 자동 정리 |

7개 묶음은 [기존 데이터 모델](../specs/data-model.md#엔티티)의 제안에 근거한다. 그래도 현재 기능만 기준으로 보면 `api_requests`는 선행 설계다. 유지하더라도 채팅 구현 전에는 운영 중인 요청 관리 기능으로 설명하지 않아야 한다. 승인·미디어 계약이 정해질 때 비활성 필드/테이블을 재검토할 여지가 있다.

# 4. 프런트 개발 전에 알아야 할 API 동작

11개 경로 파일에 GET/POST/PATCH **17개 처리 함수**가 있다. 전체 입력·응답은 [API 계약](../specs/api-contract.md)에 정리했다. 삭제·파일 업로드·AI 생성·게시 API는 후속 구현 범위다.

- **PATCH도 현재는 편집 폼 전체 값을 보내는 계약이다.** 제목/section/sourceRefs와 revision 등이 필요하며, 선택 날짜·장소·작품 메타데이터를 생략하면 null로 정규화된다. 임의 필드 하나만 보내는 부분 수정으로 사용하면 안 된다.
- 정형 정보와 문서를 함께 저장하면 `expectedRevision`과 `expectedDocumentRevision`을 검사한다. 한쪽이 오래되어도 409이며 전체 저장이 취소된다.
- 문서 단독 수정은 **내용이나 출처가 실제로 달라질 때만** 문서 revision이 증가한다. 같은 내용을 다시 저장하면 revision을 유지한다. 정형 정보 저장 RPC의 revision 동작과 구별한다.
- 새 전시/작품 최초 요청은 201이다. 같은 소유자의 삭제되지 않은 리소스에 대해 동일 ID·동일 정규화 입력을 재전송하면 200과 현재 저장본, 같은 ID에 다른 입력을 보내면 409다. 다른 소유자나 삭제된 리소스의 ID는 404로 처리한다.
- 문서 출처는 같은 소유자의 상위 작가/전시 문서로 제한한다. 자기 문서, 다른 전시 작품을 자유로운 위키 링크처럼 연결할 수 없다. 최신 원본 revision과 다르면 저장 시 충돌을 반환한다.
- 초안의 공개 조회는 404다. 게시 API가 없으므로 현재 일반 사용자 경로로 공개 상태까지 만들 수 없다.
- HTTP 요청 크기·Origin 검사는 Next.js API의 경계다. Supabase의 공개 데이터 API를 직접 호출하는 경우에도 안전해야 할 소유권·본문·출처 검사는 SQL/RLS가 담당한다.
- `/api/health`는 DB의 공개 조회 RPC까지 호출해 준비 여부를 확인한다. Auth·Storage·AI 제공사 전체의 상태를 검사하는 엔드포인트는 아니다.

# 5. 실제 검증 증거와 한계

[고정 커밋의 CI 실행 결과](https://github.com/Ahn-taegyu/Yeobek/actions/runs/43370914655/job/131706230721)를 이번 검토 때 다시 조회했다. App checks 작업과 모든 단계가 success다. 당시 로컬 Windows 검사와 별도로, 새 Linux 환경에서 npm ci부터 DB·HTTP 검증까지 재현했다.

| 검사 | 확인한 결과 | 입증하는 것 / 입증하지 못하는 것 |
| --- | --- | --- |
| lint·typecheck·build | 로컬 및 CI 성공 | 설정·타입·빌드 가능. 요구사항 충족 전체를 보장하지 않음 |
| [단위 검사](https://github.com/Ahn-taegyu/Yeobek/blob/497b61b4baec776ffd9a9205fb0abc867efae207/tests/unit/api-helpers.test.ts) | 16개 성공 | Origin·본문 크기·알 수 없는 필드·오류 은닉·날짜 필드 오류·응답 형식 |
| [pgTAP](https://github.com/Ahn-taegyu/Yeobek/blob/497b61b4baec776ffd9a9205fb0abc867efae207/supabase/tests/mvp_foundation_test.sql) | 53개 성공 | 실제 PostgreSQL의 소유자 격리·권한·출처·저장 충돌·공개 스냅샷 조건 |
| [HTTP 통합](https://github.com/Ahn-taegyu/Yeobek/blob/497b61b4baec776ffd9a9205fb0abc867efae207/tests/integration/api.test.mjs) | 7개 성공: 상위 검사 1 + 하위 시나리오 6 | 실제 Auth·쿠키·저장·병렬 재시도·타인 접근·오래된 저장 거부·로그아웃. 7개의 독립 시연 흐름을 뜻하지 않음 |
| DB 타입 차이 | CI에서 생성 결과와 Git 파일 동일 | migration과 TypeScript 스키마 결과 일치. 동적 RPC 인자 매핑은 별도 테스트가 필요 |
| 기획 문서 검사 | 당시 81개 노트·23개 기능·3 Bases, 회귀 검사 9개 성공 | 링크·ID·메타데이터·검색 도구. 설계 의미나 사용자 동의까지 판정하지 않음 |
| 브라우저 | 로그인 렌더링과 form method=post, password 필드 확인 | 실제 브라우저 로그인→편집→게시 전체 E2E, 모바일·음성·접근성 종합 검증은 아님 |

이번 검토 문서 추가 후에는 `python scripts/knowledge.py verify`를 다시 실행해 **83개 노트·23개 기능·3 Bases와 회귀 검사 9개**를 확인했다. 제품 코드는 변경하지 않아 앱 검사는 재실행하지 않았고, 위 고정 커밋의 CI 결과와 테스트 소스를 대조했다.

공개 정상 응답과 철회 조건은 **SQL에서 신뢰된 테스트 역할로 준비한 데이터**로 확인했다. HTTP 통합 검사는 초안 공개 조회의 404를 확인했으며, 게시 API의 성공 흐름을 검증한 것이 아니다. PDF 테스트도 메타데이터 행과 페이지 범위 검사이며 실제 PDF 추출·페이지 수 검증·Storage 파일 전송은 없다. 시간 부하·대용량 자료·네트워크 끊김·운영 HTTPS 세션·AI 품질도 아직 검증하지 않았다.

# 6. 위임 후 실제로 고친 사항

Sol이 DB와 협업 규칙을, Terra가 API 문서와 단위 테스트를 담당했다. 제가 요구/코드/테스트를 대조하고 통합 검사를 실행했으며, 별도 Sol 교차 리뷰와 수정 후 재검토를 거쳤다. 이번 검토서도 별도 읽기 전용 교차 리뷰를 받았다.

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

# 7. 이번 검토에서 남긴 차이와 권고

| 우선 검토할 항목 | 확인한 차이 | 권고 |
| --- | --- | --- |
| **초안 작가명 선택 여부** | [기능명세](https://github.com/Ahn-taegyu/Yeobek/blob/497b61b4baec776ffd9a9205fb0abc867efae207/docs/specs/functional-spec.md#L118)는 초안 이름 선택. [HTTP 스키마](https://github.com/Ahn-taegyu/Yeobek/blob/497b61b4baec776ffd9a9205fb0abc867efae207/src/lib/api/schemas.ts#L22)는 1자 이상 필수. DB는 null을 허용 | 기존 명세대로 이름 없이 소개를 임시 저장할 수 있도록 HTTP 계약을 맞추는 안 권고. 아직 수정하지 않음 |
| **PATCH를 전체 저장으로 유지할지** | 선택 필드 생략이 null로 바뀌므로 화면 구현자가 일반적인 부분 수정을 예상하면 기존 값을 지울 수 있음 | 이번 MVP는 전체 폼 저장으로 명확히 표시하고 호출자 계약을 테스트. 부분 수정이 필요하면 별도 변경으로 설계 |
| **문자 길이 기준** | 기능명세는 표시 문자 기준 통일을 요구. Zod 기본 길이는 UTF-16, SQL char_length는 코드포인트여서 이모지 등에서 차이 | 입력 폼 연결 전 동일한 길이 정책과 회귀 사례를 정할 것. 일반 한글 입력 검사만으로 일치했다고 보면 안 됨 |
| **Tailwind 적용 시점** | D-008·SPEC-007에는 Tailwind. 현재 package에는 없고 globals.css로 화면 골격 구현 | 아직 설치하지 않은 차이로 기록. 본격 화면 구현 전에 기존 계획대로 추가하거나 기술 명세를 변경 |
| 프로필 생성 시점 | SPEC-010은 계정 발급 때 준비. 실제는 첫 프로필 조회 **또는 첫 전시 생성** 때 생성 | 별도 발급 동기화를 줄이려는 구현 선택. 이 동작을 유지한다면 명세를 맞출 것 |
| 이전 문서의 완료 상태 | D-011:45·SPEC-010:79는 DB/앱도 미착수라고 남아 있음 | “DB/API 기반 일부 구현, 제품 RAG·전체 화면은 미완료”로 정합성 수정 필요. 원문 스냅샷 변경은 불필요 |
| revision 설명과 타입 보장 | SPEC-012 설명에 동일 내용 재저장 예외가 빠짐. RPC 공통 함수가 Record 인자를 타입 단언해 전달 | UI는 서버 반환 revision을 사용. 생성된 DB 타입만으로 모든 RPC 인자가 정적으로 보장된다고 주장하지 말 것 |
| 후속 기능용 테이블·공개 계약 | api_requests는 미사용. 실제 승인·철회 영향 계산·공개 번호 충돌·파일 전달은 미구현 | 지금의 7개 테이블 수를 고정 목표로 삼지 말고 해당 기능 구현 때 필요한 필드와 검증을 재확인 |

위 차이들은 **CI 성공과 함께 존재할 수 있다.** 이번 요청에서는 검토 기준을 보존하려고 제품 코드를 변경하지 않았다. 사용자 판단이 필요한 설계 선택과 명세에 맞춰 바로 정정할 수 있는 항목을 함께 표시했다.

# 8. 직접 검토하는 순서

1. [개발 착수 요청 원문](../references/user-development-start.md)과 [내부 지식 확정 요구](../decisions/D-011-knowledge-and-screens.md)를 읽고, 위 2번 표에서 요구가 누락되거나 제가 범위를 넓힌 부분을 본다.
2. 위 7번 표의 **작가명·전체 폼 저장·문자 길이·Tailwind**를 먼저 판단한다. 다음 화면 작업에 직접 영향을 주는 항목이다.
3. [스키마](https://github.com/Ahn-taegyu/Yeobek/blob/497b61b4baec776ffd9a9205fb0abc867efae207/supabase/migrations/20261113030000_mvp_schema.sql) → [RPC](https://github.com/Ahn-taegyu/Yeobek/blob/497b61b4baec776ffd9a9205fb0abc867efae207/supabase/migrations/20261113030100_mvp_rpc.sql) → [HTTP 계약](../specs/api-contract.md) 순서로 DB와 API의 역할을 확인한다.
4. [CI 결과](https://github.com/Ahn-taegyu/Yeobek/actions/runs/43370914655)와 [테스트](https://github.com/Ahn-taegyu/Yeobek/blob/497b61b4baec776ffd9a9205fb0abc867efae207/tests/integration/api.test.mjs)에서 정상 저장뿐 아니라 거부되는 요청도 확인한다.
5. [협업 규칙](../collaboration.md)의 리뷰어 1명·squash·긴급 예외·공유 migration 수정·worktree 격리를 팀 운영 기준으로 채택할지 검토한다. 작성된 규칙과 실제 원격 보호 설정을 구별한다.

로컬 재현 명령은 저장소 루트 README의 앱 실행·검사 절을 따른다. 리뷰를 위해 전체 DB를 초기화할 필요는 없다. 실제 작가 자료·키를 문서나 PR에 붙이지 않고, 가짜 로컬 계정과 테스트 자료만 사용한다.
