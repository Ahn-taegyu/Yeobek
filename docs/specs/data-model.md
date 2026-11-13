---
type: Specification
id: SPEC-002
title: 최소 데이터 모델
description: MVP의 논리 데이터·버전 관계와 선정된 최소 저장 구조의 연결.
status: draft
updated: '2026-11-13'
tags:
- mawd
rag_include: true
generated:
  by: codex/gpt-6
  at: '2026-11-12T14:38:57+09:00'
decision_status: proposed
sources:
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

온보딩 완료는 탭의 전시별 임시 상태이며 관람 분석이나 개인 기록 기능이 아니다.

MVP 관람객 계정, 결제·주문·재고, 실시간 그룹 방, 추적용 세션 장기 보관은 이 모델에 포함하지 않는다. 대화에 필요한 임시 인식문·문맥과 원음/질문 장기 보관은 별개다. P2 질문/행동 수집은 별도 결정 후 추가한다. 파일·원문·키를 기획 저장소의 RAG 인덱스에 넣지 않는다.
