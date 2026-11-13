---
type: Review
id: RES-001
title: 도슨트 Live 음성과 한국어 TTS 비교
description: GPT-Live·Gemini Live와 전용 TTS를 승인 해설·독립 입출력·일요일 마감 기준으로 비교한다.
status: draft
updated: '2026-11-13'
tags: [mawd, voice, research]
rag_include: true
generated:
  by: codex/gpt-6
  at: '2026-11-12T06:02:54+00:00'
sources:
- id: current-stack
  resource: /research/recommended-stack.md
  title: Render 제외 후 최신 스택·모델 권고
- id: request
  resource: /references/user-stack-review.md
  title: 사용자 재검토 요청
- id: openai-live
  resource: https://developers.openai.com/api/docs/guides/live-conversations
  title: GPT-Live 대화 제어
- id: gemini-live
  resource: https://aistudio.google.com/docs/models/gemini-3.8-live
  title: Gemini 3.8 Live
- id: typecast
  resource: https://typecast.ai/docs/ko/models
  title: Typecast 모델
- id: gemini-tts
  resource: https://aistudio.google.com/docs/speech-generation
  title: Gemini 음성 생성
- id: elevenlabs
  resource: https://elevenlabs.io/docs/overview/models
  title: ElevenLabs 모델
decision_status: proposed
---

# 판단

**11/13 현재 권고:** [RES-004](recommended-stack.md)에서 Typecast `ssfm-v31`과 MP3 스트리밍을 첫 시험 대상으로 구체화했다. 아래는 후보 비교 이력이며 한국어 우열의 실측 결과가 아니다.

**이번 MVP는 음성 인식 → 승인 근거로 글 확정 → 전용 TTS를 우선 권고한다.** 자연스러운 끼어들기와 연속 대화가 핵심 경험이 되면 Live를 평가한다. Live를 쓸 수 없어서가 아니라, 현재 필수인 네 입출력 조합과 승인된 글·음성의 일치를 가장 빨리 검증할 경로를 고르는 판단이다.

한국어 자연스러움의 우열은 공식 지원 언어와 데모 소개만으로 확정할 수 없다. 아래는 **청취 평가 후보**이며 실제 비교 청취·모델 접근·지연·비용 측정은 아직 하지 않았다.

# Live 모델

| 후보 | 확인한 기능 | 이 도슨트에 적용할 때 |
| --- | --- | --- |
| OpenAI `gpt-live-1` | 동시 말하기/듣기, 한국어 자연 음성 `noeul`, 텍스트·음성 입출력. client delegation으로 외부 백엔드 연결 가능 | Liner를 답변 백엔드로 연결하는 설계는 가능. 앱이 승인 답변·출처·발화 내용을 연결하고 재접속/중단을 처리해야 함 |
| Gemini `gemini-3.8-live` | 텍스트·이미지·음성 입력, 텍스트·음성 출력, 함수 호출, 한국어 지원 | 나중에 카메라와 연속 대화를 결합할 후보. 함수 호출 뒤 우리 서버에서 작품·승인 범위를 검사하도록 설계 |

