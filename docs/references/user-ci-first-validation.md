---
type: Reference
id: SRC-035
title: CI 검사와 로컬 검증 중복 최소화
description: GitHub CI에서 실행하는 검사는 로컬에서 최소화하라는 최신 사용자 지시.
status: stable
updated: '2026-11-14'
tags: [yeobek, collaboration, ci]
rag_include: false
generated:
  by: codex/gpt-6-astra
  at: '2026-11-14T11:32:16+09:00'
sources:
- id: prior
  resource: /references/user-git-lifecycle-delegation.md
  title: Git 작업 시점과 병합 판단 위임
---

# 사용자 원문

> 깃허브 CI로 체크되는 것들은 로컬에서 최소화 해

# 반영 범위

전체 lint·타입 검사·단위/DB/HTTP 회귀·프로덕션 빌드·문서 회귀는 최신 head의 CI 결과를 기본 근거로 사용한다. 로컬은 편집 중 오류를 빨리 찾는 좁은 검사, 실패 재현, 기존 DB의 전진 migration과 실제 화면 등 CI가 대신하지 못하는 검증으로 한정한다. 기존 백엔드 계획의 매 묶음 전체 로컬 검사보다 이 최신 지시를 우선한다.

서브에이전트 diff 직접 검토와 피드백은 유지한다. 부모는 필요한 좁은 회귀를 직접 확인하며 같은 검사를 모든 작업자와 CI에서 일률적으로 반복하지 않는다. CI가 실패하거나 시작되지 않아도 무조건 전체 로컬 검사를 대신 돌리지 않고 원인을 확인한 뒤 필요한 범위만 실행한다. 병합에 필요한 최신 CI는 우회하지 않는다.
