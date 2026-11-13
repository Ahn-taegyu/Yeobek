---
type: Decision
id: D-015
title: 성능을 유지하는 파트너 API 우선
description: 기능별 파트너 경로 우선과 실측 기반 제공사 선택.
status: draft
updated: '2026-11-14'
tags: [yeobek, backend, automation]
rag_include: true
generated:
  by: codex/gpt-6.1-terra
  at: '2026-11-14T02:24:28+09:00'
decision_status: accepted
decision_basis: user-confirmed
sources:
- id: request
  resource: /references/user-backend-completion.md
  title: 백엔드 완성 계획 요청 원문
---

# 결정

[사용자 요청](../references/user-backend-completion.md)에 따라 성능을 희생하지 않는 범위에서 행사 파트너 API를 우선한다. 제품 AI는 해설·자료 정리·Q&A·평가·전사·합성에 Liner 경로를 우선 검토하고, 평가는 초안과 다른 모델 계열을 사용한다. 운영 자동화에는 스티비·채널톡·Alt를 포함한다.

# 선택과 검증

구체 모델과 최종 경로는 **proposed**이며 행사 키 권한, 공식 계약과 실호출, 품질·지연·비용 및 사람 평가로 확인한다. EXAONE·OpenAI 직접 호출과 Typecast는 기능별 비교 후보다. 성능 기준에 미달하거나 권한이 없으면 근거를 기록하고 해당 기능만 대안으로 전환한다. 요청마다 제공사를 자동 전환하지 않는다. 파트너 우선은 실제 접근이나 품질 검증 완료를 뜻하지 않는다.
