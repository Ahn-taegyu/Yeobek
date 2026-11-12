---
type: Feature
id: F-010
title: 위치 기반 작품 선택
description: 사용자 결정에 따라 후속 검토. 실내 위치로 가장 가까운 작품을 식별하는 정확도와 장치 요구는 아직 정의되지 않았다.
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
proposed_phase: Hold
decision_status: accepted
work_status: not_started
build_order: 99
depends_on:
- F-011
- F-017
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

사용자 결정에 따라 후속 검토. 실내 위치로 가장 가까운 작품을 식별하는 정확도와 장치 요구는 아직 정의되지 않았다.

# 우선순위

- 사용자 원안: **P1**.
- 현재 구현 제안: **Hold**. [확정 결정](../decisions/D-002-recognition.md)을 반영했다.
- 구현 상태: 미착수. 이 문서는 기능명세이며 앱 구현 완료 표시가 아니다.

# 수용 기준

1. 구역 안내와 작품 단위 인식 중 목표를 먼저 정한다.
2. 현장 측정으로 정확도·지연·인접 작품 혼동을 평가한다.
3. 실패하거나 권한을 허용하지 않아도 QR·번호 사용이 가능하다.

# 제외 및 미결정

GPS·비콘·UWB·이미지 인식을 같은 것으로 취급하지 않는다. 행사 MVP에 측위 인프라 설치 없음.

# 선행 조건

- [F-011 관람객 작품 리스트](F-011-artwork-list.md)
- [F-017 전시 지도](F-017-map.md)

# 근거와 연결

[사용자 원안](../references/user-mvp.md) · [사용자 추가 결정](../references/user-answers.md) · [기능명세 전체](../specs/functional-spec.md)
