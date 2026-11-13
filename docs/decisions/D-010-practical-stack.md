---
type: Decision
id: D-010
title: Render 제외와 사용자 경험을 위한 MVP 스택 권고
description: Render 제외와 MVP 스택 권고의 이력 및 후속 파트너 우선 결정.
status: draft
updated: '2026-11-14'
tags: [yeobek, architecture, voice]
rag_include: true
generated:
  by: codex/gpt-6
  at: '2026-11-13T02:02:31+00:00'
sources:
- id: partner-priority
  resource: /decisions/D-015-partner-priority.md
  title: 성능을 유지하는 파트너 API 우선
- id: user
  resource: /references/user-render-excluded.md
  title: 사용자 Render 제외와 추천 요청
- id: recommendation
  resource: /research/recommended-stack.md
  title: 현재 추천 스택·모델·API·검증 순서
decision_status: partial
decision_basis: user-constraint-and-recommendation
---

> **2026-11-14 후속 기준:** [D-015](../decisions/D-015-partner-priority.md)에 따라 해설·자료 정리·Q&A·평가·전사·합성은 Liner 경로를 우선 검토한다. 평가는 초안과 다른 모델 계열을 사용한다. EXAONE·OpenAI 직접 호출·Typecast는 비교 후보다. 구체 모델·권한·품질은 실측 전 미확정이며 아래 11/13 권고는 과거 기록이다. 운영 자동화의 스티비·채널톡·Alt는 이번 범위다.

# 현재 기준과 이전 권고

Render 제외는 사용자 제약이다. [D-015](D-015-partner-priority.md)에 따라 성능을 유지하는 범위에서 파트너 API를 우선한다. Liner는 해설·자료 정리·Q&A·평가·전사·합성의 우선 경로이며 평가는 초안과 다른 모델 계열을 쓴다. EXAONE·OpenAI 직접 호출·Typecast는 기능별 비교 후보다. 모델과 행사 키 권한·품질·지연·비용은 실측 전 미확정이다. 스티비·채널톡·Alt는 W8 운영 자동화 범위다.

11/13에는 OpenAI Q&A/STT, Liner 초안, Typecast TTS를 권고했다. 당시 비교 근거는 [추천 구성](../research/recommended-stack.md)에 보존한다. Next.js·Supabase 및 Render 제외는 유지한다. 미검증 모델 토큰을 먼저 공개하지 않고 답변을 검증한 뒤 전달한다.
