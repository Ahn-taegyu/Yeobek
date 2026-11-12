---
type: Decision
id: D-009
title: 음성·저장소·호스팅 재검토 제안
description: Next.js·Postgres 경계를 유지하고 TTS 청취·파일 규모·행사 호스팅 조건을 검증한 뒤 부분 교체한다.
status: draft
updated: '2026-11-12'
tags: [mawd, architecture, research]
rag_include: true
generated:
  by: codex/gpt-6
  at: '2026-11-12T06:02:54+00:00'
sources:
- id: request
  resource: /references/user-stack-review.md
  title: 사용자 기술 재검토 요청
- id: voice
  resource: /research/voice-options.md
  title: 음성 모델 조사
- id: storage
  resource: /research/storage-and-postgres.md
  title: 저장소와 무료 PostgreSQL 자체 운영
- id: hosting
  resource: /research/nextjs-hosting.md
  title: Next.js와 호스팅 조사
decision_status: proposed
decision_basis: research-recommendation
---

# 상태

**proposed.** 사용자는 대안 조사를 요청하고 무료 서버의 PostgreSQL 직접 운영도 후보에 추가했다. 특정 모델·DB·호스트 변경을 확정하지 않았다. 기존 [D-008](D-008-technology-stack.md)은 첫 구현 기준으로 보존하되 아래 쟁점을 재검토 중이다. 실제 앱·계정·배포를 변경한 기록이 아니다.

# 제안

| 영역 | 유지/변경 권고 | 검증할 것 |
| --- | --- | --- |
| 앱 | Next.js 통합 유지. 비즈니스/데이터/AI 함수를 화면에서 분리 | 대상 호스트의 SSR·Route·파일/녹음 흐름 |
| DB | 이번 마감은 Supabase Postgres/Auth 유지 | 실제 용량·RLS·연결·무료 플랜 상태. DB와 파일 크기를 따로 측정 |
| 큰 파일 | 원본·관람 파생본·검색 텍스트 분리. 필요 시 Storage만 R2/유료 Supabase로 변경 | 실제 파일 최대 크기·합계·전송량·공개 중지 접근 계약 |
| 음성 | STT→승인 근거 답변→전용 TTS 우선. Live는 연속 대화/끼어들기를 제품 목표로 삼을 때 | 기존 키 기준 음성과 Typecast/Gemini TTS/ElevenLabs 중 접근 가능한 한 후보의 한국어 청취 비교 |
| 호스팅 | Render 행사 조건 확인 후 우선 평가, Netlify 무료 대안 | Render 크레딧·휴면·만료 조건, Netlify 크레딧/호환성. Vercel Hobby 상업 운영 가정 금지 |
| 직접 운영 | 무료 VM PostgreSQL을 대안으로 인정 | 기존 VM 확보·영구 디스크·백업 복원·권한/인증·운영 담당. Render Free 웹 로컬 디스크는 제외 |

Typecast를 첫 한국어 청취 후보로 제안하되, 계정/라이선스/실호출 확인 없이 스택을 교체했다고 표시하지 않는다. 현재 OpenAI TTS의 종료 예정 문제는 남아 있으며 후속 운영 전에 해결해야 한다.

# 개발 순서에 주는 영향

단계 0의 실제 음성 시험에 **30~45분 비교 청취 시간**을 넣고 한 목소리를 고정한다. 계정 준비가 안 된 후보를 기다리며 전체 개발을 멈추지 않는다. 두 Live 제공사와 여러 TTS를 함께 구현하는 작업을 일요일 범위에 추가하지 않는다.

기획 담당은 실제 파일 확보와 Render 제공 조건 확인을 맡는다. 큰 PDF가 실제 필수가 되면 먼저 저장 경로/플랜·재개 업로드를 바꾸고 OCR/자동 매칭과 분리한다. 기존 PDF 6MB는 팀의 임시 접수 상한이며 고화질 자료 제품 요구의 최종 합의가 아니다.

모델·호스트가 정해지면 D-008, SPEC-007, F-002/F-005, 개발 계획의 관련 경로를 함께 갱신한다. 새 모델 청취·실호출, 대용량 업로드/복원, 호스트 배포가 수행되기 전에는 검증 완료로 표시하지 않는다.
