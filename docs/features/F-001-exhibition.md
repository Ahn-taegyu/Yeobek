---
type: Feature
id: F-001
title: 전시 개설·작가 접근
description: 사전 생성 작가 계정으로 자기 전시의 기본 정보와 작품을 관리한다. 관람객은 로그인하지 않는다.
status: draft
updated: '2026-11-12'
tags:
- mawd
- feature
rag_include: true
generated:
  by: codex/gpt-6
  at: '2026-11-12T13:31:41+09:00'
source_priority: prerequisite
proposed_phase: MVP
decision_status: proposed
work_status: not_started
build_order: 1
depends_on: []
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

작가가 자기 전시의 제목·기간·장소를 저장하고 작품을 관리한다. [D-008](../decisions/D-008-technology-stack.md)에 따라 사전 생성 이메일/비밀번호 계정으로 시작하며 관람객은 로그인하지 않는다. 화면 SC-A01~A03과 필수 입력·공개 작가명·저장 충돌의 상세 제안은 [기능명세 v1.0](../specs/functional-spec.md)을 따른다.

# 우선순위

- 사용자 원안: **prerequisite**.
- 현재 구현 제안: **MVP**. 사용자 원안과 상세 설계 제안을 구분한다.
- 구현 상태: 미착수. 이 문서는 기능명세이며 앱 구현 완료 표시가 아니다.

# 수용 기준

1. 전시 ID가 생성되고 새로 열어도 초안이 보존된다.
2. 전시 소유자만 자료·승인·게시를 변경할 수 있다. 다른 전시 ID를 직접 요청해도 수정·원자료 열람이 차단된다.
3. 제목 필수, 기간 역전·누락은 필드 오류로 표시하며 장소·기간 미정은 초안 저장 가능하다.

# 제외 및 미결정

복잡한 조직·갤러리 다중 역할·SSO·청구는 후속. 소유권 검사를 생략한 공개 관리자 페이지는 수용하지 않는다.

# 선행 조건

없음. 팀·자료·API 제약을 먼저 확인한다.

# 근거와 연결

[사용자 원안](../references/user-mvp.md) · [사용자 추가 결정](../references/user-answers.md) · [기능명세 전체](../specs/functional-spec.md)
