---
type: Feature
id: F-021
title: 승인 버전 게시·공개 중지
description: 공개 근거·해설·음성이 준비된 작품 버전을 게시하고, 전시의 공개를 시작/중단한다.
status: draft
updated: '2026-11-14'
tags:
- mawd
- feature
rag_include: true
generated:
  by: codex/gpt-6
  at: '2026-11-12T14:12:26+09:00'
source_priority: prerequisite
proposed_phase: MVP
decision_status: proposed
work_status: in_progress
build_order: 6
depends_on:
- F-003
- F-005
sources:
- id: api-rollout
  resource: /references/user-api-rollout-publication.md
  title: 최소 승인·게시 UI 구현 요청
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
---

# 목적과 첫 범위

공개 근거·해설·음성이 준비된 작품 버전을 게시하고, 전시의 공개를 시작/중단한다.

# 우선순위

- 사용자 원안: **prerequisite**.
- 현재 구현 제안: **MVP**. 사용자 원안과 상세 설계 제안을 구분한다.
- 구현 상태: 미착수. 이 문서는 기능명세이며 앱 구현 완료 표시가 아니다.

# 수용 기준

1. 최소 한 작품의 근거·해설 승인과 동일 버전 음성이 준비되어야 최초 게시할 수 있다.
2. 원자료 파일은 비공개이고 허용된 이미지·해설·근거 발췌만 공개 API에서 제공한다.
3. 일반 수정은 새 초안으로 만들고 재승인/음성 완료 전 기존 승인 버전을 유지한다.
4. 잘못된 내용·권리 철회 시 즉시 공개 중지하여 검색/캐시/직접 URL을 차단한다.
5. 새 공개 버전으로 바뀌면 음성·글·검색 근거를 같은 버전으로 바꾼다.
6. 음성 준비는 승인된 기본 해설에 대한 조건이다. 관람 중 생성되는 후속 답변은 F-005/F-006에서 메시지별로 처리하며 모든 질문의 답변 음성을 사전에 생성하지 않는다.

# 제외 및 미결정

예약 게시·복잡한 릴리스 관리 UI는 불필요. 작업 상태와 활성 버전 참조만으로 구현하는 제안.

# 선행 조건

- [F-003 공개 근거·해설 작가 검수](F-003-artist-review.md)
- [F-005 승인 해설 음성 생성·재생](F-005-audio.md)

# 근거와 연결

[사용자 원안](../references/user-mvp.md) · [사용자 추가 결정](../references/user-answers.md) · [기능명세 전체](../specs/functional-spec.md)

Notion F07은 공개 조건 확인과 안내, 공개·비공개 전환을 제공한다. F05 승인 해설·예상 Q&A·정정 답변 중 게시된 버전을 F08에서 사용한다. [D-017](../decisions/D-017-p0-feature-spec.md).

# 현재 구현 범위

게시·중지 API는 병합됐고, [최신 요청](../references/user-api-rollout-publication.md)으로 별도 기본 해설 검수와 게시 관리 최소 UI를 연결한다. 화면 검증과 CI 결과는 [작업 추적](../specs/backend-completion.md)에 기록한다. 실제 모델·음성·운영 공개는 별도 점검 대상이다.
