---
type: Decision
id: D-006
title: 하나의 도슨트 채팅과 독립 입출력
description: 해설·질문을 한 채팅에서 처리하고 텍스트/음성 입력과 출력을 각각 선택한다.
status: stable
updated: '2026-11-14'
tags:
- mawd
rag_include: true
generated:
  by: codex/gpt-6
  at: '2026-11-12T14:38:57+09:00'
sources:
- id: user
  resource: /references/user-mvp.md
  title: 최신 사용자 MVP 우선순위
- id: notion
  resource: /references/notion-planning.md
  title: 수정 중인 Notion 기획
- id: answers
  resource: /references/user-answers.md
  title: 2026-11-12 사용자 범위·팀·일정 확인
- id: chat
  resource: /references/user-chat-interaction.md
  title: 사용자 통합 채팅·입출력 모드 요구
- id: direction
  resource: /references/user-build-direction.md
  title: 사용자 최신 개발 방향
decision_status: accepted
---

# 결정 상태

**accepted** — 사용자가 단일 채팅과 입력/출력의 독립 선택을 명시했다. 구체적인 음성 제공사·녹음 방식은 설계 제안으로 남긴다.

# 내용

해설 요청·질문·추가 설명을 하나의 채팅에서 처리한다. 입력과 출력은 각각 텍스트/음성 모드를 독립 선택하며 네 가지 조합을 모두 지원한다. “18번 작품 설명해줘” 같은 발화와 입력을 같은 대화 흐름에서 처리한다.

# 영향

음성 인식 입력을 첫 MVP에 포함하고, Q&A 답변도 선택에 따라 글 또는 음성으로 전달한다. 작품을 바꿔도 같은 채팅 기록을 유지하되 검색에 쓸 활성 작품 문맥은 새로 설정한다. 작가 AI 인터뷰(P2)와 관람객 음성 입력은 별개다. 기존 텍스트 전용 질의 가정은 이 결정으로 대체한다.

# 남은 사항

[D-008](D-008-technology-stack.md)에서 기본 text/text, 한국어 녹음 후 인식문 확인·전송, OpenAI STT/TTS를 선택했다. 실제 모델 접근·한국어 품질은 시험해야 한다. 항상 듣기/실시간 통화는 이번 범위에 없다. 부위 지칭과 이미지·카메라 후순위 결정은 [D-007](D-007-visual-reference.md)을 따른다.

# 근거

[사용자 통합 채팅 요구](../references/user-chat-interaction.md), [통합 채팅 명세](../specs/chat-interaction.md). 기존 문서보다 이번 사용자 요구를 우선한다.

## 후속 P0 적용

현행 전시 QR, 작품 목록과 관람 답변 출력 흐름은 [D-017](D-017-p0-feature-spec.md)을 따른다. 위 내용은 당시 결정 기록이다.
