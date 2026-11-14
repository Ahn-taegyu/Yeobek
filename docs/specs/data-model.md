---
type: Specification
id: SPEC-002
title: 최소 데이터 모델
description: MVP의 논리 데이터·버전 관계와 선정된 최소 저장 구조의 연결.
status: draft
updated: '2026-11-14'
tags:
- mawd
rag_include: true
generated:
  by: codex/gpt-6
  at: '2026-11-12T14:38:57+09:00'
decision_status: proposed
sources:
- id: gap-exclusion
  resource: /references/user-gap-qa-exclusion.md
  title: 관람 보완 요청의 Q&A 전환 제외
- id: qa-policy
  resource: /references/user-expected-qa-policy.md
  title: 예상 Q&A 생성·검수 정책
- id: figma-review
  resource: /references/figma-review-v3.md
  title: Figma W11 화면 직접 대조
- id: signup-contract
  resource: /research/signup-auth-contract.md
  title: W9 이메일 가입과 직접 로그인 경계
- id: figma-authoring
  resource: /references/figma-authoring-v3.md
  title: Figma 작가 입력 화면 직접 대조
- id: status-precedence
  resource: /references/user-dashboard-status-precedence.md
  title: 미공개 전시 준비중 우선
- id: v3-answers
  resource: /references/user-v3-decisions.md
  title: v3 범위와 Vercel Hobby 답변
- id: review-answers
  resource: /references/user-v3-review-decisions.md
  title: 해설 수정·검수 화면·모의 게시 정책
- id: v3
  resource: /references/user-backend-plan-v3.md
  title: 백엔드 v3 화면·리스크 보강
- id: pr2-review
  resource: /references/user-ai-pr2-review.md
  title: AI 하네스 PR2 검토와 수정 요청
- id: knowledge-screens
  resource: /decisions/D-011-knowledge-and-screens.md
  title: AI용 내부 지식·DB 원본과 필수 화면 요구
- id: user
  resource: /references/user-mvp.md
  title: 최신 사용자 MVP 우선순위
- id: notion
  resource: /references/notion-planning.md
  title: 수정 중인 Notion 기획
- id: answers
  resource: /references/user-answers.md
  title: 2026-11-12 사용자 범위·팀·일정 확인
- id: chat
  resource: /references/user-chat-interaction.md
  title: 사용자 통합 채팅·입출력 모드 요구
- id: direction
  resource: /references/user-build-direction.md
  title: 사용자 최신 개발 방향
---

# 엔티티

| 엔티티 | 최소 필드 | 관계/권한 |
| --- | --- | --- |
| Owner | id, 인증 식별자 | 자기 작가 프로필·전시 소유 |
| ArtistProfile | id, owner_id, display_name, revision, document_id | 계정과 별개인 작가 정보; MVP 계정당 1개 제안 |
| KnowledgeDocument | id, owner_id, subject_type/id, revision, sections, source_refs | AI용 내부 문서. 본문은 DB 원본이며 일반 입력 폼에서 관리 |
| Exhibition | id, owner_id, artist_id, title, dates?, place?, document_id, public_snapshot, state | 작가 참조, 소개/주제는 연결 문서, draft/published/paused |
| Artwork | id, exhibition_id, document_id, number, title, image_ref, optional_metadata | 전시+번호 유일, 내부 ID 불변 |
| Material | id, owner_id, subject_type/id, file_ref/text, version, state | 작가 공통/전시/작품 소속 검증; 원본 비공개 |
| Evidence | id, material_id?, source_document/section/revision, exhibition_id, artwork_id?, excerpt, page?, version, visibility, approved_by/at | 작가 공통·전시 공통·작품 원본을 해당 전시에서 승인한 발췌 |
| Narration | id, artwork_id, text, evidence_versions, version, approval | 수정 시 새 초안 |
| Audio | id, narration_version, voice_id, file_ref, job_state | 승인 글 버전과 일치 |
| Publication | id, artwork_id, evidence_versions, narration_id, audio_id, state | 관람·검색에서 사용하는 활성 묶음 |
| GenerationJob | id, kind, target_version, state, attempt, usage, error_code | 중복 요청/재시도·비용 관리 |
| Conversation | id, exhibition_id, onboarding_complete, active_artwork_id?, viewed_artwork_id?, confirmed_part?, input_mode, output_mode | 현재 관람 세션의 대화 문맥, 작품 변경 시 기록 유지 |
| Message | id, conversation_id, reply_to?, role, input_kind, text/transcript, artwork_id?, publication_id?, citations, state | 요청 시점 대상 고정, 음성 인식 결과도 한 메시지 |
| ReplyAudio | message_id, answer_text_hash, voice_id, file_ref?, job_state | 생성 답변 낭독용, 기본 해설 Audio와 분리 가능 |

