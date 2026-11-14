---
type: Plan
id: P-002
title: MVP 우선순위와 확정 범위
description: 사용자 원안·추가 결정·상세 설계 제안을 분리한 구현 기준.
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
- id: author-experience
  resource: /references/user-author-experience-parallel.md
  title: 작가 검수·체험 개선과 AI 인터뷰 병렬 구현 요청
- id: v3-scope
  resource: /references/user-v3-decisions.md
  title: v3 온보딩·입력·화면 범위 결정
- id: v3-review
  resource: /references/user-v3-review-decisions.md
  title: v3 검수·미리보기·운영 게시 결정
- id: knowledge-screens
  resource: /decisions/D-011-knowledge-and-screens.md
  title: AI용 내부 지식·DB 원본과 필수 화면 요구
- id: current-stack
  resource: /research/recommended-stack.md
  title: Render 제외 후 최신 스택·모델 권고
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
- id: artist-auth
  resource: /decisions/D-016-artist-auth.md
  title: 작가 직접 회원가입과 로그인 선택 진입
---

# 현재 기준

**공통 도슨트부터 개발한다. 공개 전시 주소로 진입하고 작품 번호와 목록으로 작품을 고른다.** 이전 QR·숫자 결정의 QR 제작은 v3에서 보류한다. NFC·위치는 후속 검토한다.[^answers] [v3 범위 결정](../references/user-v3-decisions.md).

**11/13 추가 확정: 사업안은 1번(도슨트 공급 회사의 1인 운영)이다.** 개발 순서와 아래 우선순위 표는 바뀌지 않으며 운영 자동화의 세부 범위는 제안이다. [D-014](../decisions/D-014-business-scope-supply.md).

추가 확정: **해설·질문은 하나의 채팅, 텍스트/음성 입력과 출력은 독립 선택**이다. 음성 입력→텍스트 출력과 텍스트 입력→음성 출력도 첫 MVP에 포함한다. [사용자 대화 요구](../references/user-chat-interaction.md).

마감은 2026-11-15 일요일 아침이다. 기획·프런트 보조·디자인 각 1명, 프런트·백엔드·AI를 맡는 사용자 1명이다. 제공 API 최소 하나가 필수이고 키는 행사 당일 받는다. 사전 개발이 가능하고 OpenAI 키가 있다. [선정 스택](../specs/technology-stack.md)으로 진행하며 일요일의 PDF 처리는 보관·수동 발췌 연결로 정한다. 장기 자동화 수준은 후속 결정이다.

**11/13 추가 확정:** 작가 입력을 AI용 내부 지식으로 나누고 DB 원본으로 저장한다. 작가 홈·전시 입력, 관람객 온보딩·목록 배경 채팅·작품 정보·선택 표시를 반영한다. 사용자용 전체 위키 화면은 확정하지 않았으며 기존 입력·검수에서 참고 정보를 확인하는 안이다. [D-011](../decisions/D-011-knowledge-and-screens.md).

# 우선순위 표

'원안'은 최초 강조 표시이며 '이번 단계'는 추가 결정 및 구현 제안을 반영한다. **MVP=우선 구현 제안**, P2=2순위, Later=후속, Hold=정의/현장 검증 전 보류. F-001·F-002·F-023은 인증·초안 API·DB 기반 개발 중이다. 나머지는 미착수이며 [실제 개발 범위](../specs/development-foundation.md)를 기능 완료와 구분한다.

| ID | 기능 | 사용자 원안 | 이번 단계 | 선행 기능 |
| --- | --- | --- | --- | --- |
| [F-001](../features/F-001-exhibition.md) | 전시 개설·작가 접근 | prerequisite | MVP | — |
| [F-002](../features/F-002-material-input.md) | 작가 자료·이미지·도록 입력 | P1 | MVP | F-001, F-023 |
| [F-003](../features/F-003-artist-review.md) | 공개 근거·해설 작가 검수 | P1 | MVP | F-002, F-004 |
| [F-004](../features/F-004-text-generation.md) | 작품별 글 해설 생성 | P1 | MVP | F-002 |
| [F-005](../features/F-005-audio.md) | 해설·채팅 답변 음성 출력 | P1 | MVP | F-003 |
| [F-006](../features/F-006-qa.md) | 승인 자료 기반 AI 질의응답 | P1 | MVP | F-022 |
| [F-007](../features/F-007-number-label.md) | 숫자 라벨로 작품 선택 | P1 | MVP | F-022 |
| [F-008](../features/F-008-qr.md) | 전시 QR 배포 | P1 | Hold | F-022 |
| [F-009](../features/F-009-nfc.md) | NFC 태그로 작품 선택 | P1 | Later | F-008 |
| [F-010](../features/F-010-location.md) | 위치 기반 작품 선택 | P1 | Hold | F-011, F-017 |
| [F-011](../features/F-011-artwork-list.md) | 관람객 작품 목록·정보 | P1 | MVP | F-022 |
| [F-012](../features/F-012-interview.md) | AI 작가 인터뷰 | P2 | P2 | F-002, F-003 |
| [F-013](../features/F-013-group.md) | 그룹 관람 | P2 | P2 | F-005, F-011 |
| [F-014](../features/F-014-analytics.md) | 관람 데이터 수집·집계 | P2 | P2 | F-006, F-018, F-020 |
| [F-015](../features/F-015-route.md) | 시간·관심사 맞춤 동선 | unspecified | Later | F-011, F-017 |
| [F-016](../features/F-016-voice-options.md) | 음성 프리셋·작가 목소리 | unspecified | Later | F-005 |
| [F-017](../features/F-017-map.md) | 전시 지도 | unspecified | Later | F-011 |
| [F-018](../features/F-018-comments.md) | 작품별 감상평·댓글 | unspecified | Later | F-011 |
| [F-019](../features/F-019-personal-record.md) | 관람 후 개인 기록 | unspecified | Later | F-011 |
| [F-020](../features/F-020-reviews.md) | 관람 후 전시 후기 | unspecified | Later | F-001 |
| [F-021](../features/F-021-publication.md) | 승인 버전 게시·공개 중지 | prerequisite | MVP | F-003, F-005 |
| [F-022](../features/F-022-chat-modes.md) | 통합 채팅·독립 입력/출력 모드 | prerequisite | MVP | F-021 |
| [F-023](../features/F-023-artist-knowledge.md) | AI용 작가·전시·작품 연결 지식 저장 | prerequisite | MVP | F-001 |

