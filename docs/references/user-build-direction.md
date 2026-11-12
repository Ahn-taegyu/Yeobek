---
type: Reference
id: SRC-008
title: 사용자 확인 — 구현 스택 선정·사전 개발·API 키
description: 이미지 입력 후순위, 기술 선택 위임, 사전 개발 허용과 OpenAI 키 보유를 기록한다.
status: stable
updated: '2026-11-12'
tags:
- mawd
rag_include: false
generated:
  by: codex/gpt-6
  at: '2026-11-12T14:38:57+09:00'
evidence: user-confirmed
resource: conversation:user-build-direction/2026-11-12
---

# 사용자 원문

> 좋아. 이미지 부분 선택과 카메라는 후순위로 두고, 일요일 아침까지 구현할 수 있도록 지금 MVP에 맞는 기술 스택과 개발 순서를 정해줘.

사전 개발 가능 여부에 대한 답:

> 사전 개발 가능

행사 전 음성 테스트에 사용할 OpenAI API 키 보유 여부에 대한 답:

> 사용 가능한 키가 있음

# 해석과 경계

- 이미지 부분 선택과 카메라를 첫 MVP에서 미루는 것은 사용자 확정이다.
- 기술 스택과 개발 순서의 선택을 assistant에게 위임했다. 선정 결과는 [D-008](../decisions/D-008-technology-stack.md)에 기록하며, 사용자가 개별 서비스·모델을 직접 지명했다고 기록하지 않는다.
- 사전 제품 코드 개발이 가능하다. 오늘·금요일을 구현 일정에 포함한다.
- OpenAI 키는 사용 가능하다는 사용자 확인이며 키를 받거나 호출·잔액·모델 접근을 검증한 것은 아니다. 키 값은 이 문서에 저장하지 않는다.
- 실시간 음성 통화, PDF 자동 추출, 시각 분석, 정확한 공식 제출 시각을 새로 확정한 응답은 아니다.
