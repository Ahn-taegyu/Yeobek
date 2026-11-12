---
type: Specification
id: SPEC-005
title: 파트너 API와 음성 통합 기준
description: Liner는 핵심 글 생성·Q&A, OpenAI는 사전 검증 가능한 음성 입출력을 담당한다.
status: draft
updated: '2026-11-12'
tags:
- mawd
rag_include: true
generated:
  by: codex/gpt-6
  at: '2026-11-12T14:38:57+09:00'
sources:
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

# 채택한 역할

**Liner는 해설 초안 생성과 근거 기반 Q&A**, **OpenAI는 음성 인식·합성**을 맡는다. [사용자가 위임한 기술 선택](../decisions/D-008-technology-stack.md)이며 실제 API 호출을 완료했다는 뜻은 아니다.

행사 제공 API는 최소 하나가 필수이고 키는 행사 당일 받는다. Liner가 핵심 글 생성과 Q&A를 실제로 수행하도록 설계한다. OpenAI 음성만 동작하는 상태로 파트너 조건을 충족했다고 주장하지 않는다. 사용자는 사전 개발 가능·OpenAI 키 보유를 확인했다.[^direction]

# Liner 계약

기본 연결은 `POST https://platform.liner.com/api/v1/chat/completions`, 초기 모델 후보는 `liner-gpt-router`로 둔다. 행사 키를 받은 즉시 모델 목록과 실제 응답을 확인하고, 접근 가능하면서 평가 질문을 통과하는 모델 ID를 `LINER_MODEL`에 고정한다. 공개 문서의 모델이 행사 키에서도 허용된다고 가정하지 않는다.[^liner]

서버 함수는 두 개면 충분하다.

- `generateNarration(evidence)`: 작가가 입력한 근거로 검수용 초안 생성. 출력이 자동 공개되지 않는다.
- `answerQuestion(question, evidence, context)`: 서버가 허용한 현재 공개 작품의 근거와 제한된 문맥으로 answer/citations/outcome 반환.

API 키는 서버 전용이다. 전시/작품/승인 상태 필터는 앱이 수행한다. 검색 API에 고객 원자료 전체를 맡기거나 공개 웹 검색으로 작가 의도를 보충하지 않는다. 결과의 구조·인용 ID·최종 공개 상태를 확인한 뒤 관람객에게 전달한다.

# 사전 개발과 행사 당일

| 시점 | 할 일 | 통과 조건 |
| --- | --- | --- |
| 오늘 | OpenAI STT/TTS 실호출, 한국어 작품 번호·짧은 해설 시험 | 마이크→인식과 확정 글→음성의 실제 성공 |
| 사전 개발 | Liner 입력/출력 계약의 mock, 승인 근거 조회·인용 검증 | UI와 서버 연결 가능. mock 표시 유지 |
| 행사 키 수령 직후 | 모델 조회, 해설 초안 1개·Q&A 3종 실호출 | 근거 있음/없음/다른 작품의 응답과 오류·사용량 확인 |
| 토요일 저녁 | 작품 3점·평가 질문 12개, 네 입출력 조합 | 실제 글 생성·음성 전체 경로 통과 |

행사 전용 Notion 가이드는 이전 조회에서 접근 불가였다. 공개 문서와 행사 계약·크레딧 범위가 같다고 간주하지 않는다. 계정 가입/크레딧 지급 확인은 기획 담당, 실제 기능 검증은 핵심 개발자가 맡는다.

# 음성 계약

`transcribe(recording)`과 `synthesizeSpeech(confirmedText)`를 분리한다. 녹음 후 인식문 확인·전송을 선택했으며 실시간 통화 SDK는 도입하지 않는다. 인식 입력과 낭독 출력을 독립적으로 바꾸는 네 조합이 필수다.

OpenAI `gpt-transcribe`와 `gpt-4o-mini-tts`를 사용한다. TTS는 **2027-01-06 종료 예정인 API의 단기 선택**이므로 해커톤 후 운영 지속 시 교체해야 한다. 모델 접근·한국어 품질은 오늘 실제 호출로 검증한다. 자세한 설정과 실패 처리는 [기술 스택](technology-stack.md)을 따른다.[^audio]

Liner에도 음성 엔드포인트가 문서화되어 있으나 행사 키의 지원 범위는 확인되지 않았다. 이미 검증한 OpenAI 음성을 행사 당일 무리하게 다시 바꾸지 않는다. 교체는 같은 계약에서 접근·품질·비용을 확인했을 때만 검토한다.[^liner-audio]

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
