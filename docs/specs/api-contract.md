---
type: Specification
id: SPEC-011
title: MVP API 계약
description: OP-01~22의 초기 기반 및 후속 HTTP 계약과 접근·버전 경계.
status: draft
updated: '2026-11-14'
tags: [yeobek, api, mvp]
rag_include: true
generated:
  by: codex/gpt-6
  at: '2026-11-13T04:39:38+00:00'
decision_status: proposed
work_status: in_progress
sources:
- id: backend
  resource: /references/user-backend-completion.md
  title: 백엔드 완성 계획 요청 원문
- id: playbooks-plan
  resource: /references/user-harness-playbooks-plan.md
  title: 하네스 후속 실패 대응과 실행 단계 계획
- id: pr2-review
  resource: /references/user-ai-pr2-review.md
  title: AI 하네스 PR2 검토와 수정 요청
- id: harness
  resource: /specs/ai-harness.md
  title: 제품 AI 실행 하네스 준비 범위
- id: review-implementation
  resource: /references/user-review-implementation.md
  title: MVP 기반 리뷰 반영 요청
- id: implementation
  resource: /specs/development-foundation.md
  title: 실제 개발 기반과 검증 범위
- id: functional
  resource: /specs/functional-spec.md
  title: MVP 기능명세와 OP-01~22
- id: data
  resource: /specs/data-model.md
  title: 최소 데이터 모델
- id: knowledge
  resource: /specs/artist-knowledge.md
  title: 내부 지식 저장 계약
- id: chat
  resource: /specs/chat-interaction.md
  title: 통합 채팅과 독립 입출력
- id: stack
  resource: /specs/technology-stack.md
  title: 기술 스택과 초기 제한
- id: decision
  resource: /decisions/D-011-knowledge-and-screens.md
  title: 내부 지식과 화면 요구
---

# 범위와 공통 계약

