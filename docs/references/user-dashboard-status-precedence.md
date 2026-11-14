---
type: Reference
id: SRC-048
title: 미공개 전시의 준비중 분류 우선
description: 종료 시각이 지났어도 미공개 전시를 준비중으로 분류하는 사용자 결정.
status: stable
updated: '2026-11-14'
tags: [yeobek, requirements, dashboard]
rag_include: false
generated:
  by: codex/gpt-6
  at: '2026-11-14T13:35:00+09:00'
sources:
- id: prior
  resource: /references/user-v3-decisions.md
  title: v3 홈 상태 기준
evidence: user-stated
---

# 질문과 답변

질문: W10 홈에서 ‘미공개인데 종료 시각이 지난 전시’는 어느 탭에 둘까요? 현재 정해주신 준비중·종료 기준이 이 경우 겹칩니다.

사용자 답변: **미공개는 준비중 우선 (추천)**

이 결정은 공개 여부와 기간 상태를 별도 응답으로 보존하는 설계와 함께 적용한다. 기간에 따라 자동 게시하거나 공개를 중지한다는 뜻이 아니다.
