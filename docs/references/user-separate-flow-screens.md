---
type: Reference
id: SRC-069
title: 정보·학습, 인터뷰, 검토를 별도 화면으로 나누는 요청
description: 전시 작성의 세 절차를 각각 다른 화면으로 구분하라는 사용자 지시.
status: stable
updated: '2026-11-15'
tags: [yeobek, requirements, author-experience]
rag_include: false
generated:
  by: claude/opus-5.5
  at: '2026-11-15T00:00:00+09:00'
sources: []
evidence: user-stated
---

# 사용자 요청

> 1. 처음 정보 입력하고 "학습시키기"를 누르는 화면
> 2. 인터뷰 화면
> 3. 검토 화면
>
> 이 다 따로 구분된 절차의 화면이어야 해

# 배경

[SRC-068](user-training-interview-review-order.md)에 따라 순서를 바꾼 첫 구현은 학습 화면 한 곳에 학습, 작품별 인터뷰 목록, 검토 링크를 모두 표시했다. 로컬 확인 후 사용자가 세 절차를 화면 단위로 나누라고 지시했다.