[기능명세 OP-01~22](functional-spec.md#8-api-명세로-넘길-업무-계약)를 HTTP로 구체화한 계약이다. 초기 기반·W1·W4 글 게시 경로는 병합됐고 W5 글 채팅·보완 요청 경로를 연결했다. 그 밖의 후속 경로는 설계 제안이다. 검증 범위와 한계는 [개발 기반 현황](development-foundation.md)에 기록한다. [D-011](../decisions/D-011-knowledge-and-screens.md), [내부 지식](artist-knowledge.md), [데이터 모델](data-model.md), [채팅](chat-interaction.md)을 함께 적용한다.

- JSON 성공 응답은 `{ "data": ..., "requestId": "UUID" }`, 오류는 `{ "error": { "code": "...", "message": "...", "retryable": true, "retryAfter": 5, "fields": {} }, "requestId": "UUID" }` 형태다. `retryAfter`(초)와 `fields`는 선택 사항이며, `retryAfter`가 있으면 `Retry-After` 헤더도 반환한다. `retryable`은 429·5xx와 409 `REQUEST_IN_PROGRESS`에서 true이되 서버 설정 오류는 false다. 오류는 비밀·내부 오류를 노출하지 않는다. 미디어 바이트는 예외다.
- 리소스 ID와 생성 요청 ID는 UUID다. 생성 요청은 클라이언트가 안정적인 `id`를 생성해 재시도하며, 같은 소유자·ID·동일 입력은 기존 결과를 반환하고 다른 입력이면 409다. `requestId`는 추적용이고 리소스 ID와 구별한다. `POST` 생성 성공은 201, 동일 재시도는 200, 조회·변경은 200이다.
- 오류는 400 `INVALID_INPUT`/`SOURCE_UNAVAILABLE`, 401 `UNAUTHENTICATED`/`INVALID_CREDENTIALS`, 404 `NOT_FOUND`, 409 `CONFLICT`/`REVISION_CONFLICT`/`SOURCE_REVISION_CONFLICT`/`DUPLICATE_NUMBER`/`REQUEST_ID_CONFLICT`, 413 `TOO_LARGE`, 429 `RATE_LIMITED`, 500 `INTERNAL_ERROR`를 사용한다. 소유하지 않거나 비공개인 리소스는 존재를 드러내지 않는 404다. 로그인 실패는 일반적인 자격 오류다.
- 관리자 요청은 `@supabase/ssr` 쿠키 세션을 사용하고 서버에서 `getUser` 또는 검증된 `getClaims`로 사용자를 확인한다. 모든 관리자 조회·변경에 소유권과 RLS를 적용한다. 클라이언트의 owner, 승인 상태, 공개 상태를 신뢰하지 않는다. 변경 요청은 same-origin을 검사한다. 로그아웃은 세션과 클라이언트 관리자 캐시를 지운다.
- PATCH는 `expectedRevision`을 요구하며 정형 필드와 문서를 함께 바꾸면 `expectedDocumentRevision`도 요구한다. DB에서 두 버전을 원자적으로 확인·저장하고 충돌 시 409로 재조회하게 한다. 초안 변경은 기존 공개 스냅샷을 바꾸지 않는다. 목록은 소유 또는 공개 범위를 서버에서 제한하고 안정적인 순서로 반환한다.
- 입력은 서버에서 타입·길이·관계·UUID를 검사한다. 요청 크기와 횟수 제한을 적용한다. 관람 글 요청은 세션 전체 분 6회·전시 일일 1,000회를 DB 정책으로 원자 적용하며 인식·합성도 같은 한도를 공유한다. 녹음 30초/3MB, 질문 500자 등 상세 값은 [초기 상한](technology-stack.md#초기-상한과-실패-처리)을 따른다. 실제 한도와 오류 정책은 구현 시 검증한다.

# W1 해설 작업 경로 (PR #5 병합)

| 경로 | 요청과 동작 |
| --- | --- |
| `POST /api/admin/artworks/{id}/generations` | `{requestId,expectedRevision,expectedDocumentRevision,strategy?}`로 소유 작품의 작업을 예약하고 동기 실행. 동일 요청 재실행은 기존 작업 반환 |
| `GET /api/admin/jobs/{id}` | 소유 작업 상태와 결과 조회 |
| `POST /api/admin/jobs/{id}/retry` | `{requestId,expectedAttempt}`로 실패·중단된 시도 재시도 |
| `PATCH /api/admin/artworks/{id}/narration` | `{expectedRevision,text,sourceJobId?}`로 작가가 명시적으로 초안 적용. 생성만으로 편집본이나 공개본을 바꾸지 않음 |

작업은 소유자별 일일 한도(초기 100회), 180초 lease와 30일 만료 정책을 사용한다. 요청 안에서 동기 실행하며 프로세스 중단 시 조회와 재시도로 복구한다. 작업 예약·완료는 서버 전용 `SUPABASE_SERVICE_ROLE_KEY`를 쓰는 신뢰된 worker가 수행하고 owner는 검증된 세션에서 전달한다. 타인 작업은 노출하지 않는다. 모의 모드는 개발·테스트 환경에 한정한다. DB 타입·권한·모의 HTTP 로컬 검증과 PR #5 CI를 통과했다. 만료 후 접근은 차단하며 물리 삭제 RPC와 비밀값으로 보호한 정리 HTTP가 추가됐다. 운영 스케줄러 설정은 배포 시 필요하다.

작업 응답은 `id,kind,artworkId,documentId,requestId,attempt,status,routing,resultCode,expectedRevision,expectedDocumentRevision,strategy,result,mock,createdAt,updatedAt,expiresAt`를 포함한다. 성공 결과는 `result.selected.answer/citations/followUpQuestions?`, `overTarget`, `mock`이며 내부 단계·사용량·원자료는 HTTP에 넣지 않는다. 추가 질문 플래그를 끄면 저장된 작업을 읽을 때도 해당 필드를 생략한다. 요청 본문의 `requestId`는 작업 중복 방지 키이며 응답 봉투의 추적 ID와 별개다.

최초 예약은 최종 작업이 실패해도 HTTP 201이므로 `status`를 확인한다. 동일 생성 요청 재전송은 200이며, 재시도는 새 요청 ID와 현재 `expectedAttempt`를 사용한다. `running`은 조회로 확인하고 임대 만료 시 `failed/REQUEST_TIMEOUT`으로 표시된다. `succeeded`는 명시적 저장 가능, `abstained`는 자료·후보 검토 필요, `failed/cancelled`는 재시도 가능 상태다. 입력 자료가 바뀌면 새 revision으로 새 생성 요청을 보낸다. 예약 거부는 429 `AUTHOR_JOB_LIMIT`, 요청 ID 재사용 충돌은 409 `REQUEST_ID_CONFLICT`, 진행 중·완료 시도 재시도는 409 `JOB_ATTEMPT_CONFLICT`다. `routing`은 작가 수정이 필요한 `author`, 설정·시스템 점검이 필요한 `operator`, 정상·취소의 `none`을 구별한다.

# W4 글 승인·게시 경로 (PR #6 병합)

| 경로 | 계약 |
| --- | --- |
| `POST /api/admin/artworks/{id}/evidence` | `scope`, `sourceLabel`, `body`, `source`, 선택적 `evidenceId`·`expectedVersion`으로 근거 생성/수정 |
| `GET /api/admin/artworks/{id}/review` | 작품·근거·해설 승인·음성·공개본·차단 사유와 소개 근거 핀 조회 |
| `POST /api/admin/artworks/{id}/approvals` | `kind=evidence`의 `evidenceId,version` 또는 `kind=narration`의 `expectedRevision,citations`로 각각 승인 |
| `POST /api/admin/exhibitions/{id}/publication` | `publish`는 `requestId,expectedRevision,artworks,intro`로 선택 작품과 소개 근거 버전을 원자적으로 게시; `pause/resume`은 `expectedRevision,artworkId?` 사용 |
| `GET /api/admin/exhibitions/{id}/labels` | 공개 경로·작품 번호와 제목 조회 |
| `POST /api/admin/evidence/{id}/impact` | `expectedVersion`으로 다른 전시까지 포함한 철회 영향과 token 조회 |
| `POST /api/admin/evidence/{id}/revoke` | `expectedVersion,impactToken`으로 영향 재검사 후 철회 |

소개 `intro`는 `bio,introduction,theme` 각각 승인 근거의 `{id,version}` 또는 null을 명시한다. 출처가 바뀐 근거는 현재 버전 검사에 실패한다. 게시·재개의 현재 음성 필수 설정은 신뢰된 worker만 전달하며 DB가 같은 트랜잭션에서 동기화·검사한다. 플래그 변경 자체는 기존 공개본을 바꾸지 않는다. 음성이 선택 사항이고 설정이 없으면 글 전용 게시가 가능하다. W4 작가 음성 작업과 비공개 Storage는 PR #9로 병합됐고 W5 글 채팅은 공개 문맥 RPC를 호출한다. 로컬 DB 197개·단위 357개·typecheck·build와 새 게시 HTTP 5개가 통과했다. 이미지 준비는 DB fixture이며 실제 업로드·미디어 검증은 W3에서 연결한다.

# 초기 기반 경로

W3의 자료 업로드·삭제 구현 계약은 이 문서의 [W3 자료 경로](#w3-자료-경로)를 따른다. 아래 후속 표의 과거 업로드 제안보다 우선한다.

JSON 요청 상한은 64KiB이며 실제 수신 바이트도 제한한다. 출처는 최대 24개, section은 주체별 최대 2개다. 변경 요청에는 동일 출처의 Origin과 application/json이 필요하다. 403 `FORBIDDEN`, 415 `UNSUPPORTED_MEDIA_TYPE`, 503 `SERVICE_UNAVAILABLE`도 반환한다. 인증 서비스 장애를 로그인 실패 401과 구분한다. 관람 요청은 W5 DB 한도를 적용하며 로그인 요청 제한은 Supabase Auth 정책을 적용한다. 프로필은 첫 `GET /api/admin/profile` 또는 첫 전시 생성에서 빈 문서와 함께 지연 생성한다. 계정 생성·로그인·전시 목록 조회만으로 생성하지 않으며, 프로필이 없는 상태의 프로필 PATCH는 404다.

**현재 정형 정보 PATCH는 전체 편집 값 저장이다.** 프로필은 선택 값 displayName을 받고, 전시는 title, 작품은 number/title을 요구한다. 모두 sections·sourceRefs·expectedRevision·expectedDocumentRevision이 필요하다. displayName, 날짜·장소·작품 메타데이터 같은 선택 필드를 생략하면 null로 바뀐다. 생략한 필드를 기존 값으로 유지하는 부분 수정 계약이 아니다. 문서 단독 PATCH는 sections·sourceRefs·expectedRevision을 요구한다.

문서 sections/sourceRefs가 정규화 후 기존 JSONB와 같으면 문서 revision은 유지하고, 달라지면 증가한다. 정형 정보 revision은 성공 저장마다 증가한다. 본문은 JavaScript `trim()`과 같은 앞뒤 공백을 제거한 뒤 유니코드 코드포인트 5,000개 이하를 검사해 저장한다. 기존 본문과 공백 제거 후 같으면 과거 저장 원문을 유지한다.

기존 초안에 정확히 같은 출처 참조는 개별적으로 보존해 저장을 막지 않는다. 문서 응답의 `sourceWarnings`는 변경된 문서 출처에 `source_changed`와 현재 revision을, 사용할 수 없는 문서·자료 출처에 `source_unavailable`을 표시한다. 문서 경고에는 대상 `sectionId`, `sourceDocumentId`, `sourceSectionId`, `sourceRevision`이 포함된다. 새로 추가하거나 변경한 출처는 소유권·상위 범위·section·현재 revision 또는 자료의 ready 상태를 검증한다. DB P1001은 409 `SOURCE_REVISION_CONFLICT`, P1002는 400 `SOURCE_UNAVAILABLE`이다. W3부터 새 PDF 참조는 검증된 총 페이지 범위를 검사한다. 승인 근거는 material version을 고정한다. 기존 초안의 정확히 같은 참조와 기존 공개 스냅샷은 보존하며, 페이지 수가 확인되지 않은 PDF 근거는 새 승인·게시에서 거부한다.

아래 필드는 현재 초기 API 계약이며 `?`는 생략 가능, `document`는 `{id, subjectType, subjectId, revision, sections, sourceRefs, sourceWarnings, updatedAt}`이다. HTTP 필드는 camelCase이고 DB의 snake_case와 서버에서 변환한다. `sections`는 `{id,body}` 배열이며 ID는 문서 내 안정적이다: 작가 `bio`/`practice`, 전시 `introduction`/`theme`, 작품 `description`/`notes`. `sourceRefs`는 빈 배열도 허용하며 직접 입력·자료·문서 출처를 해당 소유 범위에서 검증한다. 생성·수정의 `sections`, `sourceRefs`는 내부 문서 원본이며 정형 필드와 트랜잭션으로 저장한다. 프로필은 사전 생성된 계정당 하나다.

| OP | 경로 | 입력 → `data` |
| --- | --- | --- |
| 01 | `POST /api/auth/login` | `{email,password}` → 인증 상태; 쿠키 설정 |
| 01 | `POST /api/auth/logout` | 빈 객체 → 로그아웃 상태 |
| 21 | `GET /api/admin/profile` | 자기 프로필 → `{id,displayName,accountEmail,revision,document}` |
| 21 | `PATCH /api/admin/profile` | `{expectedRevision,expectedDocumentRevision,displayName?,sections,sourceRefs}` → 저장된 프로필·문서 |
| 02 | `GET /api/admin/exhibitions` | 자기 전시 목록 → `{items:[...]}`; 각 항목에 `artworkCount`(삭제되지 않은 작품 수), `startDate`, `endDate`, `place`; `updatedAt` 내림차순, ID로 동률 정렬 |
| 02 | `POST /api/admin/exhibitions` | `{id,title,startDate?,endDate?,place?,sections,sourceRefs}` → 전시 ID·draft·revision·document; 소유자/작가는 서버 지정 |
| 03 | `GET /api/admin/exhibitions/{id}` | 자기 전시 → 초안 필드·state·revision·document |
| 03 | `PATCH /api/admin/exhibitions/{id}` | `{expectedRevision,expectedDocumentRevision,title,startDate?,endDate?,place?,sections,sourceRefs}` → 저장된 초안·문서 |
| 04 | `GET /api/admin/exhibitions/{id}/artworks` | 자기 전시 작품 → `{items:[...]}` |
| 04 | `POST /api/admin/exhibitions/{id}/artworks` | `{id,number,title,creationYear?,medium?,dimensions?,sections,sourceRefs}` → 작품 ID·revision·document; 전시 내 번호 중복 409 |
| 04 | `GET /api/admin/artworks/{id}` | 자기 작품 → 초안 필드·revision·document |
| 04 | `PATCH /api/admin/artworks/{id}` | `{expectedRevision,expectedDocumentRevision,number,title,creationYear?,medium?,dimensions?,sections,sourceRefs}` → 저장된 초안·문서 |
| 07, 22 일부 | `GET /api/admin/knowledge/{id}` | 소유 문서 ID → document |
| 07, 22 일부 | `PATCH /api/admin/knowledge/{id}` | `{expectedRevision,sections,sourceRefs}` → document; 문서만 수정하며 승인·게시하지 않음 |
| 15 일부 | `GET /api/public/exhibitions/{id}` | 활성 공개 전시 → 공개 스냅샷과 공개 작품 목록; 비공개·중지·삭제는 404 |
| 15 일부 | `GET /api/public/exhibitions/{id}/artworks/{artworkId}` | 해당 전시의 활성 공개 작품 → 공개 스냅샷·활성 publication ID; 비공개는 404 |
| 운영 | `GET /api/health` | DB 공개 조회 RPC까지 3초 제한으로 호출 → `{status:"ok"}`; Auth·Storage·AI 전체 상태 검사는 아님 |

관람 조회는 전시와 작품의 현재 공개 게이트 및 활성 publication을 확인하고 원시 DB, 내부 위키, 비공개 PDF나 Storage URL을 반환하지 않는다. 유효한 공개 묶음이 없으면 404다. 공개 응답의 `Cache-Control: no-store`는 캐시 저장을 금지하는 지시이며, 중지 이후 새 요청의 데이터 반환을 차단하는 것은 SQL의 현재 공개 조건 검사다.

# 시나리오 예외와 현재 HTTP 대응

인증 429의 retryAfter는 60초, 인증 서비스 503은 5초의 앱 권고 대기다. 제공자 쿼터가 정확히 그때 복구된다는 보장은 아니며 자동 반복 요청을 지시하지 않는다. 409는 같은 입력의 무조건 재전송 대신 충돌 원인을 확인한다.

시나리오의 EX 코드는 업무 의미를 유지하며 HTTP 코드 이름을 덮어쓰지 않는다. 아래는 현재 구현된 경로의 대응이다. 나머지 EX는 해당 후속 기능 구현 전이다.

| 시나리오 | 현재 HTTP 대응 |
| --- | --- |
| EX-01 `VALIDATION_ERROR` | 400 `INVALID_INPUT`; 새 출처 이용 불가는 400 `SOURCE_UNAVAILABLE` |
| EX-02 `DUPLICATE_NUMBER` | 409 `DUPLICATE_NUMBER` (현재 전시 내 초안 번호) |
| EX-03 `AUTH_REQUIRED`, `INVALID_CREDENTIALS` | 401 `UNAUTHENTICATED`, 로그인 자격 오류는 401 `INVALID_CREDENTIALS` |
| EX-04 `RESOURCE_UNAVAILABLE` | 타인·없는 리소스는 404 `NOT_FOUND`; 권한 없는 요청은 403 `FORBIDDEN` |
| EX-07 `REVISION_CONFLICT` | 409 `REVISION_CONFLICT`; 신규·변경 출처 revision 충돌은 409 `SOURCE_REVISION_CONFLICT` |
| EX-16 `PROVIDER_UNAVAILABLE` | 인증 서비스 장애는 503 `SERVICE_UNAVAILABLE` |
| EX-17 `RATE_LIMITED` | 인증 제공자 제한은 429 `RATE_LIMITED` |
| EX-21 `REQUEST_ID_CONFLICT` | 생성 ID와 다른 입력은 409 `REQUEST_ID_CONFLICT`; 진행·불명 작업은 후속 |

운영 환경에서 `APP_ORIGIN`이 없거나 설정된 URL이 잘못되면 변경 요청은 503 `SERVER_CONFIGURATION_ERROR`, `retryable: false`다. 개발 환경에서 값이 없으면 요청 URL을 기준으로 한다.

## AI 실패 결과 대응 (후속 HTTP 제안)

서버의 `normalizeAiOutcome`은 하네스·작가 자료·제공사 오류와 해설 생성의 `status: "abstained"` 결과에 아래 대응을 적용한다. 표의 `retryable`은 작업 상태를 확인한 후 사용자가 다시 시도할 수 있는지 나타낸다. 공통 HTTP 정책에 따라 429와 5xx는 `true`이며 서버 설정 오류는 `false`다. 이 값으로 자동 재호출하지 않는다. 제공사 어댑터의 `AiError.retryable`은 `rate_limited`와 `provider_unavailable`에만 `true`다.

| 내부 실패 | 후속 HTTP 대응 | 근거 |
| --- | --- | --- |
| `invalid_request`, `invalid_input` | 400 `INVALID_INPUT` | EX-01 |
| 자료·해설 `unavailable`, `publication_unavailable`, `answer_unavailable` | 404 `NOT_FOUND` | EX-04의 존재 비노출 정책. 내부 결과만으로 공개 교체·철회·답변 만료를 구분할 수 없다. |
| `revision_conflict`, `stale_context` | 409 `REVISION_CONFLICT` | EX-07 |
| `proposal_expired` | 410 `PROPOSAL_EXPIRED` | 임시 대응 |
| 해설 `insufficient_evidence` | 422 `EVIDENCE_REQUIRED` | EX-08 |
| 해설 `clarify` | 422 `CONTEXT_AMBIGUOUS` | EX-25. 관람의 고정 확인 응답은 성공 응답으로 처리한다. |
| `cancelled` | 499 `REQUEST_CANCELLED` | 임시 대응. 이미 연결이 종료된 경우 응답을 전달할 수 없다. |
| `invalid_context`, 알 수 없는 결과 | 500 `INTERNAL_ERROR` | 공통 오류 계약 |
| `invalid_output`, `invalid_response`, `response_too_large`, `invalid_candidate`, `below_threshold` | 502 `AI_INVALID_OUTPUT` | 임시 대응. 내부 코드는 인용 오류(EX-09) 외에도 형식·안전·품질 위반을 포함한다. |
| `provider_rejected`, `refused`, `incomplete`, `generation_failed`, `judge_failed` | 502 `AI_GENERATION_FAILED` | 임시 대응 |
| `not_configured` | 503 `SERVER_CONFIGURATION_ERROR` | 공통 설정 오류 정책 |
| `provider_unavailable`, `network_error` | 503 `PROVIDER_UNAVAILABLE` | EX-16 |
| `timeout` | 504 `REQUEST_TIMEOUT` | EX-16 |
| `rate_limited` | 429 `RATE_LIMITED` | EX-17 |

선택된 해설은 성공 응답 경로에서 처리한다. HTTP 연결 단계에서 이 결과를 `ApiError`와 안전한 안내 문구로 연결하며 원본 오류·보류 객체를 응답에 싣지 않는다. 임시 대응과 STT·TTS의 업무별 EX-15·18 변환은 해당 경로의 HTTP 통합에서 확인한다. [시나리오의 업무 예외](user-scenarios.md#예외-처리-목록)

# 후속 경로

다음은 구현 예정 계약이다. 아직 제공하지 않는 기능에 성공을 가장하는 엔드포인트를 만들지 않는다. 관리자 경로는 모두 인증·소유권, 변경은 revision과 동일 출처 검사 대상이다. 비동기 요청의 `id`는 중복 실행 방지용 UUID다.

[AI 하네스](ai-harness.md)의 서버 모듈·제공사 어댑터와 오프라인 검사는 준비되어 있다. W1·W4와 W5 글 채팅·공개 버전 확인은 병합됐고 W5 관람 음성·미디어는 로컬 구현·검증을 마치고 CI 대기 중이다. 내부 camelCase 타입은 아래 업무 필드와 HTTP 연결 시 매핑하며, 인증·현재 공개 DB gate·세션·작업 멱등성·예산을 통과한 서버에서만 호출한다. 범용 프롬프트/임의 텍스트 프록시로 노출하지 않는다.

| OP | 경로와 입력 | 결과·조건 |
| --- | --- | --- |
| 05 | `POST /api/admin/artworks/{id}/delete`, `POST /api/admin/materials/{id}/delete` `{revision,confirmed_impact}` | 논리 삭제·공개 차단·정리 상태; 활성 참조는 OP-13 적용 |
| 06 | `POST /api/admin/uploads` `{id,subject_type,subject_id,kind,size,mime}`; `POST /api/admin/uploads/{id}/complete` `{file_id}` | 범위 제한 업로드 권한 → 소유권·파일 검증 후 자료 ID·상태. 이미지 3MB, PDF 6MB |
| 07 | `GET/POST /api/admin/materials`; `GET/PATCH /api/admin/materials/{id}`; `POST /api/admin/evidence` | 소유 범위의 원본·출처·발췌·쪽수·대상과 문서/section/revision 관리. 변경은 버전 검사 |
| 08 | `GET /api/admin/artworks/{id}/review` | 초안·근거·승인·음성·공개 버전·차단 사유 |
| 09 | `POST /api/admin/artworks/{id}/generations` | 위 W1 계약을 따름. 기존 편집본 자동 덮어쓰기 금지 |
| 10 | `POST /api/admin/artworks/{id}/approvals` | 위 W4 근거·해설 분리 승인 계약 |
| 11 | `POST /api/admin/artworks/{id}/audio` `{requestId,approvalId,expectedRevision}` | 개발 중: 승인 글만 합성; 공통 작업 조회·재시도와 글 해시·음성 설정 버전 반환 |
| 12 | `POST /api/admin/exhibitions/{id}/publication` | 위 W4 선택 작품·소개 핀 및 게시/중지/재개 계약 |
| 13 | `GET /api/admin/evidence/{id}/impact?version=...`; `POST /api/admin/evidence/{id}/revoke` `{version,revision,confirmed_impact}` | 소유 전시 전체 영향 조회 후 공개 차단·철회·정리 상태 |
| 14 | `GET /api/admin/exhibitions/{id}/labels` | 현재 공개 전시·작품만 안정 URL·번호·제목 반환 |
| 15 | `POST /api/public/exhibitions/{id}/versions/check` `{publications:[{artworkId,publicationId,version}]}` | 최대 100개 참조의 `current`를 단일 DB 조회로 반환. 미공개·철회·없는 참조는 false |
| 16 | `POST /api/transcribe` multipart `exhibition_id,session_id,id,file` | 인식문·상태 반환; 사용자가 수정 후 별도 전송, 원음 장기 저장 없음 |
| 17 | `POST /api/chat` `{requestId,exhibitionId,artworkId,question,artworkNumber?,intent?,contextSequence,inputMode,outputMode}` | 아래 W5 계약. 세션은 서버 쿠키이며 body의 sessionId·recentContext·conversationId는 받지 않음 |
| 18 | `POST /api/speech` `{requestId,answerId}` | 같은 세션의 저장된 답변을 현재 공개 상태 확인 후 MP3로 반환. 임의 텍스트 불허 |
| 19 | `GET /api/media/{id}?kind=image\|audio` | 현재 공개 publication의 이미지/기본 해설 음성 바이트, `no-store`; 원본 PDF 제외 |
| 20 | `GET /api/jobs/{id}`; `POST /api/jobs/{id}/retry` `{id,revision}` | 소유자 또는 소유 세션 확인 후 상태·재시도 가능 여부·대기 시간; 중복 실행 방지 |
| 22 | `GET /api/admin/exhibitions/{id}/knowledge`; `POST /api/admin/exhibitions/{id}/evidence/apply` `{document_id,section_id,revision,artwork_id?}` | 작가 검수용 근거·출처·변경 여부; 다른 소유자/전시 작품 거부, 적용은 승인 아님 |

입력·출력 모드는 각각 `text`/`voice`이고 서로 독립적이다. 정보 탐색만으로 선택 작품을 바꾸지 않으며 선택 해제 후 이전 대상을 암묵적으로 재사용하지 않는다. 답변·음성은 요청 당시 작품과 공개 버전에 연결하고 재생·새 질문 전 공개 상태를 재검사한다. 상세는 [통합 채팅 계약](chat-interaction.md)을 따른다.

# W5 글 관람·보완 요청 계약

`src/lib/contracts/visitor.ts`가 요청·응답의 원천이다.

| 경로 | 현재 동작 |
| --- | --- |
| `POST /api/chat` | 500자 질문, null 허용 `artworkId`, 선택적 1~9999 `artworkNumber`·`intent`, 요청 당시 `contextSequence`와 독립 입력·출력 모드. 숫자만 보낸 `18`은 승인 해설을 반환 |
| `GET /api/admin/exhibitions/{id}/gaps` | 소유 전시의 미만료 보완 질문·작품·공개본·횟수·상태 목록 |
| `POST /api/admin/gaps/{id}/dismiss` | 빈 JSON으로 소유 보완 요청을 닫음. 타인 항목은 404 |
| `POST /api/public/exhibitions/{id}/versions/check` | 공개본 참조별 현재 사용 가능 여부. 공개 중지 후 false |
| `POST /api/cron/purge` | 최소 32자 서버 `CRON_SECRET`의 Bearer 인증 후 만료 답변·보완 질문·작업을 물리 삭제. 삭제 건수만 반환 |

성공 봉투의 `data`는 `answerId,requestId,contextSequence,inputMode,outputMode,answer,citations,outcome,publication,source,mock`를 갖는다. `publication`은 null 또는 `{exhibitionId,artworkId,publicationId,version}`다. `source`는 `approved_narration/generated/fixed`다. 승인 해설은 모델 없이 원문을 반환한다. 저장된 답변도 현재 공개 상태를 다시 확인한다. 내부 steps·promptVersion·사용량·ownerId·질문 원문은 답변에 포함하지 않는다. `outputMode=voice`는 출력 선호를 보존하는 값이며 이 단계에서 음성을 생성하거나 재생하지 않는다.

세션은 서버가 발급하는 256비트 난수 `yeobek_visitor` 쿠키(HttpOnly/Strict, 운영 Secure, `/api` 경로, 하루 유효)이며 DB에는 SHA-256 해시만 저장한다. body의 세션·소유자 식별자를 신뢰하지 않는다. 탭의 표시 순서는 `contextSequence`로 구분하며 대화 이력을 모델에 전달하지 않는다. 쿠키 재설정으로 세션 한도를 초기화할 수 있으므로 전시 전체 일일 상한도 함께 적용한다.

`app_policies` 기본값은 세션 전체 분당 6회·전시 UTC 일일 1,000회·답변 1시간이다. 요청 ID와 정규화 입력 해시가 같으면 보존 중인 결과를 재사용하며 모델을 재호출하지 않는다. 진행 중은 409 `REQUEST_IN_PROGRESS`(재시도 가능, Retry-After 2초), 입력 변경은 409 `REQUEST_ID_CONFLICT`, 초과는 429 `VISITOR_REQUEST_LIMIT`, 만료 원장은 410 `ANSWER_EXPIRED`다. 120초 lease가 끝난 작업은 실패 상태가 된다. 실패 재실행에는 새 요청 ID가 필요하다. 만료 원장을 물리 삭제한 이후에는 같은 ID도 새 요청으로 취급하므로 프런트는 새 질문마다 새 UUID를 만든다.

`insufficient_evidence`로 검증·저장된 답변에만 질문 최대 500자를 보완 요청으로 남긴다. 같은 공개본·정규화 질문은 횟수로 합치고 동일 요청의 재전송은 횟수를 늘리지 않는다. 30일 보존하며 재게시하면 기존 open 항목은 answered로 바뀐다(실제로 답변 품질이 개선됐다는 판정은 아님). `FEATURE_GAPS=false`이면 관리 경로 404, 기록 생략, 응답의 `gapRecorded/notice` 생략이다. 켜져 있을 때 실제 저장에 성공한 경우만 `gapRecorded=true`와 고정 안내가 나온다. 기록 장애는 정상 답변을 막지 않고 재전송 시 기록을 재시도한다.

보완 요청 RPC는 서비스 역할만 호출하며 HTTP에서 `getUser()`로 확인한 소유자를 전달한다. 운영 스케줄러는 매시간 `/api/cron/purge`를 호출하도록 배포 환경에서 설정해야 한다. 접근 TTL은 DB에서 즉시 적용되지만 물리 삭제는 스케줄 실행 시점이므로 운영 시 최대 한 주기 차이가 난다. 현재 로컬 검사 외 스케줄러 배포는 하지 않았다.

# 남은 설계 확인

실행 경로의 요청·응답 원천은 `src/lib/contracts/`이며 `routes.ts`가 각 스키마를 연결한다. 기존 `api/schemas.ts`와 `ai/contracts.ts`의 HTTP 관련 export는 호환 재수출한다. `src/lib/client`의 `requestApi`는 동일 출처 fetch·응답 봉투 검증·구조화 오류를 제공하며 로그인·로그아웃·프로필·전시 목록에서 사용한다. JSON Schema 스냅샷은 요청 변환 전 입력과 응답 출력을 구분하고 미등록 실행 경로를 검사한다. 목록 조회의 query도 같은 계약에서 검증하고 클라이언트가 인코딩한다. 작가 음성 작업은 병합됐으며 관람 음성·미디어 경로는 로컬 검증을 마치고 CI 대기 중이다. [백엔드 작업 추적](backend-completion.md).

후속 자료·근거·작업의 세부 스키마, 목록 페이지네이션, 후속 생성 중복 정책은 구현 시 검토한다. 관람 세션과 보존 기간은 아래 W5 계약을 따른다. 제한 값은 설계 제안이며 실제 제공사·환경 검증 결과가 아니다. 서버와 DB 오류 매핑, 동시 수정·타인 접근·공개 중지 후 접근을 실제 구현에서 검증해야 한다.

# AI HTTP 계약과 후속 음성 조건

[PR2 검토](../reviews/ai-harness-fix-review.md)의 구조화 `intent` (`narration`·`question`)와 `artworkNumber` (1~9999)는 공개 HTTP에도 같은 camelCase 이름으로 구현했다. 질문은 필수다. 해설 버튼은 `narration`과 `artworkId`, 숫자 입력은 `narration`과 번호를 보낸다. 명시적 question은 Q&A이며 구조화 번호와 명백한 텍스트 번호가 충돌하면 확인한다.

승인 해설은 2,000 Unicode 코드 포인트까지 원문 그대로, 관람 생성 답은 600, 작가 해설 후보는 2,000까지 다루며 `overTarget`이 600자 초과 여부를 나타낸다. 낭독은 신뢰할 수 있게 저장한 답변의 출처·outcome·인용과 현재 공개 문맥을 검사하고 승인 해설이면 글·인용·publication 버전까지 비교해야 한다. W5 `api_requests.result`는 검증된 답변·인용·출처·공개 버전을 저장하며 낭독용 저장소 포트도 이를 읽는다. 관람 음성 HTTP는 로컬 검증을 마치고 CI 대기 중이다. 음성 전송 상한은 2,000 코드 포인트다. 게시 근거 검증은 위 W4 계약으로 구현·검증 중이다.


# W3 자료 경로

| 경로 | 요청·응답 |
| --- | --- |
| `POST /api/admin/uploads` | `{id,subjectType,subjectId,kind,filename,contentType,byteSize}` → `{material,upload}`. 최초 201, 같은 입력 재요청 200. subjectType은 artist/exhibition/artwork |
| `POST /api/admin/uploads/{id}/complete` | `{expectedVersion}` → 검증 후 material. 동일 완료 재요청 200 |
| `GET /api/admin/materials?subjectType=…&subjectId=…` | 소유 범위의 삭제되지 않은 material 배열. 원시 파일 키 제외 |
| `GET /api/admin/materials/{id}` | ready 자료의 `{material,download:{url,expiresAt}}`. 소유자만 60초 다운로드 URL 발급 |
| `DELETE /api/admin/materials/{id}` | `{expectedVersion}` → revoked material. 활성 공개본·승인 근거·살아 있는 문서 참조가 있으면 거부 |
| `POST /api/admin/artworks/{id}/image` | `{expectedRevision,materialId:UUID 또는 null}` → 작품. 같은 작품의 ready 이미지만 지정 |
| `POST /api/admin/artworks/{id}/delete` | `{expectedRevision}` → `{id,revision,deletedAt}`. 활성 공개본은 중지 중이어도 삭제 차단. 삭제 번호는 재사용 가능 |

`upload`는 `{signedUrl,token,path,bucket,expiresAt}`이며 ready 재요청은 null이다. 프런트는 해당 staging 경로에 서명 업로드한 뒤 complete를 호출한다. `expiresAt`는 앱에서 완료 가능한 시각(초기 1시간)이며 Storage 토큰의 만료와 같지 않다. JPEG·PNG·WebP(3MiB), 비암호화 PDF(6MiB)를 지원하며 MIME·확장자·실제 바이트를 검사한다. 상한과 일일 예약 100회는 app_policies로 바꾼다. 재요청은 기존 예약 입력을 유지하며 한도를 중복 소비하지 않는다.

material은 ID·주체·종류·상태·파일명·MIME·크기·버전·페이지 수·이미지 치수·생성/수정/삭제 시각·cleanupPending을 포함한다. `cleanupPending=true`는 ready 자료의 임시 파일 또는 삭제 자료의 실제 파일 정리가 남았다는 뜻이다. ready는 게시 승인을 뜻하지 않는다. 파일의 신규 버전은 새 업로드 ID로 만들며 기존 final 객체를 덮어쓰지 않는다.

오류: 400 `INVALID_FILE`/`INVALID_INPUT`, 409 `UPLOAD_INCOMPLETE`/`UPLOAD_CONTENT_CONFLICT`/`MATERIAL_IN_USE`/`ACTIVE_PUBLICATION`, 410 `UPLOAD_EXPIRED`, 429 `AUTHOR_UPLOAD_LIMIT`, 503 `STORAGE_UNAVAILABLE`. 버전·요청 ID 충돌은 공통 오류를 따른다. 삭제 응답 손실 시 원래 expectedVersion/revision으로 재요청 가능하다. 개인 다운로드 URL은 짧은 시간 유효한 접근권이므로 로그·공개 채팅에 넣지 않는다. 공개 이미지·음성은 W5의 별도 현재 공개 검사 경로에서 제공한다.

# W4 작가 음성 작업 (로컬 검증)

인증·동일 출처를 확인한 `POST /api/admin/artworks/{id}/audio`는 `{requestId,approvalId,expectedRevision}`을 받아 승인된 정확한 해설을 사용한다. 공통 `GET /api/admin/jobs/{id}`와 `POST /api/admin/jobs/{id}/retry`의 `{requestId,expectedAttempt}`로 음성 작업을 조회·재시도한다. 응답은 `kind: audio`, 상태·attempt와 성공 시 `assetId`, `approvalId`, `textHash`, `voiceConfigVersion`, `mock`을 포함한다. Storage key나 음성 바이트를 반환하지 않는다.

서버는 승인과 현재 근거·설정을 합성 전후 재확인하고 MP3 헤더·MIME·최대 8 MiB를 검사해 비공개 `artist-audio`에 저장한다. 제공사·모델·목소리·형식·모의 여부의 SHA-256 지문이 기존 설정 버전과 다르면 거부하므로 변경 시 DB 정책 `voice_config_version`을 올린다. 정리 cron은 실패·철회 등의 정리 대상 음성 객체도 처리한다. 음성이 선택 사항이고 설정이 없으면 글 전용 게시가 가능하다. 실환경 재개는 `resume_with_audio_mode`에서 모의 음성 사용을 차단한다.

로컬 모의 합성 HTTP와 실제 Storage의 저장·권한·정리를 검증했다. 전체 MP3 디코딩·실제 AI 호출과 음질 검증은 수행하지 않았다. 관람객 음성 인식·낭독·공개 미디어는 로컬 검증을 마치고 CI 대기 중이며 프런트엔드는 후속이다.

정리 cron은 기존 결과에 `materials:{attempted,completed}`와 `audio:{attempted,completed}`를 추가한다. 작업 실패는 정리 표시를 유지하고 다음 실행에서 재시도한다. 기존 60초 다운로드 URL과 이미 전송된 바이트를 즉시 회수할 수는 없다. DB 전진 적용 후 서버를 배포하며, 이전 앱으로 되돌려도 새 비공개 버킷·논리 삭제·정리 표시는 유지한다. DB를 되돌리거나 공유 migration을 지우지 않는다.

# W5 공개 미디어 (로컬 검증)

`GET /api/media/{id}?kind=image|audio`에서 id는 현재 공개본 UUID다. 공개 전시·작품의 `image`/`audio`는 `{id,kind}` 또는 null이며 키나 서명 URL을 포함하지 않는다. 기존 클라이언트 호환을 위해 스키마에서는 추가 필드를 optional로 둔다. 이미지 최대 기술 상한은 50MiB(현재 업로드 정책 3MiB), 기본 해설 음성은 8MiB다. 현재 공개본·철회·모의 출처를 검사한 뒤 검증 바이트를 반환하기 직전에 다시 확인한다. 공개가 끝나면 404다. 이미 전송한 바이트는 회수할 수 없다.

성공 응답만 해당 MIME의 바이너리이며 `requestApi("getMedia", {params:{id},query:{kind}})`는 Blob을 반환한다. 오류는 기존 JSON 오류 봉투다. no-store·nosniff·X-Request-Id를 유지하며 자동 리디렉션이나 public signed URL은 사용하지 않는다. 미디어 참조 조회가 실패하면 기존 공개 글 조회는 유지하고 image/audio를 null로 반환한다.

# W5 관람 전사와 낭독 (로컬 검증)

`POST /api/transcribe`는 동일 출처 multipart `{requestId,exhibitionId,file}`을 받아 `{requestId,transcript,mock,overLimit}`을 반환한다. 제공사 응답 안전 상한 4,000자 안의 인식문은 그대로 돌려주고 질문 상한 500자를 넘으면 `overLimit=true`로 편집을 안내한다. 수정 후 별도로 채팅에 보내야 하며 500자 초과 질문 제출은 거부한다. 임의 절단·자동 전송은 하지 않는다. 서버는 실제 수신량과 녹음 파일 최대 3 MiB, 확장자·MIME·헤더를 검사하지만 재생 시간이나 코덱을 디코딩해 확인하지 않는다. 30초 녹음 중지는 브라우저에서 구현해야 한다.

`POST /api/speech`는 JSON `{requestId,answerId}`만 받는다. 서버 세션이 소유한 만료 전 답변과 현재 공개 상태를 확인한 후 최대 8 MiB `audio/mpeg` 바이트를 반환한다. 승인 해설의 준비된 음성은 TTS 설정 없이 재사용할 수 있고 생성 답변 음성은 답변·음성 설정 지문에 묶어 비공개 저장한다. 동일 요청 재전송은 제공사를 다시 호출하지 않는다. 채팅·인식·합성은 공통 관람 한도에 포함된다. 만료된 관람 음성 객체는 비공개 Storage에 별도 정리 기록을 두고 만료/lease 이후 3분 유예 후 cron으로 삭제한다.

작품 미선택·번호 확인 안내도 저장된 고정 문구만 낭독할 수 있다. 작품 공개본이 없는 경우에는 같은 세션·답변 만료·전시 공개 상태를 검사한다. 임의 텍스트의 음성 프록시로 사용할 수 없다. 준비된 승인 음성 재생은 새 작업 원장을 만들거나 한도를 차감하지 않는다. 생성 음성의 새 요청 ID도 동일 답변·설정의 유효한 캐시를 재사용하며, 이미 사용한 요청 ID를 다른 입력에 재사용하면 409다. 승인 음성의 단순 읽기에는 이 요청 ID 충돌 검사가 적용되지 않는다.

타입 클라이언트는 전사 multipart와 낭독·미디어 Blob을 지원한다. 음성 바이너리의 `X-Yeobek-Mock`과 전사 응답의 `mock`은 모의 출처를 나타낸다. 전사 인식문은 수정·재시도를 위해 답변 보존 기간 동안만 서버에 저장하며 녹음 바이트는 저장하지 않는다. MP4 오디오 녹음의 서버 전달 파일명은 파트너 전사 어댑터에 맞춰 `recording.m4a`로 정규화한다. 정리 cron에는 `visitorAudio:{attempted,completed}`가 추가된다. 로컬 검사 근거는 [백엔드 작업 추적](backend-completion.md)에 기록한다. CI와 실제 제공사 호출, 한국어 음질 및 프런트 연결은 남아 있다.

음성 두 경로의 60초 처리 기한에는 요청 본문 수신도 포함한다. Next.js `maxDuration=120`은 취소 후 DB 실패 확정·정리 기록을 위한 플랫폼 여유이며 생성 허용 시간을 늘리지 않는다. 같은 세션의 만료 답변은 공개 상태가 유지될 때 410 `ANSWER_EXPIRED`, 타인 세션이나 비공개 전시는 404다. 준비된 승인 음성의 파일 오류·해시 불일치는 오류로 반환하고 새 유료 합성을 시작하지 않는다. 확인된 실패는 새 요청 ID로 재시도하고, 진행 중/응답 유실/캐시 다운로드 오류에는 같은 ID를 재사용한다.

새 ID의 생성 음성 캐시 재사용은 생성 한도를 차감하지 않지만 원장 행이 무한히 늘지 않도록 세션당 분당 60개 초기 정책 `visitor_audio_cache_requests_per_minute`를 별도로 적용한다. 기존 요청 ID 조회는 이 한도에서도 재사용 가능하다. 60은 측정 전 구현 초기값이며 DB 정책에서 변경한다.

# W8 수신 동의·운영자 검토와 내부 DB 계약

`090000` migration의 `get_contact_consents`·`set_contact_consent(category,granted,expectedRevision)`은 인증된 작가 본인만 다루며, 거래성·홍보성 동의는 각각 기본 false·revision 0이다. `list_outbox`·`decide_outbox(id,expectedRevision,approve)`는 등록된 운영자만 실행한다. 일반 로그인 계정은 404에 해당하는 DB 오류를 받는다. 본문 수정은 승인 API에 포함하지 않으며 승인할 때 정확한 revision을 검사한다.

서비스 역할만 `enqueue_automation_event`·`claim_automation_events`·`complete_automation_event`와 발송 claim/check/complete RPC를 실행할 수 있다. 동일 종류·중복 키의 다른 입력과 다른 완료 결과는 충돌이다. `check_outbound_dispatch`는 현재 정책·동의·계정 연결·만료를 다시 확인하고 한 번만 수신 대상과 본문을 반환한다. `accepted`는 제공사 접수, `unknown`은 결과 불명이며 자동 재전송하지 않는다. 이벤트/발송 lease·최대 시도·만료는 `app_policies`에서 읽는다.

작가·운영자 HTTP는 다음과 같이 연결했다. 모두 기존 `{data,requestId}` 봉투와 `no-store`를 쓰고, 변경 요청은 동일 출처를 요구한다. 타입 클라이언트 경로도 같은 계약에서 파생된다.

| 경로 | 입력 | 반환·거부 |
| --- | --- | --- |
| `GET /api/admin/profile/consents` | 로그인 | 두 종류의 `{category,granted,revision,updatedAt}` 배열 |
| `PATCH /api/admin/profile/consents` | `{category,granted,expectedRevision}` | 본인 동의만 변경. 최초 revision 0, 충돌 409 |
| `GET /api/ops/outbox` | 선택 쿼리 `cursor`, `state` | `{items,nextCursor}`. 기본 draft, 페이지 50개. `state=all` 또는 개별 상태로 이력 조회 |
| `POST /api/ops/outbox/{id}/approve` | `{expectedRevision}` | 해당 revision의 초안만 승인. 만료·삭제된 전시는 409 `OUTBOX_UNAVAILABLE` |
| `POST /api/ops/outbox/{id}/reject` | `{expectedRevision}` | 해당 revision의 초안 거절. 만료된 초안도 정리 가능 |

기본 발송함은 만료·삭제된 전시의 초안을 제외하고, 완료된 발송량과 무관하게 오래된 초안을 커서로 조회한다. 이력은 상태 필터로 명시 조회한다. 승인 요청에 본문·주소를 추가할 수 없으며 응답에는 수신 주소·계정 연결·내부 단계 기록을 넣지 않는다. 운영자 외 계정은 404다. 로컬 운영자 지정은 `npm run db:operator -- <기존 로컬 사용자 UUID>`, 해제는 같은 명령에 `--disable`을 붙인다. 이 명령은 로컬 스택·비익명 사용자만 허용한다.

`091000`은 서비스 전용 `reserve_automation_job`·`complete_automation_job`으로 이벤트와 `ai_jobs`·시도별 사용량/단계를 연결한다. 이벤트당 하나의 원장, 일일 자동화 한도, 시도/lease 검사, 완료와 발송함의 원자적 저장을 적용한다. 작가용 작업 조회에는 운영 작업을 노출하지 않는다. `092000`은 발송 예약 및 본문 전달 직전에 전시 삭제도 재검사한다. 검사 이후 이미 외부로 전송된 내용의 회수를 보장하지 않는다.

전시 생성·해설 초안 완료·게시의 상태 신호와 안내 cron은 아래 범위로 연결했다. 승인 독촉·전시 종료의 예약 안내, 다른 자동화 플레이북·웹훅 HTTP와 문의의 실제 chat 대상 고정은 후속이다. 서비스 역할이 임의 모델 출력을 수신 대상으로 사용해서는 안 된다.

# W8 진행 안내 실행

`POST /api/cron/automation`은 `Authorization: Bearer <CRON_SECRET>`을 요구하며 요청 본문으로 실행 대상이나 수신자를 받지 않는다. 인증 실패는 404, 서버 비밀값 미설정은 503이다. 기존 봉투 안에 `{mock,busy,dispatchReady,scheduled,discarded,processed,suppressed,escalated,failed,persistenceFailures,dispatch}` 집계를 반환하며 `dispatch`는 `{claimed,accepted,rejected,unknown,failed,skipped,persistenceFailures}`다. `accepted`는 제공사 접수이며 전달 완료가 아니다. 응답에 원문·주소·작업 단계는 넣지 않는다.

`busy=true`이면 같은 실제/모의 모드의 다른 실행이 작업 중이다. 실행 lease는 120초, HTTP 업무 기한은 60초, 개별 DB 호출은 5초로 제한한다. 기본 배치는 신호 50개·AI 이벤트 3개·발송 5개이며 `app_policies`에서 바꾼다. 불확실한 발송 기록 저장 오류가 있으면 lease를 즉시 해제하지 않고 만료를 기다린다. 발송은 한 건씩 예약하며 수신 동의와 최신 정책·현재 대상·두 lease를 검사한다. 이전 전송 완료 이후 최소 334ms 간격을 모드별 DB에 남긴다. `dispatchReady=false`는 스티비 설정 부족 또는 발송 단계에 도달하지 못한 경우다. 설정이 부족하면 승인 메시지는 남겨 둔다.

상태 신호는 원래 변경 트랜잭션에서 저장되며, 실제/모의가 정해진 AI·게시 신호는 그 모드에서만 처리한다. 전시 생성처럼 모드 없는 신호는 신뢰된 cron이 처음 가져갈 때 고정한다. 기존 자료에 대한 소급 일괄 안내는 하지 않는다. 만료 신호는 같은 보존 정책으로 제한된 배치에서 정리한다.

`ops-notify`는 상태와 작품 집계만 모델에 전달하고 구조화 출력·인용·형식·현재 상태를 검사한다. 제목·작가 원자료·관람 질문·주소를 입력하지 않는다. 상태가 변경되면 안내를 중단하고, 발송 직전에도 대상 상태를 확인한다. 기본은 draft이고 운영자가 검토한다. 인용 ID 검사가 문장의 모든 의미적 적합성을 증명하는 것은 아니며 실제 품질은 키 입력 후 평가한다.

발송 검사에서 null 허가를 받으면 현재 배치를 종료한다. 발송 간격 때문에 approved로 반환된 메시지를 같은 배치에서 다시 예약하지 않으며 다음 cron에서 처리한다. 이 경우 `dispatch.skipped`가 증가하고, null 허가 뒤의 다른 대기 메시지도 다음 실행으로 넘어간다.

# W8 채널톡 토큰 내부 계약

`claim_channel_token(app_id,channel_id,claim)`와 `complete_channel_token(app_id,channel_id,claim,sealed,expires_in)`은 service-role 전용 RPC다. 브라우저용 HTTP 경로와 타입 클라이언트에는 추가하지 않는다. 예약 결과는 `cached`(암호문), `refresh`(기존 암호문 또는 null), `busy`, `limited` 중 하나다. 앱별 잠금으로 채널 전체의 발급/갱신 예약을 30분에 10회까지 제한하고, 채널 lease는 30초다. 예약 재사용 방지도 같은 30분 창이며 캐시 재사용은 예약을 소비하지 않는다.

완료는 현재 lease의 소유자만 할 수 있고, 토큰 만료는 발급 전 예약 시각을 기준으로 계산한다. 지연·교체·만료된 완료는 false다. 서버는 암호문을 앱·채널 범위로 검증하고 저장이 확인되기 전에는 토큰을 발신 어댑터에 넘기지 않는다. `CHANNEL_TALK_APP_ID`, `CHANNEL_TALK_CHANNEL_ID`, `CHANNEL_TALK_APP_SECRET`, `CHANNEL_TALK_TOKEN_KEY`는 서버 전용이다. TOKEN_KEY는 32바이트 키의 64자리 hex다. `CHANNEL_TALK_SIGNING_KEY`는 수신 서명용으로 발신 토큰과 별개이며 웹훅 연결은 후속이다.
