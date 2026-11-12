---
type: Decision
id: D-002
title: 첫 MVP 인식은 QR·숫자
description: 첫 MVP는 QR과 숫자이며 NFC·위치는 후속 검토다.
status: stable
updated: '2026-11-12'
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

**accepted** — accepted는 사용자 응답으로 결정됨, partial은 일부만 확인됨, proposed/open은 미확정이다.

# 내용

첫 MVP는 QR과 숫자이며 NFC·위치는 후속 검토다.

# 영향

전시 QR/URL로 진입한 다음 번호 또는 리스트에서 작품을 고른다. 작품 직접 QR도 같은 URL 모델로 제공 가능하다. 사용자 원안의 NFC·위치 P1 표시는 이력으로 보존한다.

# 남은 사항

NFC는 URL 태그 연결 후보이며 위치 인식은 정확도·장소·장치 정의 후 재평가한다.

# 근거

[사용자 원안](../references/user-mvp.md), [추가 응답](../references/user-answers.md), [Notion 초안](../references/notion-planning.md).
