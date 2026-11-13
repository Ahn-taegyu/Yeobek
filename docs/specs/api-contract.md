---
type: Specification
id: SPEC-011
title: MVP API 계약
description: OP-01~22의 초기 기반 및 후속 HTTP 계약과 접근·버전 경계.
status: draft
updated: '2026-11-13'
tags: [yeobek, api, mvp]
rag_include: true
generated:
  by: codex/gpt-6
  at: '2026-11-13T04:39:38+00:00'
decision_status: proposed
work_status: in_progress
sources:
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

[기능명세 OP-01~22](functional-spec.md#8-api-명세로-넘길-업무-계약)를 HTTP로 구체화한 계약이다. 아래 **초기 기반 경로는 구현했으며 후속 경로는 설계 제안**이다. 검증 범위와 한계는 [개발 기반 현황](development-foundation.md)에 기록한다. [D-011](../decisions/D-011-knowledge-and-screens.md), [내부 지식](artist-knowledge.md), [데이터 모델](data-model.md), [채팅](chat-interaction.md)을 함께 적용한다.

- JSON 성공 응답은 `{ "data": ..., "requestId": "UUID" }`, 오류는 `{ "error": { "code": "...", "message": "...", "retryable": true, "retryAfter": 5, "fields": {} }, "requestId": "UUID" }` 형태다. `retryAfter`(초)와 `fields`는 선택 사항이며, `retryAfter`가 있으면 `Retry-After` 헤더도 반환한다. `retryable`은 429와 5xx에서 true이되 서버 설정 오류는 false다. 오류는 비밀·내부 오류를 노출하지 않는다. 미디어 바이트는 예외다.
- 리소스 ID와 생성 요청 ID는 UUID다. 생성 요청은 클라이언트가 안정적인 `id`를 생성해 재시도하며, 같은 소유자·ID·동일 입력은 기존 결과를 반환하고 다른 입력이면 409다. `requestId`는 추적용이고 리소스 ID와 구별한다. `POST` 생성 성공은 201, 동일 재시도는 200, 조회·변경은 200이다.
- 오류는 400 `INVALID_INPUT`/`SOURCE_UNAVAILABLE`, 401 `UNAUTHENTICATED`/`INVALID_CREDENTIALS`, 404 `NOT_FOUND`, 409 `CONFLICT`/`REVISION_CONFLICT`/`SOURCE_REVISION_CONFLICT`/`DUPLICATE_NUMBER`/`REQUEST_ID_CONFLICT`, 413 `TOO_LARGE`, 429 `RATE_LIMITED`, 500 `INTERNAL_ERROR`를 사용한다. 소유하지 않거나 비공개인 리소스는 존재를 드러내지 않는 404다. 로그인 실패는 일반적인 자격 오류다.
- 관리자 요청은 `@supabase/ssr` 쿠키 세션을 사용하고 서버에서 `getUser` 또는 검증된 `getClaims`로 사용자를 확인한다. 모든 관리자 조회·변경에 소유권과 RLS를 적용한다. 클라이언트의 owner, 승인 상태, 공개 상태를 신뢰하지 않는다. 변경 요청은 same-origin을 검사한다. 로그아웃은 세션과 클라이언트 관리자 캐시를 지운다.
- PATCH는 `expectedRevision`을 요구하며 정형 필드와 문서를 함께 바꾸면 `expectedDocumentRevision`도 요구한다. DB에서 두 버전을 원자적으로 확인·저장하고 충돌 시 409로 재조회하게 한다. 초안 변경은 기존 공개 스냅샷을 바꾸지 않는다. 목록은 소유 또는 공개 범위를 서버에서 제한하고 안정적인 순서로 반환한다.
- 입력은 서버에서 타입·길이·관계·UUID를 검사한다. 요청 크기와 횟수 제한을 적용한다. 생성·인식·합성은 세션당 분 6회와 전시 일일 상한을 원자적으로 적용하는 제안이며, 녹음 30초/3MB, 질문 500자 등 상세 값은 [초기 상한](technology-stack.md#초기-상한과-실패-처리)을 따른다. 실제 한도와 오류 정책은 구현 시 검증한다.

# 초기 기반 경로

JSON 요청 상한은 64KiB이며 실제 수신 바이트도 제한한다. 출처는 최대 24개, section은 주체별 최대 2개다. 변경 요청에는 동일 출처의 Origin과 application/json이 필요하다. 403 `FORBIDDEN`, 415 `UNSUPPORTED_MEDIA_TYPE`, 503 `SERVICE_UNAVAILABLE`도 반환한다. 인증 서비스 장애를 로그인 실패 401과 구분한다. 아직 별도 관람 API 호출량 제한기는 구현하지 않았으며 로그인 요청 제한은 Supabase Auth 정책을 적용한다. 프로필은 첫 `GET /api/admin/profile` 또는 첫 전시 생성에서 빈 문서와 함께 지연 생성한다. 계정 생성·로그인·전시 목록 조회만으로 생성하지 않으며, 프로필이 없는 상태의 프로필 PATCH는 404다.

**현재 정형 정보 PATCH는 전체 편집 값 저장이다.** 프로필은 선택 값 displayName을 받고, 전시는 title, 작품은 number/title을 요구한다. 모두 sections·sourceRefs·expectedRevision·expectedDocumentRevision이 필요하다. displayName, 날짜·장소·작품 메타데이터 같은 선택 필드를 생략하면 null로 바뀐다. 생략한 필드를 기존 값으로 유지하는 부분 수정 계약이 아니다. 문서 단독 PATCH는 sections·sourceRefs·expectedRevision을 요구한다.

문서 sections/sourceRefs가 정규화 후 기존 JSONB와 같으면 문서 revision은 유지하고, 달라지면 증가한다. 정형 정보 revision은 성공 저장마다 증가한다. 본문은 JavaScript `trim()`과 같은 앞뒤 공백을 제거한 뒤 유니코드 코드포인트 5,000개 이하를 검사해 저장한다. 기존 본문과 공백 제거 후 같으면 과거 저장 원문을 유지한다.

기존 초안에 정확히 같은 출처 참조는 개별적으로 보존해 저장을 막지 않는다. 문서 응답의 `sourceWarnings`는 변경된 문서 출처에 `source_changed`와 현재 revision을, 사용할 수 없는 문서·자료 출처에 `source_unavailable`을 표시한다. 문서 경고에는 대상 `sectionId`, `sourceDocumentId`, `sourceSectionId`, `sourceRevision`이 포함된다. 새로 추가하거나 변경한 출처는 소유권·상위 범위·section·현재 revision 또는 자료의 ready 상태를 검증한다. DB P1001은 409 `SOURCE_REVISION_CONFLICT`, P1002는 400 `SOURCE_UNAVAILABLE`이다. material version과 실제 PDF 페이지 수를 고정·확인하는 기능은 아직 없다.

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

관람 조회는 전시와 작품의 현재 공개 게이트 및 활성 publication을 확인하고 원시 DB, 내부 위키, 비공개 PDF나 Storage URL을 반환하지 않는다. 게시 기능이 준비되기 전에는 공개할 활성 묶음이 없어 404가 정상이다. 공개 응답의 `Cache-Control: no-store`는 캐시 저장을 금지하는 지시이며, 중지 이후 새 요청의 데이터 반환을 차단하는 것은 SQL의 현재 공개 조건 검사다.

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

[AI 하네스](ai-harness.md)의 서버 모듈·제공사 어댑터와 오프라인 검사는 준비되어 있다. 아래 AI HTTP 경로는 여전히 미구현이다. 내부 camelCase 타입은 아래 업무 필드와 HTTP 연결 시 매핑하며, 인증·현재 공개 DB gate·세션·작업 멱등성·예산을 통과한 서버에서만 호출한다. 범용 프롬프트/임의 텍스트 프록시로 노출하지 않는다.

| OP | 경로와 입력 | 결과·조건 |
| --- | --- | --- |
| 05 | `POST /api/admin/artworks/{id}/delete`, `POST /api/admin/materials/{id}/delete` `{revision,confirmed_impact}` | 논리 삭제·공개 차단·정리 상태; 활성 참조는 OP-13 적용 |
| 06 | `POST /api/admin/uploads` `{id,subject_type,subject_id,kind,size,mime}`; `POST /api/admin/uploads/{id}/complete` `{file_id}` | 범위 제한 업로드 권한 → 소유권·파일 검증 후 자료 ID·상태. 이미지 3MB, PDF 6MB |
| 07 | `GET/POST /api/admin/materials`; `GET/PATCH /api/admin/materials/{id}`; `POST /api/admin/evidence` | 소유 범위의 원본·출처·발췌·쪽수·대상과 문서/section/revision 관리. 변경은 버전 검사 |
| 08 | `GET /api/admin/artworks/{id}/review` | 초안·근거·승인·음성·공개 버전·차단 사유 |
| 09 | `POST /api/admin/artworks/{id}/generations` `{id,revision,evidence_versions}` | 작업 ID·상태·후보·근거. 기존 편집본 자동 덮어쓰기 금지 |
| 10 | `POST /api/admin/artworks/{id}/approvals` `{kind,version,revision}` | 승인자·시각·정확한 버전. 미승인 인용 및 충돌 거부 |
| 11 | `POST /api/admin/artworks/{id}/audio` `{id,narration_version,revision}` | 작업 상태·글 해시·음성 설정 버전. 승인된 글만 합성 |
| 12 | `POST /api/admin/exhibitions/{id}/publication` `{action,revision,artwork_versions}` | 게시/중지/재개 상태·버전·작품별 차단 사유. 게시 원자성 및 최소 한 작품 검사 |
| 13 | `GET /api/admin/evidence/{id}/impact?version=...`; `POST /api/admin/evidence/{id}/revoke` `{version,revision,confirmed_impact}` | 소유 전시 전체 영향 조회 후 공개 차단·철회·정리 상태 |
| 14 | `GET /api/admin/exhibitions/{id}/labels` | 현재 공개 전시·작품만 안정 URL·번호·제목 반환 |
| 15 | `POST /api/public/exhibitions/{id}/versions/check` `{publication_ids}` | 현재 이용 가능한 공개 버전만 확인; 번호 조회도 해당 전시 공개 범위로 제한 |
| 16 | `POST /api/transcribe` multipart `exhibition_id,session_id,id,file` | 인식문·상태 반환; 사용자가 수정 후 별도 전송, 원음 장기 저장 없음 |
| 17 | `POST /api/chat` `{id,exhibition_id,session_id,conversation_id,question,artwork_id?,number?,intent?,context_sequence,input_mode,output_mode,recent_context}` | `message_id,reply_to,resolved_artwork_id,publication_id,answer,citations,outcome`; 공개 재검사 후 승인 근거만 사용; 선택적 `intent`는 `narration`·`question`, `number`는 1~9999 정수 |
| 18 | `POST /api/speech` `{id,session_id,answer_id? ,narration_id?}` | 둘 중 하나만 허용; 같은 세션의 서버 답변 또는 활성 공개 해설의 글 해시·음성 상태·미디어 참조. 임의 텍스트 불허 |
| 19 | `GET /api/media/{id}` | 현재 공개 버전과 필요한 세션 검사 후 이미지/음성 바이트, `no-store`; 원본 PDF 제외 |
| 20 | `GET /api/jobs/{id}`; `POST /api/jobs/{id}/retry` `{id,revision}` | 소유자 또는 소유 세션 확인 후 상태·재시도 가능 여부·대기 시간; 중복 실행 방지 |
| 22 | `GET /api/admin/exhibitions/{id}/knowledge`; `POST /api/admin/exhibitions/{id}/evidence/apply` `{document_id,section_id,revision,artwork_id?}` | 작가 검수용 근거·출처·변경 여부; 다른 소유자/전시 작품 거부, 적용은 승인 아님 |

입력·출력 모드는 각각 `text`/`voice`이고 서로 독립적이다. 정보 탐색만으로 선택 작품을 바꾸지 않으며 선택 해제 후 이전 대상을 암묵적으로 재사용하지 않는다. 답변·음성은 요청 당시 작품과 공개 버전에 연결하고 재생·새 질문 전 공개 상태를 재검사한다. 상세는 [통합 채팅 계약](chat-interaction.md)을 따른다.

# 남은 설계 확인

후속 자료·근거·작업의 세부 스키마, 목록 페이지네이션, 생성 중복 요청 보존 기간과 공개 세션 식별 방식은 구현 전에 확정한다. 제한 값은 설계 제안이며 실제 제공사·환경 검증 결과가 아니다. 서버와 DB 오류 매핑, 동시 수정·타인 접근·공개 중지 후 접근을 실제 구현에서 검증해야 한다.

# AI HTTP 통합 전 추가 조건

[PR2 검토](../reviews/ai-harness-fix-review.md)의 구조화 `intent` (`narration`·`question`)와 `artworkNumber` (1~9999)는 내부 모듈에 구현되며 공개 HTTP는 미구현이다. 계획된 OP-17 HTTP의 `number`를 내부 `artworkNumber`로, `artwork_id`를 `artworkId`로 매핑한다. 질문은 필수다. 해설 버튼은 `narration`과 `artworkId`, 숫자 입력은 `narration`과 번호를 보낸다. 명시적 question은 Q&A이며 구조화 번호와 명백한 텍스트 번호가 충돌하면 확인한다.

승인 해설은 2,000 Unicode 코드 포인트까지 원문 그대로, 관람 생성 답은 600, 작가 해설 후보는 2,000까지 다루며 `overTarget`이 600자 초과 여부를 나타낸다. 낭독은 신뢰할 수 있게 저장한 답변의 출처·outcome·인용과 현재 공개 문맥을 검사하고 승인 해설이면 글·인용·publication 버전까지 비교해야 한다. 현재 `api_requests`에는 해당 필드가 없어 영속 저장 구현이 선행된다. 음성 전송 상한은 2,000 코드 포인트다. 게시자의 근거 검증과 신규 migration은 [데이터 모델](data-model.md)에 정의하며 아직 미구현이다.
