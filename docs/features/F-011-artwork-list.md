---
type: Feature
id: F-011
title: 관람객 작품 목록·정보
description: 채팅 배경의 작품 목록과 작품 정보 화면에서 탐색하고 같은 대화의 질문 대상을 선택한다.
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
- id: knowledge-screens
  resource: /decisions/D-011-knowledge-and-screens.md
  title: AI용 내부 지식·DB 원본과 필수 화면 요구
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

전시 공개 작품의 번호·제목·썸네일을 채팅 배경의 그리드/리스트(SC-V02)로 제공한다. 작품 정보(SC-V06)를 열어 이미지·공개 메타데이터를 볼 수 있다. `이 작품으로 질문`은 현재 대상을 설정하고 채팅에 표시하며, 해설과 질의응답은 같은 SC-V01에서 진행한다. 정보 탐색 자체는 선택 변경이 아니다.

# 우선순위

- 사용자 원안: **P1**.
- 현재 구현 제안: **MVP**. 사용자 원안과 상세 설계 제안을 구분한다.
- 구현 상태: 미착수. 이 문서는 기능명세이며 앱 구현 완료 표시가 아니다.

# 수용 기준

1. 미승인·비공개 작품은 목록·직접 URL 모두에서 숨긴다.
2. 리스트 번호와 채팅 작품 카드·발화로 선택한 번호가 일치한다.
3. 작품이 없거나 이미지가 실패하면 대체 안내가 보이고 글 탐색은 가능하다.
4. 작품 정보 열기/닫기에는 현재 선택·작성 글을 유지한다. 선택/해제 후에도 기존 대화와 독립 입력/출력 설정을 유지한다. 이미지 표시와 부분 터치/시각 분석은 다른 기능으로 취급한다.

# 제외 및 미결정

그리드와 채팅 상단 선택 칩을 초기 배치로 제안한다. 리스트·입력창 mention은 대안이며 보기 토글/자동완성/다중 작품 mention을 필수로 추가하지 않는다. 추천·개인화 피드·지도는 별도 기능.

# 선행 조건

- [F-022 통합 채팅·독립 입력/출력 모드](F-022-chat-modes.md)

# 근거와 연결

[사용자 원안](../references/user-mvp.md) · [사용자 추가 결정](../references/user-answers.md) · [기능명세 전체](../specs/functional-spec.md)

Notion F08의 한 줄 목록과 전체보기는 같은 채팅의 대상을 선택한다. 현재 작품을 다시 고르면 선택 해제하며 기록을 유지한다. 독립 F09는 제외한다. [D-017](../decisions/D-017-p0-feature-spec.md).
