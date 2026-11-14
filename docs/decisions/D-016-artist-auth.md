---
type: Decision
id: D-016
title: 작가 직접 회원가입과 로그인 선택 진입
description: 작가 직접 가입과 가입 후 명시적 로그인에 관한 요구와 기존 인증 구현의 차이를 기록한다.
status: draft
updated: '2026-11-14'
tags: [yeobek, authentication]
rag_include: true
generated:
  by: codex/gpt-6.1-terra
  at: '2026-11-14T11:07:39+09:00'
decision_status: accepted
decision_basis: user-confirmed
sources:
- id: user
  resource: /references/user-artist-auth.md
  title: 사용자 전달 작가 인증 결정
- id: login
  resource: /references/user-auth-direct-login.md
  title: 가입 후 직접 로그인 확정
- id: previous
  resource: /decisions/D-008-technology-stack.md
  title: 이전 인증 기준
- id: notion
  resource: https://app.notion.com/p/4163559f0529809aa720d75f9266cfbc
  title: Notion F13 회원가입 및 로그인
---

# 확정 요구

[사용자 전달](../references/user-artist-auth.md)에 따라 모바일 웹 비로그인 작가는 로그인 또는 회원가입을 선택하고 직접 가입할 수 있다. 기존 또는 신규 계정으로 로그인한 작가는 자기 작가 홈에 진입하고 자기 전시만 관리한다. 관람객은 QR로 로그인 없이 이용한다.

[후속 확정](../references/user-auth-direct-login.md)에 따라 이메일·비밀번호·확인값으로 가입하며, 가입 완료 후 자동 로그인하지 않고 로그인 화면에서 직접 로그인한다. 가입 시 작가 소개와 작품 세계를 받지 않는다.

D-008의 사전 생성 계정 전용 기준은 이 요구로 대체한다. 기존 계정과 데이터는 보존한다. 유효 세션 재접속은 자기 홈으로 연결하고 로그아웃 성공 후 선택 화면으로 돌아간다. 화면의 URL 구성과 세부 배치는 설계 제안이다.

# 현재 구현과 남은 정책

[개발 기반 현황](../specs/development-foundation.md)의 사전 생성 계정 로그인·로그아웃은 기존 구현이다. 직접 가입·선택 화면·가입 직후 세션 처리와 관련 수용 검증은 후속 작업이다. 이 문서는 구현 완료를 뜻하지 않는다.

이메일 인증·소셜 로그인·비밀번호 길이와 강도·계정 복구·세션 수명·안내/동의 정책은 미결정이다. 세부 가입 상태 및 API는 [기능명세 BR-16](../specs/functional-spec.md#br-16-작가-가입인증계정-처리)과 [화면 명세](../specs/screen-spec.md#작가-인증-화면-연결)를 따른다.
