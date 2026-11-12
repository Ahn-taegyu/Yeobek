---
type: Template
id: TPL-002
title: 결정 노트 템플릿
description: 확정 근거와 미결정을 기록하는 양식.
status: draft
updated: '2026-11-12'
tags:
- mawd
rag_include: false
generated:
  by: codex/gpt-6
  at: '2026-11-12T14:38:57+09:00'
sources: []
---

# 사용

복사 후 type을 Decision, id를 새 D-번호, rag_include를 true로 바꾼다. decision_status는 처음 open 또는 proposed다.

# 질문

결정해야 하는 문제와 필요한 시점을 쓴다.

# 선택지와 제안

각 선택이 범위·일정·검증에 미치는 영향을 적는다.

# 결정과 근거

사용자 확정 또는 명시적으로 위임받아 채택한 선택의 근거를 연결하고 해당 범위만 accepted로 바꾼다. 위임한 구현 선택은 decision_basis: delegated-selection을 기록한다. 실험 성공·개별 벤더 선택을 사용자의 직접 발언처럼 기록하지 않는다. verified는 실제 검증 이력에만 사용한다.

# 영향

변경할 기능·명세·우선순위 문서를 연결한다.
