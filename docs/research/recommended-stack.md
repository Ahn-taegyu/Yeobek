---
type: Review
id: RES-004
title: Render 제외 후 현실적인 도슨트 MVP 추천 스택
description: 기본 해설 재사용과 짧은 Q&A·TTS 재생으로 사용자 대기를 줄이는 구성과 AI별 API 선택.
status: draft
updated: '2026-11-13'
tags: [yeobek, architecture, voice, latency]
rag_include: true
generated:
  by: codex/gpt-6
  at: '2026-11-13T02:02:31+00:00'
sources:
- id: user
  resource: /references/user-render-excluded.md
  title: 사용자 최신 제약
- id: liner
  resource: https://liner.com/developers/docs/llm-gateway
  title: Liner 모델 카탈로그
- id: openai
  resource: https://developers.openai.com/api/docs/models/gpt-6-luna
  title: OpenAI GPT-6 Luna
- id: stt
  resource: https://developers.openai.com/api/docs/guides/transcription
  title: OpenAI 음성 인식 경로
- id: tts
  resource: https://typecast.ai/docs/ko/api-reference/text-to-speech/streaming-text-to-speech
  title: Typecast Streaming TTS
- id: vercel
  resource: https://vercel.com/docs/plans/pro
  title: Vercel Pro 조건
- id: netlify
  resource: https://docs.netlify.com/build/functions/configuration/
  title: Netlify 함수 리전과 제한
decision_status: proposed
---

# 추천과 전제

**Next.js + Vercel + Supabase, 관람 Q&A/STT는 OpenAI, 해설 초안은 Liner, TTS는 Typecast**를 권고한다. 웹/DB에 관리형 서비스를 쓰고 음성 경험에 시간을 배분한다. Render는 사용자 안내에 따라 이번 행사 제공 후보에서 제외했다.

상업 서비스로 이어갈 수 있도록 유료 호스팅·TTS 소액 예산을 허용하는 안을 주안으로 둔다. 비용을 지출하거나 계정을 생성한 것은 아니다. 무료 호스팅만 필요하면 아래 Netlify 대안을 사용하되 리전·한도를 감수한다. 한국어 청취·실호출·지연·호환성은 아직 측정하지 않았다.

# 앱과 데이터

| 영역 | 권고 | 목적 |
| --- | --- | --- |
| 웹/서버 | Next.js App Router, TypeScript, Node 24.x, Route Handlers | 핵심 개발자 한 명이 화면·API·공유 타입을 한 프로젝트에서 관리 |
| UI | Tailwind, React useReducer, HTML audio, MediaRecorder | 하나의 채팅과 독립 모드. 녹음/응답/음성 상태를 따로 관리 |
| 검증/QR | Zod, qrcode | 입력·모델 출력·QR URL 검증 |
| DB/Auth | Supabase Postgres/Auth + RLS | 작가 소유권, 승인 버전, 단기 요청 상태 |
| 파일 | Supabase private Storage에 직접 업로드 | 고화질 원본과 웹용 파생본을 분리. 큰 PDF는 실제 크기/플랜에 따라 R2 또는 유료 Storage 검토 |
| 배포 | Vercel Node runtime, DB와 같은/가까운 리전 | Next 호환성과 서버→DB 왕복을 관리. 서울 `icn1` 선택 가능 |
| 제품 검색 | 작품/전시/공개 버전으로 SQL 조회 | 작은 근거 묶음부터. 별도 임베딩·벡터 DB·reranker 없음 |

