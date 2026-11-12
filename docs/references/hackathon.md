---
type: Reference
id: SRC-004
title: MAWD 해커톤 제약
description: 공식 모집 페이지에서 확인한 일정과 트랙 2 요건.
status: draft
updated: '2026-11-12'
tags:
- mawd
rag_include: true
generated:
  by: codex/gpt-6
  at: '2026-11-12T14:38:57+09:00'
sources:
- id: luma
  resource: https://luma.com/ml5gw54p
  title: MAWD 공식 모집
- id: direction
  resource: /references/user-build-direction.md
  title: 사용자 최신 개발 방향
evidence: official-page
resource: https://luma.com/ml5gw54p
---

# 확인한 내용

2026-11-12 조회한 모집 페이지의 행사 일정은 **2026-11-14 16:40 ~ 2026-11-15 06:30, 서울**이다. 트랙 2는 파트너 API 또는 데이터를 핵심에 활용하는 1인 운영 AI 자동화 SaaS를 요구한다. PRD·디자인·마케팅·시장 검증·피칭도 결과물에 포함된다.[^luma]

# 미확인

공식 모집 페이지에는 **Render가 파트너로 포함**되어 있다. 다만 Render 크레딧의 금액·유효기간·적용 서비스·결제 조건은 공개 페이지에서 확인하지 못했다. 파트너 등재와 무료 서버 제공 확정을 구분한다. [호스팅 조사](../research/nextjs-hosting.md)

공개 페이지로는 세부 사용 의무를 확정하지 못했으나, [사용자 전달 규칙](user-answers.md)으로 **제공 API 최소 한 개 이상 필수·행사 당일 키 제공**을 확인했다. 이후 사용자는 [사전 개발 가능](user-build-direction.md)을 확인했다. 평가별 배점·키/크레딧 세부 제한은 미확인이다. 행사 종료와 정확한 제출 시각을 같다고 단정하지 않는다.

# 적용

같은 절차로 신규 전시를 생성·승인·게시하는 장면을 준비한다. Notion의 6~8주는 행사 데모 일정에 적용하지 않는다. [진행 계획](../product/delivery-plan.md), [필수 확인](../decisions/D-003-delivery-constraints.md).

[^luma]: [MAWD 공식 모집 페이지](https://luma.com/ml5gw54p).
