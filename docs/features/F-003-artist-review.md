---
type: Feature
id: F-003
title: 공개 근거·해설 작가 검수
description: 작가가 공개 가능한 근거와 생성 해설을 확인·수정·승인한다. 원본 파일 업로드 자체는 승인으로 취급하지 않는다.
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
work_status: not_started
build_order: 4
depends_on:
- F-002
- F-004
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
---

# 목적과 첫 범위

작가가 공개 가능한 근거와 생성 해설을 확인·수정·승인한다. 원본 파일 업로드 자체는 승인으로 취급하지 않는다.

11/13 보완안: 기존 근거 검수 영역에서 AI가 참고할 작가 공통/전시 공통/작품 자료와 출처·사용 버전·공개 승인 여부를 구분한다. 정정은 원래 입력 화면으로 연결한다. 별도 전체 위키 화면은 MVP에 추가하지 않는다. 작가 공통 근거 철회는 참조하는 모든 전시·작품에 적용한다. [내부 지식 계약](../specs/artist-knowledge.md).

# 우선순위

- 사용자 원안: **P1**.
- 현재 구현 제안: **MVP**. 사용자 원안과 상세 설계 제안을 구분한다.
- 구현 상태: 미착수. 이 문서는 기능명세이며 앱 구현 완료 표시가 아니다.

# 수용 기준

1. 초안과 근거 발췌를 나란히 확인하고 잘못된 문장을 수정할 수 있다.
2. 근거별 공개 여부와 해설 버전을 구분해 승인한다. 비공개 원본을 통째로 관람객에게 노출하지 않는다.
3. 승인 행위는 작가·시각·버전에 묶인다. 수정된 버전은 재승인 전 공개되지 않는다.
4. 자료의 공개 철회는 관련 Q&A 검색·캐시에서 즉시 제외한다. [기능명세 v1.0의 BR-07](../specs/functional-spec.md#br-07-중지철회삭제)에 따라 철회 버전을 참조하는 모든 활성 작품을 중지하고 영향 범위를 표시하는 상세안을 적용한다.

# 제외 및 미결정

모든 실시간 질문 답변을 작가가 사전 승인하는 기능은 아니다. Q&A는 승인 근거를 사용하며 F-006 통제를 따른다.

# 선행 조건

- [F-002 작가 자료·이미지·도록 입력](F-002-material-input.md)
- [F-004 작품별 글 해설 생성](F-004-text-generation.md)

# 근거와 연결

[사용자 원안](../references/user-mvp.md) · [사용자 추가 결정](../references/user-answers.md) · [기능명세 전체](../specs/functional-spec.md)

Notion F05는 예상 Q&A와 해설 검수, 작가 전용 미리보기의 답변별 정확성 평가·정정을 관리한다. 수정 후 승인한 버전은 게시를 거쳐 F08이 사용한다. [D-017](../decisions/D-017-p0-feature-spec.md).
