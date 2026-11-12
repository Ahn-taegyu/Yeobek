---
type: Feature
id: F-013
title: 그룹 관람
description: 그룹 관람 의미를 먼저 확인한다. 링크 공유/같은 순서 안내와 여러 기기 동시 음성 재생은 개발 범위가 다르다.
status: draft
updated: '2026-11-12'
tags:
- mawd
- feature
rag_include: true
generated:
  by: codex/gpt-6
  at: '2026-11-12T14:12:26+09:00'
source_priority: P2
proposed_phase: P2
decision_status: proposed
work_status: not_started
build_order: 25
depends_on:
- F-005
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
- id: chat
  resource: /references/user-chat-interaction.md
  title: 사용자 통합 채팅·입출력 모드 요구
---

# 목적과 첫 범위

그룹 관람 의미를 먼저 확인한다. 링크 공유/같은 순서 안내와 여러 기기 동시 음성 재생은 개발 범위가 다르다.

# 우선순위

- 사용자 원안: **P2**.
- 현재 구현 제안: **P2**. 사용자 원안과 상세 설계 제안을 구분한다.
- 구현 상태: 미착수. 이 문서는 기능명세이며 앱 구현 완료 표시가 아니다.

# 수용 기준

1. 호스트·참가자 역할과 함께 듣기 방식이 정의된 후 상세 명세를 확정한다.
2. 동시 재생이면 늦은 참가·재연결·진행자 이탈 때의 재생 위치 규칙과 허용 오차를 검증한다.

# 제외 및 미결정

실시간 그룹 동기화·그룹 방·그룹 채팅은 첫 MVP 범위 밖이다. 개별 관람객과 도슨트의 단일 채팅은 F-022의 MVP 요구다.

# 선행 조건

- [F-005 승인 해설 음성 생성·재생](F-005-audio.md)
- [F-011 관람객 작품 리스트](F-011-artwork-list.md)

# 근거와 연결

[사용자 원안](../references/user-mvp.md) · [사용자 추가 결정](../references/user-answers.md) · [기능명세 전체](../specs/functional-spec.md)
