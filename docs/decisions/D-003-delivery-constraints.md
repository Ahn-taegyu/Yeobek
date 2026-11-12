---
type: Decision
id: D-003
title: 팀·일정·파트너 제약
description: 4명 팀, 핵심 개발자 1명, 11월 15일 아침 마감, 제공 API 최소 1개 필수다.
status: draft
updated: '2026-11-12'
tags:
- mawd
rag_include: true
generated:
  by: codex/gpt-6
  at: '2026-11-12T14:38:57+09:00'
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
- id: direction
  resource: /references/user-build-direction.md
  title: 사용자 최신 개발 방향
decision_status: partial
---

# 결정 상태

**partial** — accepted는 사용자 응답으로 결정됨, partial은 일부만 확인됨, proposed/open은 미확정이다.

# 내용

4명 팀, 핵심 개발자 1명, 11월 15일 아침 마감, 제공 API 최소 1개 필수다.

# 영향

기획·디자인·프런트 보조 작업은 나눌 수 있지만 백엔드·AI 개발이 병렬 인력 3명인 것으로 계산하지 않는다. 파트너 키는 행사 당일 제공되지만 사전 제품 코드 개발은 허용된다. 보유한 OpenAI 키로 오늘 음성을 검증하고, 라이너는 어댑터·mock 계약으로 준비한 뒤 행사 키 수령 직후 실호출한다. [최신 확인](../references/user-build-direction.md).

# 남은 사항

정확한 공식 제출 시각과 키의 실제 모델 접근·한도는 미확인이다. [개발 계획](../product/delivery-plan.md)은 일요일 04:30을 팀 내부 완료 목표로 정했다. 공식 행사 종료 06:30과 제출 마감은 구분한다.

# 근거

[사용자 원안](../references/user-mvp.md), [추가 응답](../references/user-answers.md), [Notion 초안](../references/notion-planning.md).
