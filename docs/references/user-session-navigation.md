---
type: Reference
id: SRC-061
title: 같은 세션에서 페이지 이동 시 미리 불러온 데이터 사용
description: 페이지 전환이 느린 문제를 개선하고 변경이 없는 동안 미리 읽은 화면 데이터를 재사용한다.
status: stable
updated: '2026-11-14'
rag_include: false
generated:
  by: codex/gpt-6
  at: '2026-11-14T20:42:54+09:00'
evidence: user-stated
---

# 사용자 요청

> 페이지 넘어갈 때 로딩시간이 긴 문제를 해결해줘. 아마 같은 세션임에도 매번 로딩해서 그런 것 같아. 한 세션에서 변경이 없다면 미리 로딩된 페이지로 바로 넘어가도록 해.

[작가 화면 이동과 조회](../specs/frontend-handoff.md#작가-화면-이동과-조회)에 반영한다.
