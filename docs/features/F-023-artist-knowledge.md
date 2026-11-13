---
type: Feature
id: F-023
title: AI용 작가·전시·작품 연결 지식 저장
description: 작가 입력을 DB 원본의 내부 위키 문서로 나누고 관계·출처·승인 범위를 보존한다.
status: draft
updated: '2026-11-13'
tags: [yeobek, feature, knowledge]
rag_include: true
generated:
  by: codex/gpt-6
  at: '2026-11-13T02:37:18+00:00'
source_priority: prerequisite
proposed_phase: MVP
decision_status: accepted
work_status: in_progress
build_order: 2
depends_on:
- F-001
sources:
- id: implementation
  resource: /specs/development-foundation.md
  title: 실제 내부 지식 저장 기반
- id: decision
  resource: /decisions/D-011-knowledge-and-screens.md
  title: 사용자 확정 내부 지식·화면 요구
- id: spec
  resource: /specs/artist-knowledge.md
  title: 내부 지식 저장과 검색 계약
---

# 목적과 첫 범위

개발 상태: DB 원본의 주체별 문서와 연결 범위·revision 검사, 초안 조회/수정 API를 구현했다. 검수·승인·게시된 근거 재사용 및 철회는 후속이다. [개발 기반 현황](../specs/development-foundation.md).

일반 작가·전시·작품 입력 폼의 정보를 AI가 읽을 문서 단위로 정리해 DB에 저장한다. 작가 공통 정보는 전시마다 독립 원본으로 복제하지 않고 연결한다. 문서 본문·관계·출처·버전은 내부 구조이며 사용자에게 위키 편집기를 요구하지 않는다.

최초 MVP 목록에 없던 후속 사용자 요구이므로 원안 우선순위는 prerequisite로 기록한다. 요구는 accepted이지만 구체 테이블·UI 배치·검증 절차는 연결 명세의 제안이다.

# 수용 기준

1. 작가 정보와 전시 정보가 서로 다른 문서 ID로 저장되고 동일 소유자의 관계로 연결된다. 작품은 소속 전시와 연결된다.
2. 작가 홈에서 공통 정보를 수정하고 여러 전시에서 재사용할 수 있다. 전시 기록은 이 서비스에 저장한 전시 목록이며 관람 분석을 뜻하지 않는다.
3. 본문에 입력 출처와 파일·쪽수·문서 revision을 연결한다. 해설 생성 결과가 작가 입력 원본을 덮어쓰지 않는다.
4. 위키 연결만으로 공개하거나 다른 전시의 근거를 검색하지 않는다. 관람 RAG는 해당 전시에서 승인·게시한 근거 버전만 사용한다.
5. 작가 공통 정보를 수정해도 기존 전시 공개본은 유지한다. 공개 근거 철회는 이를 참조하는 다른 전시에도 적용한다.
6. 일반 입력·검수 화면에서 자기 정보와 사용 근거를 확인·수정한다. 별도 위키 화면을 만들어야 이 기능이 완료되는 것은 아니다.

# 범위와 연결

세부 저장 계약은 [SPEC-010](../specs/artist-knowledge.md), 화면은 SC-A02~A05, 업무는 OP-21~22와 OP-07~10, 수용 시나리오는 UC-17이다. Markdown 파일 동기화·Obsidian 연동·전체 그래프 편집·AI 자동 위키 작성은 이번 구현 범위에 추가하지 않는다.
