---
type: Decision
id: D-012
title: 제품 AI의 지침·스킬·도구를 버전 관리하는 플러그인
description: API 어댑터 위에 작업별 절차와 검증 기준을 조합하는 제품 실행 구조를 둔다.
status: draft
updated: '2026-11-13'
tags: [yeobek, ai, plugin]
rag_include: true
generated:
  by: codex/gpt-6
  at: '2026-11-13T19:05:00+09:00'
decision_status: accepted
decision_basis: user-confirmed
sources:
- id: user
  resource: /references/user-plugin-quality.md
  title: 사용자 플러그인·일관성 요구
- id: spec
  resource: /specs/product-ai-plugin.md
  title: 제품 플러그인과 품질 기준
---

# 확정된 방향

제품 AI는 공통 지침, 업무별 스킬, 범위가 제한된 도구, 출력 검사와 평가를 함께 관리하는 플러그인 구조를 사용한다. 위키 검색, 자연스럽고 격식 있는 관람객 응대, 작가 자료 정리·저장에 적용한다.

기존 서버 호출 제한과 공개 범위 검사를 유지한다. 사용자 메시지나 위키 내용이 업무 권한을 바꾸지 않는다. 작가 원문·공개 승인과 AI 후보를 구분한다.

# 구현 판단과 미결정

이번 구현은 저장소에 포함되는 Yeobek 전용 내부 패키지다. Cursor/Codex 마켓플레이스에 설치하는 플러그인과 호환된다고 주장하지 않는다. Markdown 스킬을 정적 TypeScript로 묶고 해시를 기록하는 방식은 구현 판단이다. 모든 품질 차원을 자동으로 완벽하게 평가할 수 있다고 확정하지 않는다.

[다중 후보·평가·문맥 계승](../research/candidate-selection.md)은 사용자 검토 제안에 대한 후속 설계다. 후보 수, 점수 하한, 재생성 예산은 아직 실제 비교 평가로 선택하지 않았다.
