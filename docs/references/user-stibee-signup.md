---
type: Reference
id: SRC-059
title: Preview 가입 인증 메일을 스티비로 발송
description: 테스트 Supabase와 Vercel Preview에서 스티비 자동 이메일로 가입 코드를 받는다.
status: stable
updated: '2026-11-14'
rag_include: false
generated:
  by: codex/gpt-6
  at: '2026-11-14T19:18:00+09:00'
evidence: user-stated
---

# 사용자 요청

> 그럼 SMTP 대신 스티비로 가입 인증 연동해줘. Preview에 배포해서 실제 코드 수신부터 로그인, 작가 프로필 표시까지 확인하고 내가 직접 설정해야 할 것만 알려줘.

# 반영 범위

[가입 인증 배포 절차](../specs/api-contract.md#preview-스티비-가입-인증)는 전용 발송 주소록, 테스트 Supabase Auth 훅, Vercel Preview 설정과 실제 수신 검증을 다룬다.
