---
type: Feature
id: F-004
title: 작품별 글 해설 생성
description: 현재 작품 자료와 관련 전시·작가 공통 자료로 한국어 해설 초안을 생성하는 제안이다. 공개 여부는 F-003과 별개다.
status: draft
updated: '2026-11-14'
tags:
- mawd
- feature
rag_include: true
generated:
  by: codex/gpt-6
  at: '2026-11-12T13:31:41+09:00'
source_priority: P1
proposed_phase: MVP
decision_status: proposed
work_status: in_progress
build_order: 3
depends_on:
- F-002
sources:
- id: candidates-request
  resource: /references/user-narration-candidates.md
  title: 작가 해설 후보와 비교 평가 요청
- id: candidates-spec
  resource: /specs/narration-evaluation.md
  title: 작가 해설 후보 실행과 비교 평가
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
---

# 목적과 첫 범위

11/13 최신 권고는 Liner를 통한 해설 초안 생성이다. 행사 전 임시 제공사와 행사 키 수령 후 실제 파트너 호출을 구분하며, 초안은 작가 검수 후에만 게시한다. [추천 모델/API](../research/recommended-stack.md).

현재 작품 자료와 관련 전시·작가 공통 자료로 한국어 해설 초안을 생성하는 제안이다. 공개 여부는 F-003과 별개다.

# 우선순위

- 사용자 원안: **P1**.
- 현재 구현 제안: **MVP**. 사용자 원안과 상세 설계 제안을 구분한다.
- 구현 상태: 진행 중. [후보 실행 모듈](../specs/narration-evaluation.md)은 구현됐으나 실제 DB·HTTP·검수 UI·승인 연결은 미구현이다. 앱 기능 전체 완료는 아니다.

# 수용 기준

1. 제공 근거를 식별 가능한 형태로 연결한 초안이 나온다.
2. 자료에 없는 작가 의도·생애·감정을 추가하지 않는다. 자료가 부족하면 보완할 항목을 알려준다.
3. 생성 중·완료·실패 상태를 표시하며 반복 클릭이 동일 작업을 중복 과금하지 않도록 한다.
4. 재생성은 기존 작가 수정본을 덮어쓰지 않고 새 초안으로 만든다.

# 제외 및 미결정

300~500자·30초 생성은 Notion 제안이며 확정 성능 보장 아님. 분량·지연 목표는 샘플 API 확인 후 정한다.

# 선행 조건

- [F-002 작가 자료·이미지·도록 입력](F-002-material-input.md)

# 근거와 연결

[사용자 원안](../references/user-mvp.md) · [사용자 추가 결정](../references/user-answers.md) · [기능명세 전체](../specs/functional-spec.md)

Notion F04는 작품별 기본 해설과 예상 Q&A, 전시 전체 예상 Q&A를 각각 초안으로 만든다. 인터뷰 없이 실행하며 결과와 근거를 F05 검수에 넘긴다. [D-017](../decisions/D-017-p0-feature-spec.md).
