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

- JSON 성공 응답은 `{ "data": ..., "requestId": "UUID" }`, 오류는 `{ "error": { "code": "...", "message": "...", "fields": {} }, "requestId": "UUID" }`다. `fields`는 선택 사항이며 비밀·내부 오류를 노출하지 않는다. 미디어 바이트는 예외다.
- 리소스 ID와 생성 요청 ID는 UUID다. 생성 요청은 클라이언트가 안정적인 `id`를 생성해 재시도하며, 같은 소유자·ID·동일 입력은 기존 결과를 반환하고 다른 입력이면 409다. `requestId`는 추적용이고 리소스 ID와 구별한다. `POST` 생성 성공은 201, 동일 재시도는 200, 조회·변경은 200이다.
- 오류는 400 `INVALID_INPUT`, 401 `UNAUTHENTICATED`, 404 `NOT_FOUND`, 409 `CONFLICT` 또는 `REVISION_CONFLICT`, 413 `TOO_LARGE`, 429 `RATE_LIMITED`, 500 `INTERNAL_ERROR`를 사용한다. 소유하지 않거나 비공개인 리소스는 존재를 드러내지 않는 404다. 로그인 실패는 일반적인 자격 오류다.
- 관리자 요청은 `@supabase/ssr` 쿠키 세션을 사용하고 서버에서 `getUser` 또는 검증된 `getClaims`로 사용자를 확인한다. 모든 관리자 조회·변경에 소유권과 RLS를 적용한다. 클라이언트의 owner, 승인 상태, 공개 상태를 신뢰하지 않는다. 변경 요청은 same-origin을 검사한다. 로그아웃은 세션과 클라이언트 관리자 캐시를 지운다.
- PATCH는 `expectedRevision`을 요구하며 정형 필드와 문서를 함께 바꾸면 `expectedDocumentRevision`도 요구한다. DB에서 두 버전을 원자적으로 확인·저장하고 충돌 시 409로 재조회하게 한다. 초안 변경은 기존 공개 스냅샷을 바꾸지 않는다. 목록은 소유 또는 공개 범위를 서버에서 제한하고 안정적인 순서로 반환한다.
- 입력은 서버에서 타입·길이·관계·UUID를 검사한다. 요청 크기와 횟수 제한을 적용한다. 생성·인식·합성은 세션당 분 6회와 전시 일일 상한을 원자적으로 적용하는 제안이며, 녹음 30초/3MB, 질문 500자 등 상세 값은 [초기 상한](technology-stack.md#초기-상한과-실패-처리)을 따른다. 실제 한도와 오류 정책은 구현 시 검증한다.

# 초기 기반 경로

JSON 요청 상한은 64KiB이며 실제 수신 바이트도 제한한다. 출처는 최대 24개, section은 주체별 최대 2개다. 변경 요청에는 동일 출처의 Origin과 application/json이 필요하다. 403 `FORBIDDEN`, 415 `UNSUPPORTED_MEDIA_TYPE`, 503 `SERVICE_UNAVAILABLE`도 반환한다. 인증 서비스 장애를 로그인 실패 401과 구분한다. 아직 별도 관람 API 호출량 제한기는 구현하지 않았으며 로그인 요청 제한은 Supabase Auth 정책을 적용한다. 프로필은 사전 발급 계정의 첫 인증 조회에서 문서와 함께 지연 생성한다.

아래 필드는 계약 초안이며 `?`는 선택, `document`는 `{id, subjectType, subjectId, revision, sections, sourceRefs, updatedAt}`이다. HTTP 필드는 camelCase이고 DB의 snake_case와 서버에서 변환한다. `sections`는 `{id,body}` 배열이며 ID는 문서 내 안정적이다: 작가 `bio`/`practice`, 전시 `introduction`/`theme`, 작품 `description`/`notes`. `sourceRefs`는 최초 폼 저장에서 빈 배열이며 직접 입력·자료·문서 출처를 해당 소유 범위에서 검증한다. 생성·수정의 `sections`, `sourceRefs`는 내부 문서 원본이며 정형 필드와 트랜잭션으로 저장한다. 프로필은 사전 생성된 계정당 하나다.

| OP | 경로 | 입력 → `data` |
| --- | --- | --- |
| 01 | `POST /api/auth/login` | `{email,password}` → 인증 상태; 쿠키 설정 |
| 01 | `POST /api/auth/logout` | 빈 객체 → 로그아웃 상태 |
| 21 | `GET /api/admin/profile` | 자기 프로필 → `{id,displayName,revision,document}` |
| 21 | `PATCH /api/admin/profile` | `{expectedRevision,expectedDocumentRevision,displayName,sections,sourceRefs}` → 저장된 프로필·문서 |
| 02 | `GET /api/admin/exhibitions` | 자기 전시 목록 → `{items:[...]}` |
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
| 운영 | `GET /api/health` | 서비스 생존 여부 → `{status:"ok"}`; 자격 증명·내부 정보 없음 |

관람 조회는 전시와 작품의 현재 공개 게이트 및 활성 publication을 확인하고 원시 DB, 내부 위키, 비공개 PDF나 Storage URL을 반환하지 않는다. 게시 기능이 준비되기 전에는 공개할 활성 묶음이 없어 404가 정상이다. 공개 응답은 `Cache-Control: no-store`로 중지 이후 새 요청을 차단한다.

# 후속 경로

다음은 구현 예정 계약이다. 아직 제공하지 않는 기능에 성공을 가장하는 엔드포인트를 만들지 않는다. 관리자 경로는 모두 인증·소유권, 변경은 revision과 동일 출처 검사 대상이다. 비동기 요청의 `id`는 중복 실행 방지용 UUID다.

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
| 17 | `POST /api/chat` `{id,exhibition_id,session_id,conversation_id,question,artwork_id?,number?,context_sequence,input_mode,output_mode,recent_context}` | `message_id,reply_to,resolved_artwork_id,publication_id,answer,citations,outcome`; 공개 재검사 후 승인 근거만 사용 |
| 18 | `POST /api/speech` `{id,session_id,answer_id? ,narration_id?}` | 둘 중 하나만 허용; 같은 세션의 서버 답변 또는 활성 공개 해설의 글 해시·음성 상태·미디어 참조. 임의 텍스트 불허 |
| 19 | `GET /api/media/{id}` | 현재 공개 버전과 필요한 세션 검사 후 이미지/음성 바이트, `no-store`; 원본 PDF 제외 |
| 20 | `GET /api/jobs/{id}`; `POST /api/jobs/{id}/retry` `{id,revision}` | 소유자 또는 소유 세션 확인 후 상태·재시도 가능 여부·대기 시간; 중복 실행 방지 |
| 22 | `GET /api/admin/exhibitions/{id}/knowledge`; `POST /api/admin/exhibitions/{id}/evidence/apply` `{document_id,section_id,revision,artwork_id?}` | 작가 검수용 근거·출처·변경 여부; 다른 소유자/전시 작품 거부, 적용은 승인 아님 |

입력·출력 모드는 각각 `text`/`voice`이고 서로 독립적이다. 정보 탐색만으로 선택 작품을 바꾸지 않으며 선택 해제 후 이전 대상을 암묵적으로 재사용하지 않는다. 답변·음성은 요청 당시 작품과 공개 버전에 연결하고 재생·새 질문 전 공개 상태를 재검사한다. 상세는 [통합 채팅 계약](chat-interaction.md)을 따른다.

# 남은 설계 확인

후속 자료·근거·작업의 세부 스키마, 목록 페이지네이션, 생성 중복 요청 보존 기간과 공개 세션 식별 방식은 구현 전에 확정한다. 제한 값은 설계 제안이며 실제 제공사·환경 검증 결과가 아니다. 서버와 DB 오류 매핑, 동시 수정·타인 접근·공개 중지 후 접근을 실제 구현에서 검증해야 한다.
