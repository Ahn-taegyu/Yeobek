---
type: Guide
id: GUIDE-007
title: Yeobek MVP 기반 검토 반영 확인서
description: 검토서 9~11절의 지적을 반영한 수정 커밋 03459bf·f38d136을 직접 실행해 확인한 결과와 사용자 확인이 필요한 판단을 기록한다.
status: stable
updated: '2026-11-13'
tags: [yeobek, review, foundation]
rag_include: false
generated:
  by: claude-code/claude-fable-5-2
  at: '2026-11-13T16:29:31+09:00'
sources:
- id: fix-review-request
  resource: /references/user-fix-review.md
  title: 검토 반영 작업의 적용 확인 요청
- id: review
  resource: /reviews/mvp-foundation-2026-11-13.md
  title: 개발 기반 검토서와 12절 반영 기록
- id: implementation-request
  resource: /references/user-review-implementation.md
  title: 검토 내용의 실제 구현 반영 요청
- id: api-contract
  resource: /specs/api-contract.md
  title: 현재 API 계약과 예외 코드 대응
- id: requirements
  resource: /specs/functional-spec.md
  title: 기능명세 4.1 입력 필드와 검증
- id: pull-request
  resource: https://github.com/Ahn-taegyu/Yeobek/pull/1
  title: Draft PR 1과 f38d136의 검사 결과
---

# 먼저 판단할 내용

[개발 기반 검토서](mvp-foundation-2026-11-13.md) 9~11절의 지적은 수정 커밋에서 **의도대로 반영됐다.** 직접 실행한 검사와 HTTP 재현에서 문제를 찾지 못했다. 다만 수정 과정에서 내린 판단 가운데 **사용자 확인이 필요한 것이 3건** 있다(3절).

이 문서는 [SRC-023](../references/user-fix-review.md)에 따라 Claude Code가 작성했다. 수정을 구현한 쪽의 기록은 검토서 12절이고, 이 문서는 그 반영을 별도로 확인한 기록이다. 제품 코드·테스트·명세는 수정하지 않았다.

