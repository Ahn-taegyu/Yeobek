---
type: Reference
id: SRC-072
title: AI 정보 검색 방식 점검과 관람 근거 선택 개선 요청
description: 기획 검색과 제품 근거 검색의 부족한 점, Codex 기록 확인 요청과 제품 근거 검색 우선 선택.
status: stable
updated: '2026-11-15'
rag_include: false
generated:
  by: claude-code/claude-opus-5-5
  at: '2026-11-15T03:40:00+09:00'
sources: []
---

# 사용자 요청

> AI 정보 정리 및 검색 방식 업데이트 해야 해 현재 부족한 점과 codex 테스트 및 작업 기록 확인해

기획 문서 검색(`docs/tools/kb.py`)과 관람 근거 선택(`selectEvidence`)의 부족한 점을 보고한 뒤, 어느 쪽을 먼저 고칠지 묻자 다음과 같이 답했다.

> 제품 AI 근거 검색

작업 중 세션 모델이 바뀐 것을 반영하라는 지시도 받았다.

> 모델 바뀐거 적용해서 해

결과는 [관람 근거 선택 개선 측정](../research/visitor-evidence-selection.md)에 기록한다. 기획 문서 검색의 개선은 이번 범위에 포함하지 않았다.