Next의 패치 버전과 어댑터는 최초 배포 성공 조합으로 고정한다. `fetch`/공식 SDK를 작은 서버 함수로 감싸고 LangChain·에이전트 프레임워크·다중 모델 자동 라우팅은 넣지 않는다. 서버 리전만 가까워졌다고 외부 AI 처리까지 국내에서 실행되거나 지연이 보장되는 것은 아니다. [Vercel 리전](https://vercel.com/docs/regions)

Supabase Free의 DB 500MB·파일 1GB·파일당 50MB는 여전히 적용된다. 이번 시연 자료가 그 안에 들어가는지 확인한다. 큰 원본 때문에 DB부터 교체하지 않고 [파일/DB 분리안](storage-and-postgres.md)을 적용한다. 무료 VM 자체 운영은 이미 준비된 서버가 있을 때의 대안으로 남긴다.

# AI별 모델과 API

| 작업 | 추천 모델 | API와 실행 시점 |
| --- | --- | --- |
| 해설 초안/작가 자료 정리 | **Liner 경유 `openai/gpt-6.1-sol`** | `POST https://platform.liner.com/api/v1/chat/completions`. 등록/검수 단계에서 실행; 초안을 자동 게시하지 않음 |
| 관람 중 근거 기반 Q&A | **OpenAI `gpt-6-luna`** | `POST https://api.openai.com/v1/responses`. 서버가 승인 근거를 조회해 제공; 질문당 기본 1회 |
| 녹음 음성 → 글 | **OpenAI `gpt-transcribe`** | `POST https://api.openai.com/v1/audio/transcriptions`. 녹음 종료 후 한 파일 전사 |
| 승인 기본 해설 낭독 | **Typecast `ssfm-v31`** | `POST https://api.typecast.ai/v1/text-to-speech`. MP3를 미리 생성하고 검수·저장 |
| 새 질문 답변 낭독 | **Typecast `ssfm-v31`** | `POST https://api.typecast.ai/v1/text-to-speech/stream`. 확정 답변의 MP3를 받아 재생 시작 |
| 작품 번호·기본 설명 요청 | 별도 AI 없음 | 번호 정규화+DB 정확 조회, 승인 해설 반환 |
| PDF OCR·이미지 부위 인식 | 이번 MVP 모델 없음 | PDF 보관·수동 발췌, 말/글 부위 설명. 기존 후순위 유지 |

Liner 공개 카탈로그에서 위 모델 ID를 확인했다. 행사 키의 허용 모델·크레딧 대상은 별도 확인한다. 미지원이면 `liner-gpt-router`의 품질 우선 설정을 시험해 초안 생성에 사용하고 실제 응답 모델을 기록한다. **Liner를 통한 새 해설 생성 성공**이 있어야 파트너 사용을 입증한다. 단순 연결·로고·미리 만든 해설만으로 완료 처리하지 않는다. [카탈로그](https://liner.com/developers/docs/llm-gateway), [Chat Completions](https://liner.com/developers/docs/liner-model-api-chat-completions)

Q&A는 `gpt-6-luna`의 낮은 reasoning effort부터 평가한다. 기본 설명은 모델을 호출하지 않고, 질문에 필요한 근거와 같은 작품의 짧은 대화만 제공한다. 답은 우선 2~4문장, 약 150~300자를 목표로 하며 기존 최대 범위 안에서 이어 묻도록 한다. 별도 분류 LLM·검색 에이전트·검토 LLM을 매 질문마다 직렬로 호출하지 않는다. 출처 ID/구조 검사는 서버에서 수행하며 문장 사실성은 평가 질문으로 확인한다. [OpenAI 모델](https://developers.openai.com/api/docs/models/gpt-6-luna)

행사 전 해설 초안 흐름도 실제로 시험하려면 보유 OpenAI 키로 `gpt-6.1-sol` Responses 호출을 임시 사용한다. 행사 키 수령 후 같은 초안 함수만 Liner로 연결하고 다시 검증한다. 보유 키가 해당 모델까지 사용할 수 있다고 단정하지 않는다. 개발용 제공사와 최종 파트너 경로를 기록한다.

STT에는 작품명·작가명·재료명과 한국어 힌트를 제공하고 인식문을 편집 가능한 입력창에 돌려준다. 완료 파일 전사의 출력 스트리밍과 마이크 실시간 전사는 다르다. 이번에는 녹음 후 확인/전송을 유지한다. [OpenAI transcription](https://developers.openai.com/api/docs/guides/transcription)

Typecast는 `GET https://api.typecast.ai/v3/voices?model=ssfm-v31`에서 호환 한국어 음성 한 개를 골라 `TYPECAST_VOICE_ID`로 고정한다. 존재를 확인하지 않은 목소리 ID를 기획에 만들어 넣지 않는다. MP3·일반 설명체로 시작해 숫자/미술 용어/부정 표현을 청취한다. “한국어가 가장 자연스럽다”는 검증 결과는 아직 없다. [모델](https://typecast.ai/docs/ko/models), [일반 TTS](https://typecast.ai/docs/ko/api-reference/text-to-speech/text-to-speech), [스트리밍 TTS](https://typecast.ai/docs/ko/api-reference/text-to-speech/streaming-text-to-speech)

# 사용자가 느끼는 흐름

1. **“18번 설명해줘”**: 번호를 확인하고 승인 글을 반환한다. 선택한 출력이 음성이면 준비된 파일을 재생한다. 질문마다 해설 생성/TTS를 반복하지 않는다.
2. **작품 질문**: 질문을 즉시 채팅에 표시하고 처리 상태를 보여준다. 승인 근거로 짧은 답을 생성·검증한 뒤 글을 표시한다. 음성 출력이면 같은 답의 TTS를 이어 시작한다.
3. **말로 질문**: 녹음→인식문 확인→전송. 인식문 편집이 필요 없으면 전송 버튼 한 번으로 이어간다. 항상 듣기/자동 전송을 새 기본값으로 넣지 않는다.
4. **다른 작품/모드로 이동**: 현재 재생을 멈추고 이전 요청의 자동 재생을 취소한다. 늦은 응답은 원래 메시지에 연결한다. UI 취소가 이미 시작된 외부 과금을 취소한다고 표시하지 않는다.
5. **실패**: 글과 음성 상태를 나눈다. TTS만 재시도하며 같은 질문을 다시 생성하지 않는다. 음성 자동재생이 막히면 명확한 재생 버튼을 제공한다.

초기 Q&A는 전체 답의 구조·인용·공개 상태 검증 후 표시한다. 이것은 기존 비스트리밍 답변 계약을 유지하면서 **음성 바이트 전달만 스트리밍**하는 안이다. 타이핑 애니메이션으로 완성된 글을 일부러 늦추지 않는다. 음성 출력에서도 글/출처는 펼쳐 볼 수 있고, 입력·출력 모드는 계속 독립적이다.

음성 재생은 같은 앱의 권한 검사 경로를 거치고 서버에 키를 둔다. 전체 MP3를 `Blob`으로 다 받는 구현만으로는 스트리밍 시작 지연을 줄일 수 없다. 먼저 완성 파일 재생을 확인하고, 같은 audio 요소에서 점진 재생이 실제 iPhone Safari/Android Chrome에서 되는지 시험한다. 자동재생 실패 시 사용자가 눌러 시작하며 비호환 환경에는 완성 파일 경로로 복구한다.

합성이 끝나기 전에 재생할 수 있어도 완료 상태는 원본 스트림의 정상 종료 뒤에 기록한다. 중복/Range 요청이 중복 유료 합성을 만들지 않도록 요청 ID와 원자적인 작업 상태를 사용한다. 중간 실패 파일은 완성된 캐시로 재사용하지 않는다. 공개 중지/세션 검사는 재생 시에도 유지한다.

Typecast MP3 출력의 비트레이트를 고려해 TTS 파일 상한은 기존 3MB에서 **8MB로 조정하는 안**을 [SPEC-007](../specs/technology-stack.md)에 제안했다. 이미지/녹음 입력 3MB 상한은 그대로다. Vercel의 버퍼링 응답 한도를 넘는 음성은 스트리밍으로 전달하고, 합성/저장 실패를 완성으로 표시하지 않는다.

# 호스팅과 비용

**주안은 Vercel Pro**다. 월 $20 플랫폼 요금에 배포 가능한 좌석 1개가 포함되며 추가 좌석·초과 사용량은 별도다. Typecast API Lite는 월 $15부터다. 둘을 쓰면 **월 기본 $35부터 + OpenAI/행사 한도 밖 AI 사용량·추가 좌석·세금·초과량**을 예상한다. Supabase Free 범위를 넘으면 그 비용도 추가된다. 결제나 구독을 실행하지 않았다. [Vercel Pro](https://vercel.com/docs/plans/pro), [Typecast API 가격](https://typecast.ai/kr/pricing/api/)

개인 비상업 데모로 Vercel Hobby 조건에 맞으면 무료로 시작할 수 있지만 팀/상업 SaaS에 자동 적용하지 않는다. Typecast 무료 API도 비상업·출처 표시 조건이 있다. 호스팅 무료와 AI 무료를 같은 의미로 쓰지 않는다. [Hobby 조건](https://vercel.com/docs/plans/hobby)

**무료 호스팅 우선 대안은 Netlify Free**다. Next.js 지원과 스트리밍은 확인했지만 기본 Functions 리전은 미국 Ohio이고 리전 변경은 Pro/Enterprise에 제공된다. 월 300크레딧과 배포/사용량 차감도 고려한다. 한국 DB를 그대로 두면 서버→DB의 먼 왕복이 생길 수 있으므로 Vercel과 같은 지연을 보장하지 않는다. [Next 지원](https://docs.netlify.com/build/frameworks/framework-setup-guides/nextjs/overview/), [함수 리전](https://docs.netlify.com/build/functions/configuration/), [크레딧](https://docs.netlify.com/manage/accounts-and-billing/billing/billing-for-credit-based-plans/credit-based-pricing-plans/)

# 제외와 실패 시 대안

GPT-Live/Gemini Live는 연속 발화·끼어들기가 필요할 때의 다음 단계다. 현재는 사전 해설과 독립 모드를 완성한다. Live 두 종류·여러 TTS를 동시에 구현하지 않는다.

Typecast 키/목소리/라이선스를 바로 준비할 수 없거나 시험에 실패하면 보유 키의 OpenAI `gpt-4o-mini-tts`/`coral`을 이번 시연의 단기 대안으로 시험한다. 이 모델은 2027-01-06 종료 예정이므로 장기 기본값으로 되돌리지 않는다. 자동으로 매 요청마다 제공사를 바꾸는 기능은 만들지 않는다. [OpenAI 종료 안내](https://developers.openai.com/api/docs/guides/text-to-speech)

# 금요일부터의 구현·검증 순서

1. **금요일 첫 2시간:** HTTPS 배포 + 녹음 1개 전사 + 같은 문장 TTS 재생. Typecast/기존 OpenAI 음성 비교를 이 안에 제한하고 한 제공사·목소리로 좁힌다.
2. **금요일 다음 단계:** 작품 1점으로 기본 해설과 실제 Q&A·네 입출력 조합 연결. 로그인·등록·승인·게시로 확장한다. 프런트 보조는 녹음/재생 상태와 모바일 UI를 맡는다.
3. **토요일 행사 전:** 수동 발췌 입력, 출처 검증, 게시 중지, 중복/오류 복구, Q&A 실측. 캐시와 출력 길이를 먼저 조정한다.
4. **토요일 키 수령 후:** Liner로 새 초안을 실제 생성→작가 검수→TTS→게시. 지원 모델을 고정하고 전체 경로를 재검증한다.
5. **일요일 02:00 동결·04:30 내부 완료:** 실패 수정·실기기 리허설. 공식 제출 시각이 더 빠르면 앞으로 당긴다.

초기 **측정 목표**는 기본 해설 재생 시작 2초 안, 짧은 Q&A의 검증된 글 3초 안·첫 음성 5초 안의 중앙값이다. 기본 해설은 재생 요청부터, Q&A는 텍스트 전송부터 잰다. 음성 질문은 녹음 종료→전사 완료를 별도 측정하며 사용자 확인 시간은 시스템 지연과 분리한다. 실측 보장이 아니며 첫 방문/재방문·모바일 기기·동시 3명·p95·실패도 함께 기록한다. 기존 질문 12개에서 근거 정확성을 통과해야 속도 개선으로 인정한다.
