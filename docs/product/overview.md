---
type: Product
id: P-001
title: 제품 방향과 사업 가설
description: 확정한 1안과 비교 기록인 2안, 공통 도슨트 가치를 정의한다.
status: draft
updated: '2026-11-13'
tags:
- mawd
rag_include: true
generated:
  by: codex/gpt-6
  at: '2026-11-12T14:12:26+09:00'
sources:
- id: user
  resource: /references/user-mvp.md
  title: 최신 사용자 MVP 우선순위
- id: notion
  resource: /references/notion-planning.md
  title: 수정 중인 Notion 기획
- id: track
  resource: /references/track-conversation.md
  title: AI도슨트 트랙 비교 대화
- id: answers
  resource: /references/user-answers.md
  title: 사용자 추가 응답
- id: chat
  resource: /references/user-chat-interaction.md
  title: 사용자 통합 채팅·입출력 모드 요구
decision_status: proposed
---

# 한 문장 제품 정의

**작가 자료를 검수·승인하면, 관람객이 하나의 채팅에서 작품 해설과 질문을 텍스트·음성으로 주고받는 AI 도슨트.** 입력과 출력 모드는 각각 선택한다. 사용자는 사업안 1/2 선택을 유보하고 공통 도슨트부터 개발하기로 했다. [D-001](../decisions/D-001-business-scope.md), [D-006](../decisions/D-006-interaction.md).

# 두 사업안

| 구분 | 1안 — 도슨트 공급 회사 자동화 | 2안 — 작가의 전시 사업 자동화 |
| --- | --- | --- |
| 1인 운영 주체 | 우리 회사 | 작가·독립 기획자 |
| 고객 | 작가·전시 운영자·소규모 공간 | 직접 전시를 운영하는 작가·기획자 |
| 핵심 흐름 | 접수 → 정리 → 검수 → 게시 → 응대 | 전시 개설 → 관람 안내 → 예매 또는 작품 문의·거래 → 후속 관리 |
| 도슨트 | 판매하는 핵심 서비스 | 작품 설명과 거래 문의를 잇는 기능 |
| 우리 매출 | 서비스 이용료 | 운영 서비스 이용료, 검증 후 수수료 후보 |
| 검증 | 셀프서비스·지불 의향·공급자 작업 시간 | 거래 업무 수요·문의 전환·운영 시간 |
| 첫 MVP 제안 | 제작·배포 흐름 집중 | 거래 흐름 별도 검증 후 확장 |

11/12에는 사업안을 유보하고 공통 기능을 우선했다([추가 응답](../references/user-answers.md)). **11/13에 사용자가 1안을 확정했다**([D-014](../decisions/D-014-business-scope-supply.md)). 2안의 거래 흐름은 채택하지 않았고 위 표의 2안은 비교 기록으로 남긴다. 1안의 검증 항목은 아직 미검증이다. 작품 판매액·입장료는 고객 매출이며 SaaS 매출과 구분한다.

# 사용자와 가치

- 작가: 반복 설명을 줄이고 작품 의도를 본인 말에 가깝게 전달.
- 관람객: 설치·가입 없이 한 채팅에서 작품을 찾고, 상황에 맞게 입력과 출력의 글/음성을 따로 선택해 해설과 질문을 이어감.
- 공급 회사: 고객별 별도 제작 없이 같은 절차로 서비스 제공.

# 증거의 한계

과거 대화는 작가의 설명 부담 피드백을 언급하나 직접 인터뷰 기록·표본은 없다. Notion은 고객 가설을 미검증으로 분류한다. '초기 정성 신호의 간접 기록'까지만 인정한다.[^track][^notion]

전시 과금·갤러리 구독·지원사업 패키지는 후보이다. Notion의 39,000원·99,000원 가격, 매출 전망, 30분 완성은 가정이다. 경쟁 부재·최신 요금·시장 통계는 이번 작업에서 원출처를 재검증하지 않았다.

[^track]: [트랙 비교 대화](../references/track-conversation.md).
[^notion]: [Notion 초안](../references/notion-planning.md).
