---
type: Feature
id: F-011
title: 관람객 작품 리스트
description: 채팅 안의 작품 선택 패널에서 공개 작품을 고르고 같은 대화의 현재 작품으로 설정한다.
status: draft
updated: '2026-11-12'
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

전시 공개 작품의 번호·제목·썸네일을 채팅 안의 선택 패널로 제공한다. 선택한 작품 카드를 같은 대화에 표시하고 현재 작품으로 설정한다. 해설과 질의응답을 위해 별도 상세/질문 화면으로 이동시키지 않는다.

# 우선순위

- 사용자 원안: **P1**.
- 현재 구현 제안: **MVP**. 사용자 원안과 상세 설계 제안을 구분한다.
- 구현 상태: 미착수. 이 문서는 기능명세이며 앱 구현 완료 표시가 아니다.

# 수용 기준

1. 미승인·비공개 작품은 목록·직접 URL 모두에서 숨긴다.
2. 리스트 번호와 채팅 작품 카드·발화로 선택한 번호가 일치한다.
3. 작품이 없거나 이미지가 실패하면 대체 안내가 보이고 글 탐색은 가능하다.
4. 작품 선택 후에도 기존 대화와 독립 입력/출력 설정을 유지한다. 이미지 표시와 부분 터치/시각 분석은 다른 기능으로 취급한다.

# 제외 및 미결정

추천·무한 개인화 피드·지도는 별도 기능.

# 선행 조건

- [F-022 통합 채팅·독립 입력/출력 모드](F-022-chat-modes.md)

# 근거와 연결

[사용자 원안](../references/user-mvp.md) · [사용자 추가 결정](../references/user-answers.md) · [기능명세 전체](../specs/functional-spec.md)
