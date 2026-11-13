---
type: Feature
id: F-005
title: 해설·채팅 답변 음성 출력
description: 승인 해설과 근거 기반 채팅 답변을 선택한 출력 모드에 따라 음성으로 전달한다.
status: draft
updated: '2026-11-13'
tags:
- mawd
- feature
rag_include: true
generated:
  by: codex/gpt-6
  at: '2026-11-12T14:38:57+09:00'
source_priority: P1
proposed_phase: MVP
decision_status: proposed
work_status: not_started
build_order: 5
depends_on:
- F-003
sources:
- id: current-stack
  resource: /research/recommended-stack.md
  title: Render 제외 후 최신 스택·모델 권고
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
- id: direction
  resource: /references/user-build-direction.md
  title: 사용자 최신 개발 방향
---

# 목적과 첫 범위

승인된 기본 해설과 공개 근거로 생성한 채팅 답변을 음성으로 전달한다. 출력 모드는 입력 모드와 독립적이다. 최신 권고는 Typecast `ssfm-v31`의 호환 한국어 음성 한 종이며 음성 ID·품질·키 접근은 아직 미확인이다. 기본 해설은 사전 생성하고 새 답변은 확정 글의 MP3 스트리밍을 시험한다. 이전 OpenAI coral은 준비 실패 시 시연용 대안이다. [현재 추천과 검증 조건](../research/recommended-stack.md), [기술 스택](../specs/technology-stack.md). 녹음·음성 인식 입력은 [F-022](F-022-chat-modes.md)에서 다룬다.

# 우선순위

- 사용자 원안: **P1**.
- 현재 구현 제안: **MVP**. 사용자 원안과 상세 설계 제안을 구분한다.
- 구현 상태: 미착수. 이 문서는 기능명세이며 앱 구현 완료 표시가 아니다.

# 수용 기준

1. 기본 해설 음성은 승인된 글 버전, 실시간 답변 음성은 해당 채팅 메시지의 답변 글 버전과 일치한다. 실시간 답변마다 작가 사전 승인을 요구하지 않는다.
2. 출력=텍스트이면 입력이 음성이어도 자동 낭독하지 않는다. 출력=음성이면 텍스트 입력에도 음성으로 답한다.
3. 같은 채팅에서 재생·정지·재시도와 답변 글/출처 확인이 가능하다. 출력 모드 변경만으로 새 LLM 답변을 생성하지 않는다.
4. 기본 해설은 준비한 음성을 재사용할 수 있다. F-021의 게시 준비 조건은 기본 해설에만 적용하며 아직 존재하지 않는 모든 Q&A 음성을 요구하지 않는다.
5. 새 답변의 음성 생성·재생 실패는 해당 메시지에 표시하고 글 확인·낭독 재시도를 제공한다. 다른 작품/메시지의 음성을 대신 재생하지 않는다.

# 제외 및 미결정

음성 입력은 F-022의 MVP 요구다. 항상 듣는 통화 방식·성우 선택·작가 목소리 복제·고급 편집기는 별도 미확정/후속 기능이다. F-006의 답변 글을 받아 음성으로 바꾸는 런타임 연동과 TTS 모듈의 개발 선행 조건을 구분한다.

# 선행 조건

- [F-003 공개 근거·해설 작가 검수](F-003-artist-review.md)

# 근거와 연결

[사용자 원안](../references/user-mvp.md) · [사용자 추가 결정](../references/user-answers.md) · [기능명세 전체](../specs/functional-spec.md)
