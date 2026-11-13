---
type: Decision
id: D-010
title: Render 제외와 사용자 경험을 위한 MVP 스택 권고
description: Render 제외는 반영하고 Vercel·Supabase·OpenAI Q&A/STT·Liner 초안·Typecast TTS를 조건부 권고한다.
status: draft
updated: '2026-11-13'
tags: [yeoback, architecture, voice]
rag_include: true
generated:
  by: codex/gpt-6
  at: '2026-11-13T02:02:31+00:00'
sources:
- id: user
  resource: /references/user-render-excluded.md
  title: 사용자 Render 제외와 추천 요청
- id: recommendation
  resource: /research/recommended-stack.md
  title: 현재 추천 스택·모델·API·검증 순서
decision_status: partial
decision_basis: user-constraint-and-recommendation
---

# 확정과 제안

**확정된 제약:** 사용자 최신 안내에 따라 Render를 행사 지원 후보에서 제외한다.

**권고안:** Next.js 통합 앱·Vercel·Supabase를 기반으로, 관람 Q&A와 STT는 OpenAI, 해설 초안 제작은 Liner, 낭독은 Typecast를 권고한다. 유료 플랜·Typecast 목소리·행사 키의 허용 모델·실제 지연은 아직 미결정/미검증이다. 그래서 이 문서는 partial이며 새로운 모델/호스트를 사용자가 승인했거나 도입 완료했다고 표시하지 않는다.

# 이전 안과 달라지는 점

- [D-009](D-009-stack-review.md)의 Render 지원 확인 대기를 제거한다.
- [D-008](D-008-technology-stack.md)의 Liner Q&A를 OpenAI 직접 호출로 바꾸도록 제안한다. 이미 보유한 키로 관람 품질을 행사 전에 시험하기 위해서다. Liner는 전시 개설의 핵심인 해설 초안 자동화에 실제로 사용한다.
- TTS는 종료 예정인 OpenAI 모델을 장기 기본값으로 두지 않고 Typecast를 우선 검증한다. 실패 시 기존 OpenAI TTS는 이번 시연의 단기 대안이다.
- 기본 해설은 사전 생성·검수·재사용, 질문 답변은 확정 글을 먼저 표시하고 음성을 이어 재생한다. LLM의 미검증 토큰을 먼저 노출하는 스트리밍으로 바꾸지 않는다.
- Next.js와 DB는 유지한다. 무료 PostgreSQL 직접 운영·Live 통화·OCR·이미지 분석·벡터 검색을 이번 일정에 추가하지 않는다.

모델 ID·API·호스팅 비용·모바일 재생·검증 순서는 [추천 구성](../research/recommended-stack.md)에 모았다. 현 단계는 기획 갱신이며 제품 구현 상태는 바꾸지 않는다.
