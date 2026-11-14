---
type: Decision
id: D-008
title: 일요일 MVP 기술 스택과 개발 기준
description: Next.js·Supabase·Liner·OpenAI 음성과 작은 범위 검색으로 구현한다.
status: draft
updated: '2026-11-14'
tags:
- mawd
- architecture
rag_include: true
generated:
  by: codex/gpt-6
  at: '2026-11-12T14:38:57+09:00'
sources:
- id: current-stack
  resource: /research/recommended-stack.md
  title: Render 제외 후 최신 스택·모델 권고
- id: direction
  resource: /references/user-build-direction.md
  title: 사용자 기술 선택 위임과 사전 개발·키 확인
- id: official
  resource: /references/stack-references.md
  title: 공식 기술 문서
decision_status: accepted
decision_basis: delegated-selection
review_status: under-review
---

# 결정 상태

**최신 추천:** [D-010](D-010-practical-stack.md)에서 Render 제외, OpenAI 직접 Q&A·Typecast TTS·Liner 해설 제작으로 조정을 권고했다. 아래 선택은 11/12의 위임 기준을 보존한 기록이며 새 권고를 사용자가 개별 승인한 것으로 승격하지 않는다.

**accepted — 사용자가 위임한 기술 선택을 이번 구현 기준으로 채택했다.** 사용자가 개별 벤더·모델을 직접 선택했다는 뜻이 아니며 실제 호출·배포·성능 검증은 아직 남아 있다. 사용자 확정 사항과 선택자의 판단을 구별하기 위해 `decision_basis: delegated-selection`을 기록한다.

**추가 조사 반영:** 사용자가 Live/TTS·Supabase 확장성·무료 PostgreSQL 서버·호스팅 대안을 요청했다. [D-009](D-009-stack-review.md)에서 재검토한다. 아래는 최초 선택의 기록이며 새 후보를 이미 도입한 상태가 아니다. 무료 파일 한도와 Vercel Hobby 사용 조건, TTS 수명을 검증한 뒤 관련 선택을 갱신한다.

# 선택

- 모바일 웹: **Next.js App Router + TypeScript + Tailwind**, Node 24.x, npm.
- 서버: 같은 Next.js 프로젝트의 **Route Handlers**. 별도 FastAPI/Nest 서버 없음.
- 데이터·작가 로그인·파일: **Supabase Postgres + Auth + private Storage**.
- 해설·질의응답: **Liner Chat Completions**. 행사 키 수령 전 계약 검증용 mock, 수령 후 실제 API로 교체.
- 음성 입력: **MediaRecorder → OpenAI `gpt-transcribe`**.
- 음성 출력: **OpenAI `gpt-4o-mini-tts` → MP3**, 기본 음성 한 종. 이번 해커톤까지의 단기 선택이며 2027-01-06 종료 전 교체 필수.
- 제품 RAG: **현재 작품의 공개 승인 근거를 SQL로 제한 조회**. 작은 문서 묶음과 출처 검증부터 구현하고 임베딩·별도 벡터 DB는 후속 평가.
- 배포: **Vercel**. 오늘 HTTPS 미리보기까지 연결하는 일정.

# 이 선택이 맞는 이유

핵심 개발자가 프런트·백엔드·AI를 모두 맡는다. TypeScript 한 프로젝트로 공유 타입과 배포 경계를 줄이고, 로그인·파일·DB를 한 서비스로 묶는다. 이미 사용 가능한 OpenAI 키로 음성 네 조합을 행사 전에 시험할 수 있다. 파트너 최소 1개 조건은 라이너가 핵심 글 생성과 Q&A를 맡는 방식으로 충족하도록 설계한다.

단일 채팅을 만들기 위해 실시간 음성 통화·자동 발화 감지를 만들 필요는 없다. 녹음→인식문 확인→같은 채팅 요청→선택적 낭독으로 고정한다. 승인된 답을 같은 내용으로 낭독하는 단순 HTTP 경로와 이번 마감을 위해 TTS의 종료 예정 위험을 한시적으로 수용한다. 장기 운영 기본값으로 추천하는 선택은 아니다.

# 범위와 재검토 조건

일요일에는 이미지·직접 입력·PDF 보관 및 수동 발췌 연결을 구현한다. 도록 자동 추출·OCR·이미지 분석은 이번 일정에서 제외하고 후속으로 둔다. 이는 미완성 기획을 줄인 구현 판단이며 [D-004](D-004-input-contract.md)의 장기 자동화 수준을 사용자 대신 확정하지 않는다.

OpenAI 음성 두 호출은 오늘 확인한다. 선택 모델에 접근할 수 없으면 UI와 채팅 계약을 유지하고 음성 어댑터만 교체한다. Liner 행사 키의 실호출은 11/14 최우선 검증이다. 실패한 mock을 실제 기능이나 파트너 조건 충족으로 발표하지 않는다.

세부 경계·상한은 [기술 스택](../specs/technology-stack.md), 날짜별 작업과 실패 시 대응은 [개발 순서](../product/delivery-plan.md)를 따른다.

## 후속 인증 요구

[D-016](D-016-artist-auth.md)에서 사전 생성 계정 전용 기준을 직접 가입·로그인 선택으로 변경했다. 기존 구현 현황은 [개발 기반](../specs/development-foundation.md)에서 확인한다.
