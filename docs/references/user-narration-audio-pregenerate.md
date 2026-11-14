---
type: Reference
id: SRC-071
title: 기본 소개 음성 항상 미리 생성 요청
description: 관람객이 기본 소개 음성을 기다리지 않도록 게시 시점에 항상 음성을 미리 만들라는 사용자 지시.
status: stable
updated: '2026-11-15'
tags: [yeobek, requirements, voice, publication]
rag_include: false
generated:
  by: claude/opus-5.5
  at: '2026-11-15T00:00:00+09:00'
sources: []
evidence: user-stated
---

# 사용자 요청

> 기본 소개 답변 미리 생성해두기로 했는데 늦어지는 이유가 음성 때문이야?
>
> 이 데모에서만이 아니라 항상 미리 생성해

# 배경과 해석

배포된 반 고흐 시연은 기본 소개 글만 공개되고 음성이 없어(`audio: null`), 관람객이 들을 때마다 TTS를 새로 만들어 첫 재생에 약 25초가 걸렸다. 작가 화면은 승인 해설의 음성 생성(`POST /api/admin/artworks/{id}/audio`)을 호출하지 않았다.

이 요청에 따라 게시할 때마다 선택한 작품의 현재 승인 해설 음성을 먼저 준비하고 공개본에 함께 묶는다. [SRC-055](user-visitor-tts-publication-policy.md)의 "저장 음성은 게시 필수가 아니다"는 유지한다. TTS가 설정되지 않았거나 실패하면 글 게시는 막지 않는다.
