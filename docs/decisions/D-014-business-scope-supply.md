---
type: Decision
id: D-014
title: 사업안 1번 — 도슨트 공급 회사의 1인 운영
description: 사업안을 1번으로 확정한다. 공통 도슨트 우선과 거래 기능 제외는 유지하며 운영 자동화의 후속 확정 범위를 포함한다.
status: draft
updated: '2026-11-14'
tags: [yeobek, business, scope]
rag_include: true
generated:
  by: claude-code/claude-fable-5-2
  at: '2026-11-13T20:52:07+09:00'
decision_status: accepted
decision_basis: user-confirmed
sources:
- id: backend
  resource: /references/user-backend-completion.md
  title: 백엔드 완성 계획 요청 원문
- id: user
  resource: /references/user-business-scope.md
  title: 사업안 1번 확정
- id: previous
  resource: /decisions/D-001-business-scope.md
  title: 사업안 유보 결정(대체됨)
- id: overview
  resource: /product/overview.md
  title: 두 사업안 비교
---

# 결정 상태

**accepted** — [사용자 응답](../references/user-business-scope.md)으로 확정했다. [D-001](D-001-business-scope.md)의 “사업안 1/2는 미정”을 대체한다.

# 내용

사업안은 **1번: AI 도슨트를 제공하는 우리 회사를 한 명이 운영할 수 있게 만드는 사업**이다. 1인 운영의 주체는 우리 회사이고, AI 도슨트는 고객(작가·전시 운영자)에게 판매하는 핵심 서비스다. 우리 매출은 도슨트 서비스 이용료이며 고객의 입장료·작품 판매 대금과 구분한다.

# 유지되는 것

- 공통 도슨트 흐름(자료 입력 → 검수 → 글·음성 해설 → 게시 → 질의응답)을 먼저 완성한다는 D-001의 개발 순서.
- 입장권·작품 판매·구매 문의·결제는 개발 범위에 넣지 않는다. 2번의 거래 흐름은 채택하지 않았다.
- 인식 방식, 단일 채팅과 독립 입출력, 기술 스택 등 다른 확정 결정(D-002, D-006~D-013).

# 후속 확정 범위와 미구현

[후속 요청](../references/user-backend-completion.md)은 보완 요청 루프, 운영 집계 API, 추가 질문 생성과 W8 업무 자동화(스티비·채널톡·Alt)를 이번 범위에 포함했다. 자료 부족 질문의 최소 저장과 30일 보존은 [D-005](D-005-measurement.md)를 따른다. 이 범위는 구현 완료를 뜻하지 않는다. 작가 직접 가입은 마감 이후다. 세부 정책·제공사 권한과 품질은 검증이 필요하다.

지불 의향, 실제 사용 의향과 공급자 작업 시간은 검증되지 않았다.

# 영향

제품 설명과 시연은 “작가가 입력·승인하면 운영자의 수작업 없이 도슨트가 제공된다”를 중심으로 구성한다. 구현 상태는 [작업 추적](../specs/backend-completion.md)을 따른다.
