---
type: Research
id: RES-010
title: Liner 도슨트 모델 비교와 재작성·음성 실측
description: 소량 한국어 비교, 토큰 부족 원인, PCM 변환과 공통 도슨트 설정 및 검증 한계.
status: draft
updated: '2026-11-14'
rag_include: true
generated:
  by: codex/gpt-6
  at: '2026-11-14T21:30:00+09:00'
sources:
- id: user
  resource: /references/user-liner-voice-evaluation.md
  title: Liner 수정과 공통 도슨트 요구
- id: catalog
  resource: https://liner.com/ko/developers/docs/llm-gateway
  title: Liner 모델 카탈로그
- id: chat
  resource: https://liner.com/developers/docs/liner-model-api-chat-completions
  title: Liner Chat Completions
- id: speech
  resource: https://liner.com/ko/developers/docs/liner-model-api-audio-speech
  title: Liner 음성 합성
---

# 선택과 설정 이전

해설·예상 Q&A·미리보기·재작성·관람 생성은 `AI_ROUTE_DOCENT` 한 설정을 사용한다. 초기 기본값은 `liner:openai/gpt-6-luna`, 별도 평가는 `liner:anthropic/claude-sonnet-5.5`다. 모델 ID는 사용자 직접 지명이 아니라 아래 실측과 독립 계열 유지에 따른 구현 선택이다. 자료 정리·파일 읽기·운영 자동화는 공통 도슨트 범위가 아니다. 승인된 기본 해설은 저장 원고를 그대로 반환한다.

기존 `AI_ROUTE_DRAFT`·`AI_ROUTE_QA`는 공통 별칭이다. DOCENT까지 포함해 설정한 값이 서로 다르면 요청 전에 설정 오류를 낸다. **기존 배포는 서로 다른 DRAFT·QA를 제거하고 DOCENT 한 값으로 이전한 후 새 코드를 배포**해야 한다. 키 당일 설정 검사는 외부 호출 없이 충돌을 검출한다. 원격 설정은 이 변경에서 수정하지 않는다.

# 토큰 실패 원인

기존 재작성 심사는 최종 `grounded` 불리언 JSON이 짧다는 이유로 256 completion 토큰을 배정했다. 하지만 실제 Liner 응답의 completion 사용량에는 최종 문자열 외에 추론 사용량도 들어갔다. Gemini가 상한 부근에서 `finish_reason=length`로 끝나 JSON을 완성하지 못했다. 입력 문맥 초과나 한국어 600자 제한 문제가 아니다. 추론 원문은 수집·평가 근거로 사용하지 않는다.

재작성 평가는 3,000토큰으로 늘리고 새 답변 생성이 아닌 심사 역할을 명시했다. 한도는 목표 사용량이 아니며 실제 소비는 별도다. 호출당 30초·전체 65초, 불완전 응답 거부, 승인 분리, 자동 재시도 없음은 유지한다. narration 판정과 같은 유한 예산이며 더 강한 모델도 무제한 시간/추론을 허용하지 않는다. `reasoning_effort`는 새로 강제하지 않았으며 제공사 기본 동작으로 실측했다.

# 같은 입력의 생성 비교

Liner 계정의 모델 목록에서 고정 ID 지원을 확인했다. 같은 침실 근거·프롬프트·JSON·1,600토큰 상한으로 소개, 사실 질문, 근거 없는 상징 질문을 각각 1회 생성했다. 사례별 두 모델은 병렬 실행했다. 캐시 조건은 동일하지 않았고 모델당 3건뿐이다.

| 모델 | 소개 | 사실 질문 | 근거 부족 질문 | 3건 usage.cost 합계(USD) |
| --- | --- | --- | --- | --- |
| Gemini 3.8 Flash | 11.575초 | 6.234초 | 16.325초 | 0.008185125 |
| GPT-6 Luna | 4.357초 | 2.847초 | 2.043초 | 0.001166430 |