prerequisite는 최초 목록에 독립 이름이 없지만 필요한 전시/권한·게시·채팅 구성이다. F-022는 사용자 추가 요구를 구현하는 필수 기능이다. unspecified는 최초 우선순위 미지정이며 자동으로 '3순위 확정'을 뜻하지 않는다.

# 첫 MVP의 완료 경로

작가 홈 → 전시 기본 필수 정보와 선택 작품 세계 → 작품·자료 → 기본 해설과 예상 Q&A → 검수·승인 → 전시 공개 → 공개 전시 주소 → 전시 소개 → 글·음성 질문과 글 답변·TTS.

음성 입력을 제외하거나 음성 입력을 항상 음성 출력으로 묶은 구현은 이번 요구를 충족하지 못한다. 실제 구현 순서는 [개발 계획](delivery-plan.md), 화면/상태/실패 조건은 [기능명세](../specs/functional-spec.md)와 [통합 채팅](../specs/chat-interaction.md)을 따른다.

# 범위를 줄이는 이유

- 작품 번호 접근은 유지한다. QR 제작과 별도 도슨트 화면 후보는 v3에서 MVP 범위에서 제외했다. NFC·위치는 최초 P1 이력을 남긴 채 첫 MVP에서 제외한다. [v3 범위 결정](../references/user-v3-decisions.md).
- AI 인터뷰는 최신 사용자 P2를 따른다. 정적 입력 안내는 가능하나 대화형 인터뷰를 조용히 P1로 올리지 않는다.
- 그룹 관람·데이터 수집도 P2다. 동시 재생 서버나 분석 대시보드가 첫 공개의 선행 조건이 아니다.
- 작가 AI 인터뷰 P2와 관람객 음성 입력 MVP는 다른 기능이다. 이미지 부분 선택·카메라는 [D-007](../decisions/D-007-visual-reference.md)에서 사용자가 후순위로 확정했다.
- 지도·동선·댓글·개인 기록·후기·음성 옵션은 사용자 미지정 후보다.
- 결제·예매·작품 구매 문의·CRM·다국어는 현재 공통 도슨트 범위에서 제외 제안이다. API 하나 필수라는 규칙이 파트너 전부 통합을 뜻하지 않는다.

# 결정이 필요한 부분

1. **도록 자동화:** 이번 마감은 PDF 보관·직접 발췌 연결. 자동 추출·OCR·이미지 매칭은 실제 파일 확인 후 후속 범위를 결정.
2. **입력 자료:** 아직 확보하지 못했다. 가상 시연과 실제 검증을 분리하고 자료 확보를 첫 작업으로 둔다.
3. **실행 검증:** 최초 스택은 [D-008](../decisions/D-008-technology-stack.md), Render 제외 후 최신 추천은 [D-010](../decisions/D-010-practical-stack.md). Q&A/STT·초안·TTS의 제공사 분리와 무료/유료 조건은 권고 단계이며 기능 우선순위는 그대로다. 실제 API 접근·한국어 품질·한도·비용과 공식 제출 시각은 확인 필요.
4. **화면 세부안:** 그리드/리스트, 상단/mention 중 배치는 아직 미확정이다. 그리드+상단 칩과 기존 검수에서 AI 참고 정보를 확인하는 구성을 제안한다. 전체 위키 탐색은 후속 후보다.
5. **시각 질문:** 말·글 지칭과 승인된 부위 설명을 사용한다. 이미지 부분 선택·카메라는 사용자 확정 후순위이고, 이미지 AI 분석도 일요일 일정 밖이다.

[^answers]: [사용자 추가 응답](../references/user-answers.md).

## 작가 인증 요구

[D-016](../decisions/D-016-artist-auth.md)에 따라 직접 회원가입과 로그인 선택을 MVP 흐름에 포함한다. 가입 후 자동 로그인 없이 직접 로그인한다. 기존 로그인은 구현되어 있으며 직접 가입의 구현·수용 검증은 후속이다. 사용자가 [마감 전 포함](../references/user-auth-signup-timing.md)을 결정했으므로 백엔드 계획의 '직접 가입은 마감 이후' 기준을 대체한다.

현행 P0 및 Notion 기능 대응은 [기능명세](../specs/functional-spec.md#notion-p0-기능-연결)를 따른다. 기존 기능 ID와 원안 우선순위는 이력 및 상세 설계 참조로 사용한다.

# 작가 체험 개선 추가 범위

[2026-11-14 요청](../references/user-author-experience-parallel.md)과 [D-018](../decisions/D-018-author-experience.md)에 따라 근거 접기, 최근 학습 복원, Q&A 재작성·사용·중지, 관람 UI 기반 초안 체험 및 [F-024 글 인터뷰](../features/F-024-artwork-text-interview.md)를 구현한다. 기존 녹음 인터뷰 범위는 유지한다. 새 플래그는 기본 꺼짐이며 승인하지 않은 인터뷰와 미리보기는 비공개다.
