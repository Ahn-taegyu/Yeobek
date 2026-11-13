---
type: Feature
id: F-022
title: 통합 채팅·독립 입력/출력 모드
description: 하나의 도슨트 채팅에서 해설·질문을 처리하고 텍스트/음성 입출력을 따로 선택한다.
status: draft
updated: '2026-11-13'
tags:
- mawd
- feature
- chat
rag_include: true
generated:
  by: codex/gpt-6
  at: '2026-11-12T14:38:57+09:00'
sources:
- id: knowledge-screens
  resource: /decisions/D-011-knowledge-and-screens.md
  title: AI용 내부 지식·DB 원본과 필수 화면 요구
- id: current-stack
  resource: /research/recommended-stack.md
  title: Render 제외 후 최신 스택·모델 권고
- id: chat
  resource: /references/user-chat-interaction.md
  title: 사용자 통합 채팅·입출력 모드 요구
- id: direction
  resource: /references/user-build-direction.md
  title: 사용자 최신 개발 방향
source_priority: prerequisite
proposed_phase: MVP
decision_status: proposed
work_status: not_started
build_order: 7
depends_on:
- F-021
---

# 목적과 첫 범위

사용자 추가 요구로 관람객 경험을 단일 채팅으로 묶는다. 음성 입력과 네 모드 조합은 첫 MVP의 필수 구성이다. 최초 목록에 독립 항목이 없었으므로 source_priority는 prerequisite로 기록하며 원래 볼드 항목이었다고 소급하지 않는다.

# 수용 기준

1. 입력=텍스트/음성, 출력=텍스트/음성의 네 조합을 모두 지원한다.
2. 한쪽 모드를 바꾸어도 다른 쪽 모드·현재 작품·대화 기록이 유지된다.
3. “18번 작품 설명해줘”를 말하거나 입력해 같은 채팅에서 해설을 받고 후속 질문을 이어간다.
4. 음성 입력 결과는 한 메시지로 처리하며 오인식·무음·권한 거부의 복구 경로가 있다.
5. 출력 변경은 동일 답변의 표현 변경이며 새 LLM 답변을 만들지 않는다. 음성 생성/재생 오류 시 같은 답변의 글과 재시도를 제공한다.
6. 작품 카드·번호·목록 선택도 같은 채팅의 대상 설정으로 연결한다.
7. 전시 온보딩 후 배경 작품 목록과 채팅을 제공한다. 작품 정보는 보조 화면이며 새 대화를 만들지 않는다.
8. 선택 작품을 상단 또는 입력창에 표시하고 선택/해제와 실제 요청 문맥을 일치시킨다. 그리드+상단 칩은 제안이며 상세 탐색만으로 선택을 바꾸지 않는다.

# 제안과 미결정

[기술 스택](../specs/technology-stack.md)에 따라 한국어 녹음 후 인식문 확인·전송, OpenAI STT와 별도 TTS, 기본 text/text, 녹음 30초/3MB, 탭 내 대화 기록으로 시작한다. 항상 듣는 실시간 음성 통화가 필수로 확정된 것은 아니다. 작품 이미지 부분 선택·카메라는 사용자 확정 [후순위](../decisions/D-007-visual-reference.md).

# 선행 조건

- [F-021 승인 버전 게시](F-021-publication.md)

상세 상태·문맥·예외는 [통합 채팅 명세](../specs/chat-interaction.md), 확정된 상호작용 방향은 [D-006](../decisions/D-006-interaction.md)을 따른다.
