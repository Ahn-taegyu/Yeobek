---
type: Reference
id: SRC-011
title: 사용자 음성·데이터·호스팅 재검토 요청
description: Live 음성과 한국어 TTS, Supabase 확장성, Next.js 통합 서버 및 무료 PostgreSQL 직접 운영 검토.
status: stable
updated: '2026-11-12'
tags: [mawd, research]
rag_include: true
generated:
  by: codex/gpt-6
  at: '2026-11-12T06:02:54+00:00'
evidence: user-message
---

# 요청과 해석

사용자는 기존 스택 선정 후 다음을 조사하도록 요청했다.

- GPT Live 또는 Gemini Live의 도슨트 음성 적용 적합성.
- 한국어가 더 자연스러운 다른 TTS 후보.
- Supabase에서 고화질 작품 이미지·큰 PDF·많은 작가와 작품을 다룰 때의 단점.
- Next.js로 프런트와 백을 통합할 때의 단점.
- Vercel 이외 무료 호스팅과 대회에서 제공하는 옵션.

이어 “무료 서버에 postgresDB로 호스팅하는 방법도 있어”라고 대안을 추가했다. **무료 VM에서 PostgreSQL을 직접 운영하는 안까지 비교**한다. 특정 호스트로 변경하라는 확정 지시로 해석하지 않는다.

이번 요청은 조사와 기획 보완이다. 계정 생성·유료 구독·API 키 사용·서버 배포는 수행하지 않았다. 기존의 한 채팅·독립 입출력 네 조합·작가 승인 근거·일요일 마감 조건을 유지한다.

결과: [음성](../research/voice-options.md), [DB·파일·직접 운영](../research/storage-and-postgres.md), [Next.js·호스팅](../research/nextjs-hosting.md), [변경 제안 D-009](../decisions/D-009-stack-review.md).