이는 논리 모델이며 각 행을 별도 테이블이나 서비스로 만들라는 지시가 아니다. Conversation/Message는 관람 중 대화 유지를 위한 최소 상태다. 이번 구현은 브라우저 sessionStorage에 대화 기록, 서버에 음성 재시도용 단기 답변 상태를 둔다. P2 분석용 장기 로그와 구분한다. 최신 저장 제안은 [기술 스택](technology-stack.md)의 7개 묶음이다. 기존 5개에 artist_profiles·knowledge_documents를 추가하며 Evidence·Narration·Audio는 publications JSON/필드에 합친다. 원본 정형 속성과 내부 문서 본문을 독립 중복 편집하지 않는 규칙은 [SPEC-010](artist-knowledge.md)을 따른다.

# 식별자와 버전

[기능명세 v1.0](functional-spec.md)의 BR-01·04~08은 다음 상세 계약을 추가한다. 구현 테이블을 늘리기보다 기존 묶음의 필드/참조로 표현할 수 있다.

- 초안 revision과 공개 버전을 구분하고 저장·승인·게시의 변경 충돌을 검사한다.
- 공개 묶음은 작품 번호·제목·메타데이터·이미지도 고정한다. 편집 중 Artwork 값이 공개 조회에 섞이지 않는다.
- 작가 공통 정보와 전시 소개/주제·제목·기간·장소는 원본 초안과 공개용 스냅샷을 구분한다. 작가 원본 수정이 이미 게시한 여러 전시에 자동 반영되지 않는다. 공개 근거에 원본 문서·section·revision을 고정하고 철회 시 다른 전시의 참조도 검사한다.
- 전시/작품의 공개 게이트, 활성 묶음 참조, 근거 철회, 논리 삭제 표식을 함께 확인한다. 참조가 남아 있다고 공개할 수 있는 것은 아니다.
- 공통 근거의 영향 작품, 자료 삭제의 파생물 관계, 요청의 기준 revision·문맥 순번을 추적한다.
- 서버 답변 TTL과 공개 버전 유효성은 별개다. 만료 후 임의 클라이언트 글을 음성으로 재합성하지 않는다.

작품 번호는 관람 편의용이며 전시 내부 범위다. 공개 URL은 바뀌지 않는 내부 작품 ID를 사용한다. 공개 묶음은 승인 근거·글·음성이 같은 내용임을 묶는 최소 참조다. 복잡한 버전 관리 UI는 필요 없다.

# 질의응답 계약 예시

서버 입력: conversation_id, request_id, 공개 전시 ID, 선택된 작품 ID 또는 번호, 텍스트 질문 또는 음성 입력 참조, input_mode, output_mode, 제한된 최근 대화. 음성은 인식 후 텍스트 요청으로 정규화하는 방안을 제안한다. 클라이언트의 owner_id·approved=true·자의적인 다른 전시 이력을 신뢰하지 않는다.

서버 출력: message_id, reply_to, resolved_artwork_id, answer, citations(허용된 evidence_id·출처 라벨·발췌), outcome(answered/clarify/insufficient/blocked/error), publication_id, audio_state/ref?. 음성 출력은 같은 answer의 버전/해시에 연결한다. 원본 PDF URL·다른 작품 비공개 ID·내부 프롬프트는 공개 응답에 넣지 않는다.

mode 값은 각각 text/voice이며 하나를 바꿔 다른 하나를 덮어쓰지 않는다. 현재 작품 선택, 정보 화면에서 둘러보는 작품, 요청 시점 작품은 별도로 기록한다. viewed_artwork_id를 active_artwork_id로 자동 복사하지 않는다. 선택 해제는 현재 작품·부위를 비우고 기록은 유지한다. 상세 전환 규칙은 [통합 채팅 명세](chat-interaction.md)를 따른다.

# 저장하지 않는 것

관람객 온보딩 완료는 탭의 전시별 임시 상태이며 관람 분석이나 개인 기록 기능이 아니다. 작가 온보딩 완료 이력은 별도 프로필 필드다.

MVP 관람객 계정, 결제·주문·재고, 실시간 그룹 방, 추적용 세션 장기 보관은 이 모델에 포함하지 않는다. 대화에 필요한 임시 인식문·문맥과 원음/질문 장기 보관은 별개다. P2 질문/행동 수집은 별도 결정 후 추가한다. 파일·원문·키를 기획 저장소의 RAG 인덱스에 넣지 않는다.

# AI 게시·후보 통합 선행 조건

