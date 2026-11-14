---
type: Feature
id: F-007
title: 숫자 라벨로 작품 선택
description: 같은 채팅에서 작품 번호를 말하거나 입력해 현재 작품을 선택하고 해설을 요청한다.
status: draft
updated: '2026-11-14'
tags:
- mawd
- feature
rag_include: true
generated:
  by: codex/gpt-6
  at: '2026-11-12T14:12:26+09:00'
source_priority: P1
proposed_phase: MVP
decision_status: proposed
work_status: not_started
build_order: 8
depends_on:
- F-022
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

전시 QR/공유 URL로 채팅에 진입한 뒤 “18번 작품 설명해줘”처럼 말하거나 입력하면 전시 내 작품을 찾아 같은 채팅에서 해설한다. 숫자 단독 입력과 리스트 선택도 같은 대상 설정을 사용한다.

# 우선순위

- 사용자 원안: **P1**.
- 현재 구현 제안: **MVP**. 사용자 원안과 상세 설계 제안을 구분한다.
- 구현 상태: 미착수. 이 문서는 기능명세이며 앱 구현 완료 표시가 아니다.

# 수용 기준

1. 전시 안에서 중복 번호를 막고 01/1 같은 입력 정규화 규칙을 일관되게 적용한다.
2. 미존재·비공개·삭제 작품 번호는 안내하고 기존 활성 작품을 임의 변경하지 않는다.
3. 리스트와 번호 조회가 같은 작품을 가리킨다. 게시 후 번호 변경 시 인쇄 라벨 변경 필요를 알린다.
4. “십팔 번” 같은 음성 인식 결과를 번호로 정규화한다. 번호 후보가 모호하면 확인하며 다른 작품을 조용히 선택하지 않는다.
5. 작품을 바꿔도 같은 채팅 기록을 유지하고 활성 작품·검색 범위만 바꾼다.

# 제외 및 미결정

전시별 번호가 아니라 플랫폼 전체 공통 번호 체계를 구축하지 않는다.

# 선행 조건

- [F-022 통합 채팅·독립 입력/출력 모드](F-022-chat-modes.md)

# 근거와 연결

[사용자 원안](../references/user-mvp.md) · [사용자 추가 결정](../references/user-answers.md) · [기능명세 전체](../specs/functional-spec.md)

Notion F02 재정렬은 초안 번호를 바꾼다. F07은 공개 번호용 라벨을 제공한다. 적용 시점 및 기존 번호 처리의 상세는 검토한다. [D-017](../decisions/D-017-p0-feature-spec.md).
