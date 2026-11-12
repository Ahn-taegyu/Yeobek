---
type: Feature
id: F-009
title: NFC 태그로 작품 선택
description: 사용자 추가 결정으로 첫 MVP에서 제외하고 후속 검토한다. 원안 P1 이력은 보존한다.
status: draft
updated: '2026-11-12'
tags:
- mawd
- feature
rag_include: true
generated:
  by: codex/gpt-6
  at: '2026-11-12T13:31:41+09:00'
source_priority: P1
proposed_phase: Later
decision_status: accepted
work_status: not_started
build_order: 99
depends_on:
- F-008
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

사용자 추가 결정으로 첫 MVP에서 제외하고 후속 검토한다. 원안 P1 이력은 보존한다.

# 우선순위

- 사용자 원안: **P1**.
- 현재 구현 제안: **Later**. [확정 결정](../decisions/D-002-recognition.md)을 반영했다.
- 구현 상태: 미착수. 이 문서는 기능명세이며 앱 구현 완료 표시가 아니다.

# 수용 기준

1. 후속 도입 시 기존 작품 URL을 태그에 기록하고 대상 휴대폰에서 링크가 열리는지 확인한다.
2. 태그 인식 실패 시 QR/번호로 같은 작품에 진입한다.

# 제외 및 미결정

태그 공급·쓰기·기기 호환 검증 후 착수. Web NFC API로 직접 읽는 구조를 전제하지 않는다.

# 선행 조건

- [F-008 전시·작품 QR 배포](F-008-qr.md)

# 근거와 연결

[사용자 원안](../references/user-mvp.md) · [사용자 추가 결정](../references/user-answers.md) · [기능명세 전체](../specs/functional-spec.md)