[PR2 검토](../reviews/ai-harness-fix-review.md)에 따른 후속 DB 계약이다. 게시자는 승인 해설의 권위 있는 citation ID를 저장하고 해당 근거의 ID·버전·소유자·전시·publication·작품 범위·label·본문·해시를 검증하며 철회된 출처를 차단해야 한다. 모든 근거를 자동 인용으로 채우지 않는다. 현재 SQL의 비어 있지 않은 JSON 배열 검사는 이 조건을 강제하지 못하므로 공유 migration 수정 대신 신규 migration이 필요하다. 승인 전에 텍스트를 한 번 정규화해 같은 값으로 해시하거나 원문이 2,000 Unicode 코드 포인트를 넘으면 거부하고, 읽을 때는 수정하지 않는다.

현재 `api_requests`에는 답변 source/outcome/citations가 없으므로 낭독 endpoint 전 신뢰 가능한 영속 저장이 필요하다. 작가 후보 적용은 이전 section·sourceRefs·revision 이력을 동일 CAS 트랜잭션에서 append-only로 남기고 만료·소유권·고정 출처·멱등성을 검증한다. 무변경이나 재실행에 이력을 중복하지 않는다. 실제 어댑터와 원자성 검증은 후속이다.

## P0 추가 논리 계약

전시에는 부분 입력을 보관하는 작성 초안, 작성 단계, 공개 상태를 구분한다. 작가 공통 작품 세계와 전시별 선택 작품 세계는 각 소유 범위에 저장한다. 작품은 불변 ID, 초안 순서·번호, 게시 번호를 구분하고 전체 입력 항목과 선택 자료를 작품 범위에 연결한다.

AI 초안의 논리 단위는 작품 해설, 작품 Q&A, 전시 공통 Q&A 및 작가 미리보기에서 정정한 Q&A다. 작업본과 승인 버전에 각각 대상, 질문(해당 시), 답변/해설, 근거와 기준 버전, 승인 상태를 연결한다. 공개 묶음에는 승인 버전 참조만 지정한다. 정정 시 새 작업본을 만들고 기존 공개 묶음은 교체 게시나 철회에서 바뀐다. 이 계약의 저장표와 API는 후속 설계다.
 [D-017](../decisions/D-017-p0-feature-spec.md).


# v3 변경분 연결

v3에서 프로필의 이름·작가명·키워드/온보딩 상태·사진, 활동 이력 section, 전시 포스터·기간 상태, 지시문/이전 답변/새 작업본 연결, 보완 요청 재확인 상태를 추가 설계한다. 이름·이메일·성별은 운영 집계·자동화 본문·운영 AI 입력에서 제외한다. 이름·작가명·이메일은 필수, 나머지 온보딩은 선택이며 성별은 기본에 따라 수집하지 않는다. 사진·포스터는 공개 snapshot/권한/해시 검사를 거친다. R1은 행을 보존하고 본문·근거를 지우는 서비스 전용 RPC 설계만 문서화하는 것으로 확정됐으며 아직 삭제 RPC 구현이 아니다. [요청 원문 SRC-044](../references/user-backend-plan-v3.md), [진행 계획](backend-completion.md)을 따른다.


## W13 네트워크 원장과 R1 삭제 설계

160000의 private 네트워크 원장은 network_hash·session_hash(각32바이트), request UUID, 전시 UUID, kind, 예약시각만 저장한다. 원본 IP/질문은 없다. 네트워크 advisory lock과 service-only RPC로 합산을 직렬화한다. purge는 전 UTC일 시작 이전 행을 최대1000개씩 정리하므로 대상이 되기까지24~48시간이고 배치 적체/cron 미연결이면 더 오래 남는다. 스케줄은 W7에서 연결하며 현재 삭제 완료로 보지 않는다.

R1 설계(미구현): 서비스 역할 전용 RPC가 권한 확인된 삭제 요청 ID와 대상/예상 버전을 받고 현재 공개 연결을 먼저 끊은 뒤 publication의 본문·근거·파생 답변/미디어 참조를 비운다. 식별자·버전·삭제시각·최소 감사 이력은 남긴다. 현재 불변 trigger를 우회하는 일반 UPDATE 권한은 주지 않고 전용 경로에서만 비우며 동일 요청은 멱등 처리한다. 관련 원자료·캐시·Storage의 실제 삭제와 보존 의무 범위는 별도 검증 후 구현한다. 이 설계로 현재 삭제 요청 처리가 가능해졌다고 주장하지 않는다.

## W10 v3 저장 구조

170000은 artist_profiles에 full_name, keywords, onboarding_completed_at, avatar_material_id를, exhibitions에 poster_material_id를 추가한다. 이름은 소유자 전용이고 이메일은 Auth가 원본이다. 성별은 수집하지 않는다. 사진 FK는 owner·subject·material의 복합 참조로 다른 작가/전시 연결을 차단한다. ready 상태·검증 해시·크기는 RPC에서 확인한다. 사진 연결과 삭제는 기존 작가별 게시 잠금을 먼저 취해 직렬화한다. 새 RPC 3개는 authenticated만 실행하며 전체 public RPC 권한 대조 목록을 확장한다.