근거: [GPT-Live 모델](https://developers.openai.com/api/docs/models/gpt-live-1), [음성과 대화](https://developers.openai.com/api/docs/guides/live-conversations), [외부 백엔드 위임](https://developers.openai.com/api/docs/guides/live-delegation), [Gemini 모델](https://aistudio.google.com/docs/models/gemini-3.8-live), [기능·언어](https://aistudio.google.com/docs/live-api/capabilities). Google 기능 가이드에는 Live API preview 안내가 있으므로 출시 안정성도 확인 대상으로 둔다. `noeul`은 GPT-Live 세션 음성으로 확인한 것이며 기존 Speech API의 `coral` 값만 바꾸면 된다는 뜻이 아니다.

OpenAI는 정확한 문구와 재생 종료 시점을 보장해야 하는 경우 앱이 검증한 녹음/렌더링 클립을 재생하도록 안내한다. 이 지침을 승인 해설에 적용하면 **게시 전 생성·검수한 음성 파일**이 유리하다. Live에 “이 글 그대로 읽어”라고 지시한 사실만으로 승인본과의 일치를 확인한 것으로 처리하면 안 된다. 전용 TTS도 생략·발음 오류 검증은 필요하다. [정확한 문구 재생 지침](https://developers.openai.com/api/docs/guides/live-conversations#manage-speech-and-transcripts)

Live를 도입하면 채팅 밖에 별도 통화 화면을 만드는 것이 아니라 기존 메시지/작품/공개 버전 ID에 음성과 전사 이벤트를 연결한다. 글 입력에서도 음성 출력이 가능하고, 음성 입력 뒤 글만 출력할 수 있어야 한다. **스피커를 음소거하는 것과 모델의 음성 생성을 끄는 것은 다르다.** 모드별 생성·전송·과금을 확인해야 한다. 브라우저에는 영구 API 키 대신 단기 세션 자격증명을 주고, 서버 도구 호출에서 권한을 다시 검사한다.

# 과금 방식은 서로 다르다

| 항목 | 2026-11-12 공개 가격 | 비교 시 주의 |
| --- | --- | --- |
| GPT-Live | 세션 분당 $0.05, 초 단위 과금. 백엔드 모델/도구 별도 | 열린 세션 30분이면 Live 부분만 $1.50. 발화 30분만을 의미하지 않음 |
| Gemini 3.8 Live | 공식 환산 기준 음성 입력 $0.005/분, 음성 출력 $0.018/분. 텍스트 등 별도 | 입력/출력 토큰 기준으로 계산. GPT-Live 세션 시간과 동일 단위로 비교할 수 없음 |

근거: [OpenAI 모델 가격](https://developers.openai.com/api/docs/models/gpt-live-1), [Google 가격](https://aistudio.google.com/docs/pricing#gemini-3.8-live). Google은 무료 등급도 안내하지만 요청 한도·데이터 이용 조건이 유료와 다르다. 비공개 작가 자료를 무료 테스트에 넣기 전에 계정 조건을 확인한다. 이번 조사에서 사용자 계정의 한도나 행사 크레딧 적용은 확인하지 않았다.

# 전용 TTS 청취 후보

| 후보 | 확인한 특징 | 우선 시험 목적 |
| --- | --- | --- |
| Typecast `ssfm-v31` | 한국어 포함 다국어, 감정/표현 제어와 텍스트 충실도 개선을 안내 | 한국어 설명체·미술 용어와 목소리 적합성의 첫 비교 후보 |
| Gemini `gemini-3.8-flash-tts` | 한국어 지원. 읽을 글과 스타일 지시를 구분하는 음성 생성 API | 승인 텍스트의 낭독과 차분한 도슨트 스타일 비교 |
| ElevenLabs `eleven_v4`, `eleven_v4_turbo` | 한국어 포함 다국어, 표현 중심 모델과 실시간 지향 모델 | 장문 억양·표현과 응답 속도의 균형 비교 |
| 기존 OpenAI `gpt-4o-mini-tts` | 현재 스택의 단기 REST TTS 선택, 2027-01-06 종료 예정 | 보유 키로 기본 경로 확인하는 비교 기준. 장기 기본값으로 유지하지 않음 |

근거: [Typecast 모델](https://typecast.ai/docs/ko/models), [Gemini TTS](https://aistudio.google.com/docs/speech-generation), [Gemini 모델](https://aistudio.google.com/docs/models/gemini-3.8-flash-tts), [ElevenLabs 모델](https://elevenlabs.io/docs/overview/models), [OpenAI 종료 안내](https://developers.openai.com/api/docs/guides/text-to-speech). 업체의 “자연스럽다”는 소개와 이 서비스에서의 청취 결과를 구분한다. 여기의 순서는 성능 순위가 아니다.

Typecast API 무료 플랜은 월 15,000크레딧이며 **비상업·출처 표시 조건**이 있다. Lite는 월 $15부터이며 초과량 자동 결제 조건이 있다. Studio 구독과 API 구독도 별개다. 따라서 무료 음성 샘플을 만들 수 있다는 사실을 상업 서비스에서 그대로 쓸 수 있다는 뜻으로 받아들이지 않는다. [API 가격·이용 조건](https://typecast.ai/kr/pricing/api/)

# 30~45분 비교 실험안 — 미실행

시간은 계획값이다. 먼저 기존 키의 기준 음성과 접근 가능한 대안 한 개만 비교한다. Typecast 키가 바로 준비되면 첫 후보로, 아니면 사용 가능한 Gemini TTS나 ElevenLabs를 비교한다. 도입한 모든 제공사를 동시에 구현하지 않는다.

아래는 실제 작가 정보가 아닌 **합성 테스트 문장**이다.

1. “18번 작품은 2024년에 제작한 그림입니다. 잠시 멈춰 화면 오른쪽 위를 바라봐 주세요.”
2. “작품의 크기는 가로 72.7센티미터, 세로 60.6센티미터입니다. 재료는 장지에 분채입니다.”
3. “겹겹이 쌓인 청색과 번짐 사이에서, 밝은 선이 느리게 이어집니다.”
4. “이 부분을 그린 이유는 승인된 자료에 없어 확인할 수 없습니다. 보이는 형태부터 함께 살펴볼까요?”
5. “지금 보시는 작품은 18번입니다. 19번 작품으로 이동하면 이어서 안내하겠습니다.”

숫자/단위 표기와 읽기용 표기는 분리할 수 있지만 사실·수량·작품 번호는 바꾸지 않는다. 인명은 시연 자료 확보 후 정답 발음을 추가한다. 20~30초 문장뿐 아니라 60~90초 해설도 한 번 비교한다.

| 평가 | 기록 |
| --- | --- |
| 정확성 | 작품 번호·연도·치수·재료·부정 표현의 오독, 생략, 추가 문장. 의미 변경은 탈락 |
| 자연스러움 | 업체명을 가리고 두 명 이상이 억양·속도·호흡·설명체를 각각 1~5점으로 평가 |
| 사용성 | 동일 휴대폰/네트워크에서 요청→첫 재생 시간, 중단/재시도, 긴 글 누락 |
| 운영 | 실제 모델 접근, API 응답 형식, 상업 이용 조건, 사용량·비용 기록 |

일요일까지는 합격한 한 목소리로 고정하고 `synthesizeSpeech(text, voiceVersion)` 경계만 유지한다. 승인 해설은 미리 생성·검수하고, 질문 답변은 확정 글을 요청 시 합성한다. 음성 변경은 글 해시·음성 버전과 연결한다. 통과 결과가 없으면 새 모델이 더 낫거나 실제로 교체되었다고 기록하지 않는다.
