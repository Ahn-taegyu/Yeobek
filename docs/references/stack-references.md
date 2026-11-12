---
type: Reference
id: SRC-009
title: MVP 기술 선택의 공식 근거
description: 2026-11-12 확인한 프레임워크·저장소·API·브라우저 제약과 실제 호출 검증의 경계.
status: draft
updated: '2026-11-12'
tags:
- mawd
rag_include: false
generated:
  by: codex/gpt-6
  at: '2026-11-12T14:38:57+09:00'
evidence: official-documentation
---

# 확인한 공식 문서

| 대상 | 이번 설계에 필요한 사실 | 근거 |
| --- | --- | --- |
| Next.js | App Router에서 TypeScript·Tailwind로 시작 가능. 열람 당시 안정 버전 표시 16.4.6 | [설치](https://nextjs.org/docs/app/getting-started/installation) |
| Vercel Node | Node 24.x 지원. 패치 버전은 배포 환경에서 관리됨 | [런타임](https://vercel.com/docs/functions/runtimes/node-js/node-js-versions) |
| Vercel 파일 전송 | Function 요청과 버퍼링한 응답은 4.5MB 제한. 스트리밍 응답 예외. 원자료는 Storage 직접 업로드 | [제한](https://vercel.com/docs/functions/limitations) |
| Supabase | Next.js 연동, Auth·Postgres·Storage 사용 및 RLS 접근 통제 | [시작](https://supabase.com/docs/guides/getting-started/quickstarts/nextjs), [서버 인증](https://supabase.com/docs/guides/auth/server-side/nextjs) |
| Supabase 업로드 | 6MB 이하는 표준 업로드 권장, 그 이상은 TUS 재개 업로드 권장. 6MB는 파일 최대치가 아님 | [표준 업로드](https://supabase.com/docs/guides/storage/uploads/standard-uploads), [TUS](https://supabase.com/docs/guides/storage/uploads/resumable-uploads) |
| Liner | Chat Completions와 모델 목록 API를 제공. 계정의 실제 사용 가능 모델 확인 필요 | [Chat Completions](https://liner.com/developers/docs/liner-model-api-chat-completions) |
| Liner 음성 | 전사/합성 엔드포인트가 문서화되어 있으나 행사 키의 접근은 미확인 | [전사](https://liner.com/developers/docs/liner-model-api-audio-transcriptions), [합성](https://liner.com/developers/docs/liner-model-api-audio-speech) |
| OpenAI STT | 녹음 파일은 `/v1/audio/transcriptions`, 현재 시작 모델 권고는 `gpt-transcribe` | [File transcription](https://developers.openai.com/api/docs/guides/speech-to-text) |
| OpenAI TTS | `/v1/audio/speech`에서 텍스트를 음성으로 변환. `gpt-4o-mini-tts`는 2027-01-06 종료 예정 | [Text to speech](https://developers.openai.com/api/docs/guides/text-to-speech) |
| 브라우저 녹음 | HTTPS/권한이 필요. `MediaRecorder.isTypeSupported()`로 녹음 형식 지원 여부 확인 | [getUserMedia](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia), [형식 확인](https://developer.mozilla.org/en-US/docs/Web/API/MediaRecorder/isTypeSupported_static) |

OpenAI 음성 문서는 Markdown 본문도 열람했다. 라이너 전사 문서의 직접 열기는 실패했고 공식 도메인 검색 결과에 반환된 본문을 확인했다. 공개 문서 존재가 행사 크레딧 적용이나 계정 사용 권한을 증명하지 않는다.

# 선택은 사실과 구분

후속 [공식 문서 조사](../research/index.md)에서 Live·한국어 TTS·Storage/DB 용량·무료 PostgreSQL 직접 운영·호스팅을 비교했다. 현재 Vercel WebSocket 지원과 스트리밍 응답 예외, Render 행사 파트너 여부도 반영했다. 예전 플랫폼 제약을 그대로 적용하지 않는다.

Next.js + Supabase, 음성 전용 OpenAI, 벡터 DB 없는 검색, 파일 크기·일정 상한은 이 프로젝트를 위한 설계 판단이다. 벤더가 이 조합의 성공·한국어 품질·무료 운영을 보장한 것이 아니다. 로컬에는 Node v24.15.0과 npm 11.12.1이 설치되어 있음을 확인했다.

# 아직 수행하지 않은 검증

API 실호출, 음성 모델 접근·한국어 품질·가격 측정, 프로젝트 생성·배포, 실기기 녹음/재생, 실제 작가 도록 추출. [개발 계획](../product/delivery-plan.md)의 첫 작업에서 확인한다.
