---
type: Feature
id: F-016
title: 음성 프리셋·작가 목소리
description: 다양한 프리셋과 작가 목소리 적용을 각각 후속 후보로 유지한다.
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
- F-005
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

다양한 프리셋과 작가 목소리 적용을 각각 후속 후보로 유지한다.

# 우선순위

- 사용자 원안: **unspecified**.
- 현재 구현 제안: **Later**. 사용자 원안과 상세 설계 제안을 구분한다.
- 구현 상태: 미착수. 이 문서는 기능명세이며 앱 구현 완료 표시가 아니다.

# 수용 기준

1. 프리셋은 한국어 발음·비용·재생성 범위를 검증한다.
2. 작가 목소리는 본인 사용 승인·용도·철회·삭제와 제공사 조건을 확인한 뒤 별도 명세로 분리한다.

# 제외 및 미결정

기본 TTS와 보이스 클로닝은 다른 기능이며 첫 음성 해설의 조건으로 묶지 않는다.

# 선행 조건

- [F-005 승인 해설 음성 생성·재생](F-005-audio.md)

# 근거와 연결

[사용자 원안](../references/user-mvp.md) · [사용자 추가 결정](../references/user-answers.md) · [기능명세 전체](../specs/functional-spec.md)
