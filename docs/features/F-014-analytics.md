---
type: Feature
id: F-014
title: 관람 데이터 수집·집계
description: '요청한 다섯 항목을 보존한다: 머문 곳, 후기, 댓글 많은 작품, 많이 받은 질문, 감정적 영향을 받은 지점.'
status: draft
updated: '2026-11-12'
tags:
- mawd
- feature
rag_include: true
generated:
  by: codex/gpt-6
  at: '2026-11-12T13:31:41+09:00'
source_priority: P2
proposed_phase: P2
decision_status: proposed
work_status: not_started
build_order: 30
depends_on:
- F-006
- F-018
- F-020
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

요청한 다섯 항목을 보존한다: 머문 곳, 후기, 댓글 많은 작품, 많이 받은 질문, 감정적 영향을 받은 지점.

# 우선순위

- 사용자 원안: **P2**.
- 현재 구현 제안: **P2**. 사용자 원안과 상세 설계 제안을 구분한다.
- 구현 상태: 미착수. 이 문서는 기능명세이며 앱 구현 완료 표시가 아니다.

# 수용 기준

1. 웹 활성 시간과 현장 체류를 구분한다. 위치 없는 웹 로그로 작품 앞 체류를 단정하지 않는다.
2. 후기는 F-020, 댓글 빈도는 F-018이 선행해야 하며 해당 UI 없이 통계를 약속하지 않는다.
3. 질문 빈도는 중복/세션 기준·원문 보존·삭제 정책을 정하고 집계한다.
4. 감정은 선택적 자기 보고로 수집하는 안을 검토한다. 행동만으로 감정을 확정하지 않는다.
5. 리포트에 기간·분모·표본·누락·수집 기준을 표시한다.

# 제외 및 미결정

분석 전체 의존성과 질문 빈도만의 부분 구현 의존성은 다르다. 전체 P2를 일괄 구현하지 않는다. 운영 작업 로그는 D-005에서 별도 정의.

# 선행 조건

- [F-006 승인 자료 기반 AI 질의응답](F-006-qa.md)
- [F-018 작품별 감상평·댓글](F-018-comments.md)
- [F-020 관람 후 전시 후기](F-020-reviews.md)

# 근거와 연결

[사용자 원안](../references/user-mvp.md) · [사용자 추가 결정](../references/user-answers.md) · [기능명세 전체](../specs/functional-spec.md)
