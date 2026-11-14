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
- id: signup-profile
  resource: /references/user-artist-signup-exhibition.md
  title: 진행 중 전시 진입과 가입 시 작가 프로필
- id: v3
  resource: /references/user-backend-plan-v3.md
  title: 백엔드 v3 화면·리스크 보강
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
- id: backend-plan
  resource: /references/user-backend-completion.md
  title: 직접 가입을 마감 이후로 둔 백엔드 계획 요청
- id: timing
  resource: /references/user-auth-signup-timing.md
  title: 작가 직접 가입 마감 전 포함 결정
- id: signup-security
  resource: /references/user-signup-security.md
  title: 작가 가입 이메일 인증과 비밀번호 최소 길이 결정
---

# 확정 요구

[사용자 전달](../references/user-artist-auth.md)에 따라 모바일 웹 비로그인 작가는 로그인 또는 회원가입을 선택하고 직접 가입할 수 있다. 기존 또는 신규 계정으로 로그인한 작가는 자기 작가 홈에 진입하고 자기 전시만 관리한다. 관람객은 QR로 로그인 없이 이용한다.

[후속 확정](../references/user-auth-direct-login.md)에 따라 이메일·비밀번호·확인값으로 가입하며, 가입 완료 후 자동 로그인하지 않고 로그인 화면에서 직접 로그인한다. 가입 시 작가 소개와 작품 세계를 받지 않는다.

[후속 요청](../references/user-artist-signup-exhibition.md)에 따라 가입 화면에서 이름과 작가명을 함께 받는다. 직접 로그인 후 처음 불러온 프로필에 가입 때 입력한 이름이 표시된다.

[가입 인증 결정](../references/user-signup-security.md)에 따라 이메일 인증은 필수이고 가입 비밀번호는 8자 이상이다. 이메일 인증을 마친 작가는 로그인 화면에서 직접 로그인한다. 이메일 인증만으로 관리자 세션을 열 수 없으며, 기존 계정 로그인에는 신규 가입의 최소 길이나 추가 강도 규칙을 적용하지 않는다.

D-008의 사전 생성 계정 전용 기준은 이 요구로 대체한다. 기존 계정과 데이터는 보존한다. 유효 세션 재접속은 자기 홈으로 연결하고 로그아웃 성공 후 선택 화면으로 돌아간다. 화면의 URL 구성과 세부 배치는 설계 제안이다.

# 현재 구현과 남은 정책

[개발 기반 현황](../specs/development-foundation.md)의 사전 생성 계정 로그인·로그아웃은 기존 구현이다. 직접 가입·선택 화면·가입 직후 세션 처리와 관련 수용 검증은 후속 작업이다. 이 문서는 구현 완료를 뜻하지 않는다. [백엔드 완성 계획 요청](../references/user-backend-completion.md)은 직접 가입을 마감 이후로 두었으나, 사용자가 [마감 전 포함](../references/user-auth-signup-timing.md)을 결정했다. 선택 화면·직접 가입·가입 후 직접 로그인은 마감 전 구현 범위다. 현재 서버 구현과 화면의 남은 범위는 아래 W9 기록을 따른다.

[v3 A1 확정](../references/user-backend-plan-v3.md)에 따라 소셜 로그인은 이번 범위에서 제외하고 이메일+비밀번호를 유지한다. Figma의 소셜 버튼은 디자인 수정 대상이다. 비밀번호 추가 강도 규칙과 재설정, 계정 복구, 세션 수명, 안내·동의 정책은 미결정이다. 인증 메일 재발송의 최소 API 경로는 아래 W9 기록을 따른다. 세부 가입 상태 및 API는 [기능명세 BR-16](../specs/functional-spec.md#br-16-작가-가입인증계정-처리)과 [화면 명세](../specs/screen-spec.md#작가-인증-화면-연결)를 따른다.


## W9 구현 선택과 미완료 경계

이메일 확인은 6자리 코드와 최초 가입 요청 ID로 연결하고 직접 로그인을 요구하는 API를 구현·검증 중이다. [공식 계약 조사](../research/signup-auth-contract.md)와 [API 계약](../specs/api-contract.md#w9-이메일-가입-계약-검증-중)을 따른다. 서버의 직접 가입/재발송·확인 기능과 프런트 선택/가입 화면 구현을 구분한다. FEATURE_SIGNUP 기본은 false이며 클라우드 Auth·메일 설정 후 활성화한다. 추가 강도/재설정/세션 수명은 기존 동작을 유지하고 최초 요청 ID를 잃은 pending 계정 복구는 미구현이다.
