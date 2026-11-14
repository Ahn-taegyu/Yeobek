---
type: Reference
id: SRC-074
title: 인증 코드를 받은 적 있는 이메일도 다시 받기
description: 이전 가입 시도로 미인증 계정이 남은 이메일로 다시 가입하면 새 인증 코드를 보내라는 사용자 요청.
status: stable
updated: '2026-11-15'
tags: [yeobek, authentication, requirements]
rag_include: false
generated:
  by: claude-code/claude-opus-5-5
  at: '2026-11-15T05:50:00+09:00'
sources:
- id: signup-security
  resource: /references/user-signup-security.md
  title: 작가 가입 이메일 인증과 비밀번호 최소 길이 결정
---

# 사용자 요청

운영 주소에서 가입 인증 메일이 오지 않는다는 문의에 이어 다음과 같이 요청했다.

> 한번 인증코드 받은 적 있어도 또 받게 해줘

# 이번 작업의 해석

이전에는 같은 이메일의 미인증 계정이 있으면, 그 계정을 만든 최초 가입 요청이 아닌 새 가입에는 메일을 보내지 않고 같은 202를 반환했다. 다른 기기·탭에서 다시 가입하면 코드를 받을 방법이 없었다.

이제 새 가입은 남아 있는 미인증 계정의 비밀번호·가입 요청 ID·프로필을 함께 교체하고 새 코드를 보낸다. 확인과 재발송은 마지막 가입 요청 ID로만 된다. 코드는 메일 수신자만 받으므로, 다른 사람이 같은 이메일로 다시 가입해도 그 사람은 인증을 끝낼 수 없다. 인증을 마친 계정에는 여전히 메일을 보내지 않고 응답도 같다. 가입 시도 한도(이메일당 시간당 5회 등)는 그대로 적용된다.
