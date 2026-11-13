---
type: Specification
id: SPEC-005
title: 파트너 API와 음성 통합 기준
description: 최신 권고에서 Liner는 해설 초안, OpenAI는 관람 Q&A/STT, Typecast는 낭독을 담당한다.
status: draft
updated: '2026-11-13'
tags:
- mawd
rag_include: true
generated:
  by: codex/gpt-6
  at: '2026-11-12T14:38:57+09:00'
sources:
- id: current-stack
  resource: /research/recommended-stack.md
  title: Render 제외 후 최신 스택·모델 권고
- id: answers
  resource: /references/user-answers.md
  title: 2026-11-12 사용자 범위·팀·일정 확인
- id: liner
  resource: https://liner.com/developers/docs/liner-model-api-chat-completions
  title: Liner Chat Completions
- id: chat
  resource: /references/user-chat-interaction.md
  title: 사용자 통합 채팅·입출력 모드 요구
- id: direction
  resource: /references/user-build-direction.md
  title: 사용자 개발 조건
- id: official
  resource: /references/stack-references.md
  title: 공식 기술 근거
decision_status: proposed
---

# 최초 선택과 최신 권고

11/12의 [D-008](../decisions/D-008-technology-stack.md)은 Liner 글 생성/Q&A와 OpenAI 음성을 선정했다. **11/13 최신 [D-010](../decisions/D-010-practical-stack.md)은 Liner 해설 초안, OpenAI 직접 Q&A/STT, Typecast TTS를 권고한다.** Render 제외만 사용자 제약으로 반영했으며 새 모델·플랜은 추천 단계다. [정확한 모델/API](../research/recommended-stack.md).

행사 제공 API는 최소 하나가 필수이고 키는 행사 당일 받는다. Liner가 전시 개설의 핵심인 해설 초안을 실제로 생성하도록 설계한다. OpenAI 음성만 동작하는 상태로 파트너 조건을 충족했다고 주장하지 않는다. 사용자는 사전 개발 가능·OpenAI 키 보유를 확인했다.[^direction]

# Liner 계약

초안 연결은 `POST https://platform.liner.com/api/v1/chat/completions`, 추천 모델은 `openai/gpt-6.1-sol`이다. 행사 키에서 미지원이면 `liner-gpt-router`를 시험한다. 모델 목록과 실제 결과를 확인하고, 승인 근거의 초안을 생성하는 모델을 `NARRATION_MODEL`에 고정한다. 공개 문서의 모델이 행사 키에서도 허용된다고 가정하지 않는다.[^liner]

서버 함수는 두 개면 충분하다.

- `generateNarration(evidence)`: 작가가 입력한 근거로 검수용 초안 생성. 출력이 자동 공개되지 않는다.
- `answerQuestion(question, evidence, context)`: 최신 권고는 OpenAI Responses의 `gpt-6-luna` 직접 호출이다. 서버가 허용한 공개 근거와 제한 문맥으로 answer/citations/outcome을 받는다. 행사 전 실제 Q&A를 시험하고 검증된 경로를 유지한다.

API 키는 서버 전용이다. 전시/작품/승인 상태 필터는 앱이 수행한다. 검색 API에 고객 원자료 전체를 맡기거나 공개 웹 검색으로 작가 의도를 보충하지 않는다. 결과의 구조·인용 ID·최종 공개 상태를 확인한 뒤 관람객에게 전달한다.

# 사전 개발과 행사 당일

| 시점 | 할 일 | 통과 조건 |
| --- | --- | --- |
| 11/13 첫 단계 | OpenAI STT/Q&A, Typecast TTS 실호출 시험 | 마이크→인식, 근거 기반 답변, 같은 글→음성의 실제 성공 |
| 사전 개발 | 초안은 OpenAI 동일 모델로 임시 시험하거나 mock 명시; Q&A는 실제 호출 | 승인 근거·출처·모드·휴대폰 흐름을 행사 전에 확인 |
| 행사 키 수령 직후 | 모델 조회, Liner로 새 해설 초안 생성 | 초안→작가 검수→TTS→게시를 실제 파트너 호출로 통과 |
| 토요일 저녁 | 작품 3점·평가 질문 12개, 네 입출력 조합 | 실제 글 생성·음성 전체 경로 통과 |

행사 전용 Notion 가이드는 이전 조회에서 접근 불가였다. 공개 문서와 행사 계약·크레딧 범위가 같다고 간주하지 않는다. 계정 가입/크레딧 지급 확인은 기획 담당, 실제 기능 검증은 핵심 개발자가 맡는다.

# 음성 계약

`transcribe(recording)`과 `synthesizeSpeech(confirmedText)`를 분리한다. 녹음 후 인식문 확인·전송을 선택했으며 실시간 통화 SDK는 도입하지 않는다. 인식 입력과 낭독 출력을 독립적으로 바꾸는 네 조합이 필수다.

STT는 OpenAI `gpt-transcribe`, TTS는 Typecast `ssfm-v31`을 우선 시험하도록 권고한다. Typecast 준비/시험 실패 시 OpenAI `gpt-4o-mini-tts`는 **2027-01-06 종료 예정인 시연용 대안**이다. 한국어 품질·모델 접근·MP3 스트리밍 재생은 미검증이며 [기술 스택](technology-stack.md)과 [현재 추천](../research/recommended-stack.md)의 첫 단계에서 확인한다.[^audio]

Liner에도 음성 엔드포인트가 문서화되어 있으나 행사 키의 지원 범위는 확인되지 않았다. 사전 시험에 통과한 음성을 행사 당일 무리하게 다시 바꾸지 않는다. 교체는 같은 계약에서 접근·품질·비용을 확인했을 때만 검토한다.[^liner-audio]

# 장애 대응

- 음성 모델 접근 실패: 오늘 즉시 해결 대상으로 기록. 음성 어댑터를 교체할 수 있지만 미검증 대안을 동작한다고 표시하지 않는다.
- Liner 키/크레딧/모델 실패: 수령 직후 확인해 주최 측이 제공하는 사용 가능한 API 경로를 확인한다. 라이너가 안 된다는 이유로 mock만 남기고 완료로 표시하지 않는다.
- 타임아웃·한도·중복 전송: 정해진 실패 상태와 수동 재시도. 무한 자동 재시도나 임의 답변 생성 없음.
- 사용량/비용: 실제 호출 결과와 계정 한도를 보고 설정한다. 현재 요금·성공 지연은 측정하지 않았다.

# 이번에 통합하지 않는 도구

Alt·스티비·채널톡·Bivia·EXAONE·VAPI 링크는 [사용자 안내](../references/user-answers.md)에 보존했다. API 하나 필수라는 규칙을 도구 전체 통합으로 해석하지 않는다. 현재 공통 도슨트 범위의 구현이 끝나기 전에 추가 파트너 연동을 넣지 않는다.

[^direction]: [사용자 최신 개발 조건](../references/user-build-direction.md).
[^liner]: [Liner Chat Completions](https://liner.com/developers/docs/liner-model-api-chat-completions).
[^audio]: [OpenAI 전사](https://developers.openai.com/api/docs/guides/speech-to-text), [음성 합성과 종료 안내](https://developers.openai.com/api/docs/guides/text-to-speech).
[^liner-audio]: [Liner 전사](https://liner.com/developers/docs/liner-model-api-audio-transcriptions), [Liner 합성](https://liner.com/developers/docs/liner-model-api-audio-speech).
