---
type: Feature
id: F-015
title: 시간·관심사 맞춤 동선
description: 관람 시간·관심사를 입력받아 작품 순서를 제안하는 후보. 실제 이동 경로 보장은 별도 문제다.
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
- F-017
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

관람 시간·관심사를 입력받아 작품 순서를 제안하는 후보. 실제 이동 경로 보장은 별도 문제다.

# 우선순위

- 사용자 원안: **unspecified**.
- 현재 구현 제안: **Later**. 사용자 원안과 상세 설계 제안을 구분한다.
- 구현 상태: 미착수. 이 문서는 기능명세이며 앱 구현 완료 표시가 아니다.

# 수용 기준

1. 필요한 작품 위치·거리·관람 시간 데이터 확보 후 정확도 기준을 정한다.
2. 필수 방문·접근 불가 구역·전시 동선을 운영자가 확인할 수 있어야 한다.

# 제외 및 미결정

현재 사용자 우선순위 미지정. 최적 경로 알고리즘이나 실내 길찾기를 먼저 개발하지 않는다.

# 선행 조건

- [F-011 관람객 작품 리스트](F-011-artwork-list.md)
- [F-017 전시 지도](F-017-map.md)

# 근거와 연결

[사용자 원안](../references/user-mvp.md) · [사용자 추가 결정](../references/user-answers.md) · [기능명세 전체](../specs/functional-spec.md)
