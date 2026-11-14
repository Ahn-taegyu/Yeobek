---
type: Reference
id: SRC-038
title: 작가 직접 가입을 마감 전에 포함하기로 한 사용자 결정
description: 백엔드 계획의 '직접 가입은 마감 이후'와 D-016의 충돌에 대해 사용자가 마감 전 포함을 선택한 기록.
status: stable
updated: '2026-11-14'
tags: [yeobek, authentication, requirements, scope]
rag_include: false
generated:
  by: claude/claude-opus-5-5
  at: '2026-11-14T03:01:57+09:00'
sources:
- id: backend-plan
  resource: /references/user-backend-completion.md
  title: 직접 가입을 마감 이후로 둔 백엔드 계획 요청
- id: artist-auth
  resource: /decisions/D-016-artist-auth.md
  title: 작가 직접 회원가입과 로그인 선택 진입
evidence: user-stated
---

# 사용자 결정

2026-11-14 작업 대화에서, [SRC-033](user-backend-completion.md)의 "작가 직접 가입만 마감 이후로 둔다"와 [D-016](../decisions/D-016-artist-auth.md)의 직접 가입 요구가 충돌한다는 보고를 받은 뒤 "직접 가입을 마감 전에 구현할까요?"라는 질문에 사용자가 다음과 같이 답했다.

> 마감 전에 포함

# 반영 범위와 경계

- 작가 로그인·회원가입 선택(SC-A08), 직접 가입(SC-A09·OP-23), 가입 후 직접 로그인, 로그아웃 후 선택 화면 복귀를 마감 전 구현 범위에 넣는다. SRC-033의 해당 문장은 원문으로 보존하고 이 결정이 대체한다.
- 이메일 인증·소셜 로그인·비밀번호 길이/강도·재설정·세션 수명은 이 답변으로 정하지 않는다. 기능명세 Q-09로 남는다.
- 이 기록은 범위 결정이며 구현·검증 완료를 뜻하지 않는다. 일정·담당 배정은 별도로 정한다.