| 구분 | 내용 |
| --- | --- |
| 확인 대상 | `feat/mvp-foundation`의 [03459bf](https://github.com/Ahn-taegyu/Yeobek/commit/03459bf6e9ea121f20d41110dff740edac964957)(수정)와 `f38d136`(검토서 12절 기록). 비교 기준은 `ea92e2a` |
| 확인 방법 | 별도 worktree를 `f38d136`으로 맞춘 뒤 새로 설치·빌드·실행. 로컬 `yeobek-mvp` 스택에는 새 migration이 이미 적용된 상태였다 |
| 확인하지 않은 것 | 새 DB에 migration 전체를 처음부터 적용하는 경로(원격 CI가 수행), 실제 휴대기기, 클라우드 프로젝트, 390px 화면 |

# 1. 직접 실행한 검사

| 검사 | 결과 | 검토서 12.2와 비교 |
| --- | --- | --- |
| `npm ci`, lint, typecheck, build | 성공. build는 `--webpack` | 일치 |
| 단위 검사 | 35개 통과 | 일치 |
| pgTAP | 79개 통과 | 일치 |
| HTTP 통합 | 10개 통과(상위 1 + 하위 9). 빌드한 앱을 3100번 포트에 띄워 실행 | 일치 |
| DB 타입 생성 | 저장된 파일과 차이 없음 | 일치 |
| 원격 CI | [Draft PR #1](https://github.com/Ahn-taegyu/Yeobek/pull/1)의 `f38d136`에서 App checks·Knowledge checks가 success. `03459bf`의 App checks는 cancelled인데 바로 뒤 커밋이 올라오며 취소된 것 | 12.4는 결과를 PR에서 확인하라고만 적었고, 이번에 조회해 확인 |

HTTP 통합 검사와 아래 직접 요청은 가짜 계정과 초안을 폐기 가능한 로컬 DB에 남겼다.

# 2. 지적별 반영 확인

로컬 테스트 계정으로 로그인해 Node fetch·쿠키 jar로 요청하고 응답을 관찰했다.

| 지적(검토서 절) | 수정 후 관찰 | 판정 |
| --- | --- | --- |
| 상위 문서 수정 뒤 하위 저장이 모두 409 (9.1, 10.3) | 작가 소개 수정 뒤 작품 제목만 바꾸는 PATCH가 200. 문서 revision은 유지되고 응답 `sourceWarnings`에 `source_changed`와 `currentRevision`이 옴 | 반영 |
| 출처 충돌과 일반 충돌 구분 불가 (9.1) | 새로 넣거나 바꾼 낡은 출처는 409 `SOURCE_REVISION_CONFLICT`와 `sourceRefs` 필드 오류. 일반 충돌은 `REVISION_CONFLICT` 유지 | 반영 |
| 참조한 상위 section 삭제 시 400 (9.1) | 기존 출처를 그대로 둔 저장은 200이고 `source_unavailable` 경고가 옴 | 반영 |
| 낡은 출처를 최신으로 갱신하는 경로 | `sourceRevision`을 현재 값으로 바꿔 보내면 200, 경고가 사라지고 문서 revision 증가 | 반영 |
| 연도 0 날짜·NUL 문자가 500 (10.2) | 모두 400 `INVALID_INPUT`과 필드 오류 | 반영 |
| 작가명 필수 (7, 11.1) | 이름 없이 소개만 저장해도 200, 이름은 null | 반영 |
| 보이지 않는 제목 저장 (10.3) | 폭 없는 공백(`​`), 한글 채움 문자(`ㅤ`)만 있는 제목과 작가명은 400 | 반영(HTTP 경계만, 4절) |
| 본문 공백 처리 (7, 11.1) | 앞뒤 공백 제거 후 저장. 5,000자에 앞뒤 공백을 붙여도 201, 5,001자는 400. 공백만 다르게 다시 보내면 revision 유지. 이모지 2,501개는 201 | 반영 |
| 번호 중복과 요청 ID 충돌이 같은 코드 (9.3, 11.1) | 생성과 번호 변경 PATCH 모두 409 `DUPLICATE_NUMBER`와 `number` 필드 오류. 같은 ID·다른 입력은 409 `REQUEST_ID_CONFLICT` | 반영 |
| `retryable` 없음, 로그인 실패 코드 (11.1) | 모든 오류 응답에 `retryable` 포함. 틀린 비밀번호는 401 `INVALID_CREDENTIALS` | 반영 |
| 예외 코드 체계 차이 (11.1) | HTTP 이름을 바꾸지 않고 [API 계약](../specs/api-contract.md)에 EX 코드 대응표를 추가 | 반영(대응표 방식) |
| 로그인·작가 홈 누락 (11.1) | 비밀번호 표시 전환 버튼, 프로필 응답의 `accountEmail`, 목록의 `artworkCount`·기간·장소, `updatedAt` 내림차순. 로그인·첫 화면을 브라우저에서 확인 | 반영 |
| 보안 헤더·`APP_ORIGIN` (9.3) | 응답에 `frame-ancestors 'none'` CSP와 `X-Frame-Options: DENY`. 운영에서 `APP_ORIGIN` 누락 시 503은 단위 검사로 확인 | 반영 |
| CI·주석·오류 문구 (9.3) | 앱 CI는 main push·PR·수동 실행, health 실패 시 앱 로그 출력. 없는 proxy 주석 정정, 작가 홈의 파싱 오류 원문 제거 | 반영(코드 확인) |
| 테스트 공백 (9.2) | 전시 PATCH 성공·유효 날짜·목록·작품 PATCH·익명 JWT·nonempty 출처 검사 추가. 검사 수 증가로 확인 | 반영 |

기존 출처를 재검증 없이 통과시키는 수정이 우회로가 되지 않는지도 확인했다. 낡은 출처를 한 개 더 복사해 넣거나 다른 section으로 옮기면 409 `SOURCE_REVISION_CONFLICT`로 거부된다. 통과하는 것은 저장된 것과 완전히 같은 출처의 저장된 개수만큼이다.

# 3. 사용자 확인이 필요한 판단

아래는 수정 과정에서 구현 쪽이 내린 판단이다. [SRC-022](../references/user-review-implementation.md)도 기술 판단이라고 적었다. 이 문서는 어느 쪽도 승인된 결정으로 올리지 않는다.

| 판단 | 확인한 내용 | 정할 것 |
| --- | --- | --- |
| **기능명세의 길이 기준 변경** | [기능명세 4.1](../specs/functional-spec.md#41-입력-필드와-검증)의 "사용자에게 표시되는 문자 기준"이 "유니코드 코드포인트"로 바뀌었다. 구현에 맞춰 명세 문장을 고친 것이다. 필드 길이는 같은 문서 Q-01의 미결정 항목이다 | 코드포인트 기준을 채택할지. 채택하지 않으면 명세 문장을 되돌리고 화면 카운터 정책을 따로 정한다 |
| **Tailwind 도입과 Webpack 전환** | Tailwind 4·PostCSS를 넣으면서 `dev`·`build`를 `--webpack`으로 바꿨다. Windows에서 Turbopack PostCSS worker가 종료되는 문제를 피하려는 선택이다. 현재 `src`에 Tailwind 유틸리티 클래스 사용은 없고, 기본 초기화만 적용돼 문단 여백이 0이 됐다. 로그인·첫 화면은 깨지지 않았다 | 지금 유지할지, 화면 작업을 시작할 때까지 미룰지. 유지한다면 Turbopack 복귀 조건을 정한다 |
| **기존 출처의 재검증 생략** | 저장된 것과 같은 출처는 낡거나 이용 불가여도 계속 저장되고 경고만 반환한다. 초안 편집을 막지 않으려는 선택이며 검토서 9.1·11.1이 권한 방향과 같다 | 승인·게시 단계에서 낡은 출처를 반드시 다시 확인하는 규칙을 그 구현의 수용 조건으로 둘지. 검토서 12.3도 후속으로 적었다 |

# 4. 작은 지적

| 항목 | 확인한 내용 | 권고 |
| --- | --- | --- |
| 500의 `retryable` | 원인을 모르는 500 `INTERNAL_ERROR`도 `retryable: true`. 코드로 확인 | 화면이 자동 재시도를 붙이지 않게 하거나, 원인 미상 500은 false로 둘지 검토. BR-14는 무한 자동 재시도를 금지 |
| 보이지 않는 제목의 SQL 경계 | 제목 가시성 검사는 HTTP 스키마에만 있고 새 migration에는 없다. Supabase API를 직접 호출하면 저장될 수 있다. 코드로 확인했고 실행하지 않음 | 직접 호출까지 막으려면 SQL에도 같은 검사를 둔다 |
| CSP 범위 | 프레임·base·object만 제한하고 script 제한은 없다. 검토서 12.1도 같은 한계를 적었다 | 화면이 늘어난 뒤 script 정책을 추가 |
| 번호 중복 판별 방식 | `errors.ts`가 PostgreSQL 오류 문구 안의 제약 이름 문자열로 `DUPLICATE_NUMBER`를 판별한다 | 제약 이름을 바꾸는 migration에서 함께 수정. 삭제 작품 번호 재사용(12.3)을 부분 유일 인덱스로 풀 때 해당 |
| NUL 오류의 필드 위치 | 본문의 NUL 오류는 필드가 `sections`까지만 나와 어느 section인지 알 수 없다 | 편집 폼 연결 때 필요하면 경로를 세분화 |
| 목록 정렬 기준 | `updatedAt`은 전시 정형 정보 저장 때만 바뀐다. 작품이나 전시 문서만 고치면 순서가 바뀌지 않는다. 코드로 확인 | "최근 수정순"의 범위를 화면 작업 때 정한다 |

# 5. 후속으로 남긴 항목에 대한 의견

검토서 12.3이 수정하지 않고 남긴 삭제 작품 번호 재사용, 계정 삭제 FK, 작가 쪽 생성 작업 저장은 삭제·게시·생성 API와 함께 설계해야 하는 항목이다. 지금 부분 수정하지 않은 판단은 타당하다고 본다. F-001·F-002·F-023을 완료로 올리지 않은 것도 현재 구현 범위와 맞다.

이 확인은 화면을 포함한 UC·AC 시나리오 실행이 아니다. AC-01~19의 실행 상태는 [시나리오 문서](../specs/user-scenarios.md)의 표시를 따른다.
