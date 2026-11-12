---
type: Decision
id: D-005
title: P2 분석과 최소 운영 기록
description: 제품 관람 분석은 P2로 유지하고 관찰 실험과 운영 상태를 구분한다.
status: draft
updated: '2026-11-12'
tags:
- mawd
rag_include: true
generated:
  by: codex/gpt-6
  at: '2026-11-12T14:12:26+09:00'
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
decision_status: proposed
---

# 결정 상태

**proposed** — accepted는 사용자 응답으로 결정됨, partial은 일부만 확인됨, proposed/open은 미확정이다.

# 내용

제품 관람 분석은 P2로 유지하고 관찰 실험과 운영 상태를 구분한다.

# 영향

MVP는 작업 성공/실패·비용·승인 버전을 기록한다. 관람객 추적·질문 원문 장기 저장·통계 대시보드는 P2. QR 접속 비율은 관찰 표본의 분모가 있을 때만 계산한다.

하나의 채팅을 이어가는 데 필요한 임시 메시지·인식문·작품 문맥은 대화 기능이다. 이를 유지한다고 관람객 분석이나 원음 장기 보관이 자동으로 P1이 되지는 않는다. [채팅 명세](../specs/chat-interaction.md).

# 남은 사항

질문 보관 기간·집계 기준·동의·삭제는 P2 전에 결정. 최소 운영 기록의 구체 필드와 보존 기간은 구현 중 확정.

# 근거

[사용자 원안](../references/user-mvp.md), [추가 응답](../references/user-answers.md), [Notion 초안](../references/notion-planning.md).
