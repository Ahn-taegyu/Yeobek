---
type: Reference
id: SRC-046
title: v3 작품 소개 수정·AI 미리보기·시험용 해설 후속 결정
description: A4·A7·R2 확인 질문에 대한 사용자 후속 답변.
status: stable
updated: '2026-11-14'
tags: [yeobek, requirements, review, publication]
rag_include: false
generated:
  by: codex/gpt-6
  at: '2026-11-14T13:16:00+09:00'
sources:
- id: prior
  resource: /references/user-v3-decisions.md
  title: v3 온보딩·입력·화면 범위와 Vercel Hobby 답변
evidence: user-stated
---

# 사용자 답변

- A4: 기본 미리 생성되는 작품 소개는 직접 수정 가능, 나머지는 지시문을 통한 수정(ex: "내가 00을 그렇게 그린건 그런 이유가 아니라 00 때문이야.")
- A7: 기본 해설 원고와 AI 미리보기를 별도 화면으로 제공
- R2: 시험용 해설은 개발 시연만 허용, 운영 게시 차단

# 반영 범위

직접 편집 가능한 작품 소개와 지시문으로 다시 생성하는 답변을 구분한다. 기본 해설 원고 검수와 작가용 AI 미리보기는 별도 화면이다. 시험용 해설의 운영 게시 차단은 구현·검증이 필요한 요구다.
