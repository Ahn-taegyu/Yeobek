---
type: Reference
id: SRC-052
title: 관람 보완 요청의 Q&A 전환 제외
description: 원 질문 보존과 개인정보 문제를 고려해 이번 범위에서 관람 보완 요청의 Q&A 전환을 제외한 사용자 결정.
status: stable
updated: '2026-11-14'
tags: [yeobek, requirements, qa, privacy]
rag_include: false
generated:
  by: codex/gpt-6
  at: '2026-11-14T14:48:00+09:00'
sources:
- id: scope
  resource: /references/user-expected-qa-policy.md
  title: 예상 Q&A 생성·검수 정책
evidence: user-stated
---

# 질문과 답변

질문: 관람객의 보완 요청을 Q&A로 고칠 때 질문에 개인정보가 포함될 수 있습니다. 기존 관람 질문의 30일 보존 기간이 지나도 작가가 승인한 Q&A는 남아야 하므로, 원 질문을 그대로 복사하기보다 작가가 개인정보를 제거한 질문을 별도로 확인·저장한 뒤 재작성하도록 할까요?

사용자 답변: **이번에는 관람 보완 요청의 Q&A 전환을 제외**

# 적용 범위

관람 보완 요청을 대상 삼아 정정 근거나 Q&A 후보를 만드는 경로를 이번 MVP에서 제외한다. 작가 미리보기·기존 Q&A의 정정/재작성은 유지한다. 기존 보완 요청 조회와 재게시 후 확인·종료는 유지한다. 개인정보 제거 질문 편집 기능도 이번에 구현하지 않는다.
