---
type: Decision
id: D-001
title: 사업안은 유보하고 공통 도슨트부터
description: 사업안 1/2는 미정이며 첫 개발은 공통 도슨트로 한정한다.
status: deprecated
updated: '2026-11-13'
tags:
- mawd
rag_include: true
generated:
  by: codex/gpt-6
  at: '2026-11-12T13:31:41+09:00'
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
decision_status: accepted
---

# 결정 상태

**2026-11-13에 [D-014](D-014-business-scope-supply.md)로 대체됐다.** 사용자가 사업안 1번을 확정했다. 공통 도슨트 우선과 거래 기능 제외는 D-014가 이어받는다. 아래는 11/12 시점의 결정 기록이다.

**accepted** — accepted는 사용자 응답으로 결정됨, partial은 일부만 확인됨, proposed/open은 미확정이다.

# 내용

사업안 1/2는 미정이며 첫 개발은 공통 도슨트로 한정한다.

# 영향

공통 자료 입력→검수→글·음성 해설→게시→질의응답을 먼저 만든다. 입장권·판매·구매 문의·결제는 첫 개발 범위에 넣지 않는다. 1안 최종 채택이라고 설명하지 않는다.

# 남은 사항

향후 사업안 선택에 따라 고객·수익·운영 자동화 범위가 바뀐다. 지금은 공통 기능을 검증한다.

# 근거

[사용자 원안](../references/user-mvp.md), [추가 응답](../references/user-answers.md), [Notion 초안](../references/notion-planning.md).
