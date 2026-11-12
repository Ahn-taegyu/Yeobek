---
type: Feature
id: F-012
title: AI 작가 인터뷰
description: 자료가 부족한 작가에게 질문해 창작 의도·재료·감상 포인트를 수집하는 후속 기능. 첫 MVP의 필수 정적 입력 폼과 구분한다.
status: draft
updated: '2026-11-12'
tags:
- mawd
- feature
rag_include: true
generated:
  by: codex/gpt-6
  at: '2026-11-12T13:31:41+09:00'
source_priority: P2
proposed_phase: P2
decision_status: proposed
work_status: not_started
build_order: 20
depends_on:
- F-002
- F-003
sources:
- id: user
  resource: /references/user-mvp.md
  title: 최신 사용자 MVP 우선순위
- id: notion
  resource: /references/notion-planning.md
  title: 수정 중인 Notion 기획
- id: answers
  resource: /references/user-answers.md
  title: 2026-11-12 사용자 범위·팀·일정 확인
---

# 목적과 첫 범위

자료가 부족한 작가에게 질문해 창작 의도·재료·감상 포인트를 수집하는 후속 기능. 첫 MVP의 필수 정적 입력 폼과 구분한다.

# 우선순위

- 사용자 원안: **P2**.
- 현재 구현 제안: **P2**. 사용자 원안과 상세 설계 제안을 구분한다.
- 구현 상태: 미착수. 이 문서는 기능명세이며 앱 구현 완료 표시가 아니다.

# 수용 기준

1. 답변 원문·질문·대상 작품을 저장하고 해설 근거로 연결한다.
2. 유도 질문을 피하고 모른다·건너뛰기·종료를 지원한다.
3. 고정 질문 수·꼬리 질문 한도를 정해 끝나는 인터뷰로 만든다. 작가가 승인하기 전 공개하지 않는다.

# 제외 및 미결정

Notion이 제안한 4개+꼬리 질문 1회는 후보일 뿐. 음성 인터뷰·STT는 추가 검토.

# 선행 조건

- [F-002 작가 자료·이미지·도록 입력](F-002-material-input.md)
- [F-003 공개 근거·해설 작가 검수](F-003-artist-review.md)

# 근거와 연결

[사용자 원안](../references/user-mvp.md) · [사용자 추가 결정](../references/user-answers.md) · [기능명세 전체](../specs/functional-spec.md)