171000은 기존 catalog에 활동 이력 5개를 추가하고 기간/홈 상태를 조회 시 계산한다. 활동 이력만 입력한 상태는 작품 세계 등록으로 보지 않는다. 비공개 이름/키워드/사진 필드를 공개 snapshot·운영 자동화에 자동 복사하지 않는다. 공개 포스터와 예상 Q&A 저장은 각각 W12/W11의 후속이다. 배포·구버전 클라이언트 경계는 [API 계약](api-contract.md#w10-v3-온보딩사진홈-계약)을 따른다.


## W9 인증 계정과 한도

가입 계정/비밀번호/확인 코드는 Supabase Auth가 관리한다. 서버 app_metadata의 yeobek_signup_request_id는 최초 가입 UUID이며 공개 user_metadata로 대체하지 않는다. 별도 이메일·비밀번호 업무 테이블을 만들지 않는다. private signup_attempts는 HMAC network/email 해시, 요청UUID, kind, attempted_at만 보관한다. 서비스 RPC가 두 식별자 잠금을 순서대로 잡아 한도를 확인·차감한다.48시간 이후1000행 단위 정리는 기존 purge_expired 응답 형식을 유지한다.

181000은 신규 가입 표시가 있는 JWT에 password AMR을 요구한다. 소유자·운영자 RPC 및 기존6개 소유자 SELECT 정책에 제한을 더하며, 기존 계정·서비스 역할·익명 공개 관람 의미는 유지한다. Auth 계정 생성만으로 작가 프로필을 만들지 않는다. 기존 lazy 생성과 계정별 unique 제약을 사용한다.


## W11 비공개 Q&A와 배치

190000~193000은 private qa_item_versions, qa_job_requests, qa_preview_evaluations, qa_correction_evidence, training_batches/targets를 추가한다. ai_jobs에는 전시 대상과 작업 종류를 확장하고 기존 job의 shape를 보존한다. 후보는 question/answer와 exact citation body·원문 위치/버전/해시, 생성시도, mock 여부를 고정한다. 소유자 RPC만 접근하며 모델은 소유자 판정이나 승인 상태 변경을 수행하지 못한다.

후보 승인에서 원대상·문서 revision과 인용↔승인근거의 출처/본문해시를 확인한다. 생성 이후 같은 원문을 새 근거로 승인하는 정상 흐름은 허용하되 다른 범위의 같은 문장은 거부한다. 재작성은 새 후보 버전을 만들고 기존 승인/공개본을 교체하지 않는다. 평가 accurate도 승인으로 변환하지 않는다. 보완 요청은 원 공개본과 open 상태를 유지하고 recheck_publication_id에 새 공개본을 기록한 뒤 CAS 확인으로 dismissed 처리한다.

일괄 생성은 최대30작품, 요청 UUID별 고정 manifest와 자식 작업 연결을 저장한다. 공통 owner AI 한도/잠금과 lease를 재사용하며 개별 retry도 형제 동시 실행을 차단한다. 만료 manifest 정리는 purge_expired에 연결했지만 운영 스케줄·물리 삭제 확인은 W7이다. 상세 HTTP와 배포 순서는 [W11 계약](api-contract.md#w11-예상-qa미리보기전시-일괄-생성)을 따른다.


W11 후속 확정: [SRC-052](../references/user-gap-qa-exclusion.md)에 따라 관람 보완 요청→Q&A 전환은 이번 MVP에서 제외한다. 위의 기획/과거 기록에 있는 gap 재작성·정정 대상은 현재 제공하지 않는다. 작가 미리보기와 기존 Q&A 수정, 보완 요청 조회·재게시 후 확인/종료는 유지한다.

## F-024 작품 글 인터뷰 논리 데이터

작품별 인터뷰 질문은 `artwork_interview_questions`에 최대 5개까지 관리한다. 행은 작가·작품·슬롯에 귀속되며 질문, 상태, 버전, 연결 근거 ID를 보유한다. 답변 본문은 소유자 권한을 적용하는 `artwork_interview_answers`에 따로 저장한다. 답변 상태는 pending/answered/skipped/approved다. 저장된 답변은 연결된 작품 범위 근거 초안으로 관리되어, 작가가 질문 인터뷰 화면에서 “공개 근거로 사용”을 명시 승인하면 기존 근거 승인·게시 경계를 따른다. 질문과 미승인 답변은 공개 snapshot이나 공개 검색에 포함하지 않는다. 생성은 기존 `ai_jobs`·`ai_job_attempts` 원장을 재사용한다. [F-024](../features/F-024-artwork-text-interview.md) · [API 계약](api-contract.md#작품-글-인터뷰-계약-f-024) · migration `supabase/migrations/20261115010000_artwork_text_interview.sql`.