둘 다 자연스러운 격식체였고 Luna는 간결했다. Flash는 더 풀어 설명했지만 이번 표본에서 언어적 우위는 입증하지 못했다. Luna의 비용·속도가 MVP에 유리했으나 한국어 전체·장문·다른 작품으로 일반화할 수 없다. 한국어 특화 모델과 Haiku 등은 추가 후보이며 검증한 것으로 취급하지 않는다.

모델명을 가린 6답변과 사실을 뒤집은 대조 답변 1개를 Sonnet에 전달했다. Sonnet은 대조 오답을 거절했다. 상위 범용 모델을 독립 계열로 배치하는 선택이며 단 한 번의 판정이 객관적 우월성을 증명하지 않는다. Flash의 지리·색상 표현에 대한 보수적인 부적합 판정은 부모가 원문과 다시 대조했다. 자동 점수도 오판할 수 있다.

교차 검토에서 초기 Luna가 본문은 유보하면서 `outcome=answered`였음을 발견했다. 비교 judge 입력에는 outcome이 빠져 이를 잡지 못했다. 관련 정보를 인용해 미답변을 answered로 바꾸지 말라는 예시를 검색 스킬에 추가했다. 실제 관람 재검증에서는 `insufficient_evidence`·빈 인용·고정 문구를 반환했고 필요한 사실 질문은 계속 answered였다. 프롬프트가 의미 오류를 완전히 제거했다는 뜻은 아니다.

# 음성 변환과 검증

Liner 실제 오류는 Gemini TTS가 PCM만 지원한다며 MP3 요청을 거절했다. Gemini TTS 경로에 한해 PCM을 요청하고 `audio/pcm;rate=24000;channels=1` 및 16비트 샘플 길이를 검사해 MP3로 변환한다. 다른 Liner 음성 모델은 기존 MP3 요청을 유지한다.

고정 의존성 `@breezystack/lamejs` 1.2.7(LGPL-3.0)을 사용한 서버 내 24kHz 모노·64kbps 변환이다. 8MiB 상한, 읽기·변환 전체 기한, 취소 검사를 유지한다. 별도 바이너리·외부 변환 서비스·Storage MIME·HTTP·DB migration 변경은 없다. 동일 모델/목소리의 MP3 출력 의미가 유지되므로 이 수정만으로 설정 버전을 올리지 않는다. 모델/목소리를 바꾸면 기존 규칙대로 버전을 올린다.

로컬 반 고흐 계정에서 Luna 후보 2개+Sonnet 평가, 미리보기, 지시문 생성+판정이 성공했다. 이전 실패 작업은 게시 후 버전이 달라 409로 거절되어 현재 문맥의 새 미리보기에서 재작성했다. 기존 원고를 자동으로 덮어쓰거나 실패 결과를 성공으로 고치지 않았다.

예상 Q&A 최초 호출에서 인용 ID 한 글자가 달라 서버가 차단했다. 모델 스키마에 이번 호출의 허용 인용 ID enum을 추가했고 명시적 재시도 1회가 성공했다. 서버 사후 검사도 유지한다. 관람 답변 TTS는 MP3로 성공했으며 같은 요청 재전송은 동일 바이트를 반환하고 외부 합성을 추가하지 않았다.

Windows Edge 관람 화면에서 음성을 켠 채 질문을 보낸 뒤 작품 자동 선택·이미지·텍스트를 확인했다. 실제 speech 200 후 재생 시작 promise가 성공해 답변 듣기 버튼이 다시 활성화됐고 재생 오류 안내가 없었다. 이는 재생 경로 확인이며 사람의 음질·발음 청취 평가를 대신하지 않는다.

키/계정 비밀번호/세션 쿠키/추론 원문은 기획 저장소에 넣지 않는다. 표시 비용은 비교 응답에 한하며 전체 차감액/잔액이 아니다. 실제 관람객·미술 전문가 평가, 긴 음성·모바일 Safari·부하·운영 배포는 별도 확인해야 한다.
