---
type: Reference
id: SRC-042
title: 작가 가입 이메일 인증과 비밀번호 최소 길이 결정
description: W9 작가 직접 가입의 이메일 인증 필수와 가입 비밀번호 최소 8자를 선택한 사용자 답변.
status: stable
updated: '2026-11-14'
tags: [yeobek, authentication, requirements]
rag_include: false
generated:
  by: codex/gpt-6
  at: '2026-11-14T12:21:18+09:00'
sources:
- id: artist-auth
  resource: /decisions/D-016-artist-auth.md
  title: 작가 직접 회원가입과 로그인 선택 진입
- id: direct-login
  resource: /references/user-auth-direct-login.md
  title: 가입 후 직접 로그인 확정
evidence: user-stated
---

# 사용자 답변

W9 가입의 이메일 인증 필수 여부를 묻고, 가입 직후 자동 로그인 없이 사용자가 직접 로그인한다고 안내했다. 사용자는 다음과 같이 답했다.

> 이메일 인증 필수

가입 비밀번호의 최소 길이와 추가 강도 규칙, 비밀번호 재설정, 세션 수명의 기준을 물었다. 사용자는 다음과 같이 답했다.

> 8자 이상

# 반영 범위

신규 작가 가입에는 이메일 인증과 비밀번호 최소 8자를 적용한다. 이메일 인증 이후에는 기존에 합의한 직접 로그인 흐름을 적용한다. 추가 강도 규칙, 비밀번호 재설정, 인증 메일 재발송 방식, 세션 수명은 미결정이다.
