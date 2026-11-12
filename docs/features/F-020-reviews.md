---
type: Feature
id: F-020
title: 관람 후 전시 후기
description: 전시 전체 후기를 수집하는 후보. 데이터 수집 P2에 후기 분석이 있어도 후기 UI가 자동 P1이 되지는 않는다.
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
- F-001
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

전시 전체 후기를 수집하는 후보. 데이터 수집 P2에 후기 분석이 있어도 후기 UI가 자동 P1이 되지는 않는다.

# 우선순위

- 사용자 원안: **unspecified**.
- 현재 구현 제안: **Later**. 사용자 원안과 상세 설계 제안을 구분한다.
- 구현 상태: 미착수. 이 문서는 기능명세이며 앱 구현 완료 표시가 아니다.

# 수용 기준

1. 작품 댓글과 전시 후기의 대상을 구분한다.
2. 공개/비공개·수정/삭제·스팸 대응을 정의한다.

# 제외 및 미결정

후기 분석을 앞당기려면 수집 UI 우선순위 변경을 명시적으로 결정한다.

# 선행 조건

- [F-001 전시 개설·작가 접근](F-001-exhibition.md)

# 근거와 연결

[사용자 원안](../references/user-mvp.md) · [사용자 추가 결정](../references/user-answers.md) · [기능명세 전체](../specs/functional-spec.md)
