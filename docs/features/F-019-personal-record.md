---
type: Feature
id: F-019
title: 관람 후 개인 기록
description: 관람객 개인 메모·관심 작품 저장 후보.
status: draft
updated: '2026-11-12'
tags:
- mawd
- feature
rag_include: true
generated:
  by: codex/gpt-6
  at: '2026-11-12T13:31:41+09:00'
source_priority: unspecified
proposed_phase: Later
decision_status: proposed
work_status: not_started
build_order: 99
depends_on:
- F-011
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

관람객 개인 메모·관심 작품 저장 후보.

# 우선순위

- 사용자 원안: **unspecified**.
- 현재 구현 제안: **Later**. 사용자 원안과 상세 설계 제안을 구분한다.
- 구현 상태: 미착수. 이 문서는 기능명세이며 앱 구현 완료 표시가 아니다.

# 수용 기준

1. 브라우저 로컬 저장인지 계정 저장인지, 다른 기기 이전 여부를 정한다.
2. 기록의 공개 여부·삭제·복구 기준을 정의한다.

# 제외 및 미결정

로그인 없는 MVP와 별도 계정 요구가 충돌할 수 있어 지금 저장 방식을 확정하지 않는다.

# 선행 조건

- [F-011 관람객 작품 리스트](F-011-artwork-list.md)

# 근거와 연결

[사용자 원안](../references/user-mvp.md) · [사용자 추가 결정](../references/user-answers.md) · [기능명세 전체](../specs/functional-spec.md)
