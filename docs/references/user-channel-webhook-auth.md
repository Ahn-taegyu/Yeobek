---
type: Reference
id: SRC-036
title: 채널톡 문의 웹훅 인증 선택
description: 채널톡 수신 연결 방식에 관한 사용자 응답.
status: stable
updated: '2026-11-14'
tags: [yeobek, automation, channeltalk]
rag_include: false
generated:
  by: codex/gpt-6.1-terra
  at: '2026-11-14T11:54:00+09:00'
sources:
- id: backend
  resource: /references/user-backend-completion.md
  title: 백엔드 완성 계획 요청 원문
---

# 사용자 원문

> 공식 웹훅 직접 연결: 토큰 인증으로 간단하게 구현 (추천)

# 반영 범위

채널톡 기존 Open API 웹훅의 URL 토큰 인증을 수신에 선택했다. 발신은 별도의 AppStore Native API를 유지한다. 실제 제공사 설정과 통합 검증은 별도다.
