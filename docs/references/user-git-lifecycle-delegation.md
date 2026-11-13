---
type: Reference
id: SRC-034
title: Git 작업 시점과 병합 판단 위임
description: 검토 가능한 작업 단위의 commit·push·PR·병합과 중복 검증 절감에 관한 사용자 요청.
status: stable
updated: '2026-11-14'
tags: [yeobek, collaboration, git]
rag_include: false
generated:
  by: codex/gpt-6-astra
  at: '2026-11-14T02:27:27+09:00'
sources:
- id: prior
  resource: /references/user-development-start.md
  title: MVP 개발 착수 및 협업 규칙 요청
---

# 사용자 원문

> 특정 수준의 작업을 했을 때 commit, push, PR, merge를 해야 할 지 정해서 규칙으로 만들고 merge판단도 알아서 진행해줘.

이어진 요청:

> github 작업을 너무 보수적으로 자주 하거나 비효율적으로 밚거나 중복되는 테스트를 하지 않도록 해줘.

# 반영 범위

[협업 규칙](../collaboration.md)에 작업 단계별 기준과 병합 판단 위임을 반영한다. 검증된 범위의 Git 작업은 별도 재승인 없이 수행하고, 기존 검사 결과를 변경 범위·커밋·환경과 함께 재사용한다. 병합 권한 위임은 저장소 보호 정책 우회나 원격 권한 변경, 공유 DB 초기화 또는 운영 배포를 뜻하지 않는다. 실제 구현 범위와 남은 검증을 PR에 명시한다.
