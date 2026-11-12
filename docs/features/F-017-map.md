---
type: Feature
id: F-017
title: 전시 지도
description: 작가가 제공한 평면도 이미지에 작품 번호를 표시하는 방식부터 검토한다.
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

작가가 제공한 평면도 이미지에 작품 번호를 표시하는 방식부터 검토한다.

# 우선순위

- 사용자 원안: **unspecified**.
- 현재 구현 제안: **Later**. 사용자 원안과 상세 설계 제안을 구분한다.
- 구현 상태: 미착수. 이 문서는 기능명세이며 앱 구현 완료 표시가 아니다.

# 수용 기준

1. 작품 이동 때 표시를 수정할 수 있고 리스트/번호와 일치한다.
2. 지도가 없어도 모든 작품을 볼 수 있다.

# 제외 및 미결정

건물 도면 자동 생성·공간 스캔·실내 내비게이션은 별도 범위.

# 선행 조건

- [F-011 관람객 작품 리스트](F-011-artwork-list.md)

# 근거와 연결

[사용자 원안](../references/user-mvp.md) · [사용자 추가 결정](../references/user-answers.md) · [기능명세 전체](../specs/functional-spec.md)
