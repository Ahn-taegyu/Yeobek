---
type: Research
id: RES-006
title: 백엔드 기능별 제공사 연결 조사
description: W0 기본 경로의 공식 문서 근거와 실호출 전 한계.
status: draft
updated: '2026-11-14'
tags: [yeobek, ai, routing]
rag_include: true
generated:
  by: codex/gpt-6-astra
  at: '2026-11-14T02:34:00+09:00'
sources:
- id: decision
  resource: /decisions/D-015-partner-priority.md
  title: 성능을 유지하는 파트너 API 우선
- id: catalog
  resource: https://liner.com/ko/developers/docs/llm-gateway
  title: Liner Gateway 모델 목록
- id: transcription
  resource: https://liner.com/developers/docs/liner-model-api-audio-transcriptions
  title: Liner Audio transcriptions
- id: speech
  resource: https://liner.com/developers/docs/liner-model-api-audio-speech
  title: Liner Audio speech
- id: exaone
  resource: https://docs.exaone.ai/en/docs/k-exaone-2.5
  title: K-EXAONE 2.5 API
---

# 기본값과 선정 상태

[파트너 우선 원칙](../decisions/D-015-partner-priority.md)을 연결하는 잠정 기본값이다. `AI_ROUTE_<기능>=제공사:모델ID` 설정으로 바꾸며 요청 중 자동 전환하지 않는다.

| 기능 | 기본 경로 | 남은 확인 |
| --- | --- | --- |
| DRAFT / ORGANIZE | `liner:openai/gpt-6.1-sol` | 기존 생성 모델의 계정 접근·한국어 품질 |
| JUDGE | `liner:google/gemini-3.8-flash` | 다른 계열 평가 모델, 사람 평가 일치도 |
| QA | `liner:openai/gpt-6-luna` | 파트너 경유 구조화 출력·지연 |
| STT | `liner:openai/whisper-1` | 한국어 번호·작품명·부정 표현 |
| TTS | Liner, 모델·voice 설정 필수 | 계정에서 MP3 지원 모델과 `LINER_TTS_VOICE` 선택 후 청취 |

텍스트 ID는 [Liner 모델 목록](https://liner.com/ko/developers/docs/llm-gateway)에서 확인했다. 모델 계열 분리는 같은 생성 모델의 자기 평가를 줄이는 구성이며 평가 정확성을 보증하지 않는다. EXAONE·직접 OpenAI·Typecast는 비교 후보다.

# 공식 요청 계약 확인

- [Liner 전사](https://liner.com/developers/docs/liner-model-api-audio-transcriptions)의 multipart `file`·`model`, 선택 `language`, `response_format=json`을 사용한다. 부모 도구의 직접 열기는 cache miss였고 구현 담당 Sol이 공식 검색 결과로 확인한 내용과 어댑터를 교차 대조했다. 행사 계정의 파일·모델 지원은 미확인이다.
- [Liner 합성](https://liner.com/developers/docs/liner-model-api-audio-speech)은 `/api/v1/audio/speech`에 `model`, `input`, `voice`, `response_format=mp3`를 전달한다. 기본 PCM을 MP3로 오인하지 않는다. MP3 지원 모델·음성 ID가 없으면 설정 오류다.
- [EXAONE 명세](https://docs.exaone.ai/en/docs/k-exaone-2.5)의 `/v1/chat/completions`, `k-exaone_v2.5`, `messages`, `max_tokens`, `reasoning_effort=low`, `stream=false`를 사용한다. 이 페이지에서 JSON Schema 요청 옵션은 확인되지 않아 프롬프트로 JSON을 요청하고 하네스에서 결과를 검증한다. 추론 텍스트를 답변으로 전달하지 않는다.

# 평가 기록

실제 AI 호출은 **0회**이며 모델 선택은 proposed다. W7에서 같은 사례·사람 라벨·p50/p95·사용량/단가·플러그인 버전과 해시를 묶어 비교 기록해야 한다. 모의 결과는 실측 성능이 아니며 음성 모델·voice 선택도 키 입력 당일 절차의 일부다.
