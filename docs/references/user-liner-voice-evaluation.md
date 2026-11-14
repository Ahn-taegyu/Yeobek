---
type: Reference
id: SRC-062
title: Liner 재작성·음성 수정과 도슨트 모델 통일 요청
description: 실제 호출 오류 수정, 음성 재생 검증, 생성·평가 모델 비교와 공통 모델 요구.
status: stable
updated: '2026-11-14'
rag_include: false
generated:
  by: codex/gpt-6
  at: '2026-11-14T21:30:00+09:00'
evidence: user-stated
---

# 사용자 요청

> 재작성 평가 토큰 부족과 Liner TTS 형식 문제 수정해줘. 수정 후 실제 호출로 다시 검증하고, 반 고흐 시연에서 음성 재생까지 되게 해줘. 그리고 토큰 제한 문제가 왜 발생하는지 파악하고 해설 생성에 gemini flash나 다른 언어적에 이점이 있고 속도나 사용량에 효율이 좋은 모델이 있는게 어떨지 궁금하고 평가 모델에 좀 더 추론 능력이 높은 모델이 들어가야 할 것 같아. 그리고 Q&A/미리보기/관람은 관람객에게 해설이나 질의를 하는 모델과 같은 모델로 해야해.

앞선 요청에서 지급된 Liner 크레딧 실호출과 반 고흐 시연 계정/정보 입력을 허용했다. 공통 도슨트 사용은 사용자 확정이며 구체적인 모델 ID와 토큰 예산은 실측에 따른 구현 판단이다. 원격 설정 변경을 수행한 것으로 해석하지 않는다.

[하네스](../specs/ai-harness.md), [키 당일 점검표](../specs/key-day-checklist.md), [실측 비교와 한계](../research/liner-docent-live-validation.md)에 연결한다.
