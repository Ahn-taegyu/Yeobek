---
type: Decision
id: D-007
title: 부위 지칭과 이미지·카메라 범위
description: 말·글 지칭을 먼저 만들고 이미지 부분 선택·카메라를 후순위로 두기로 확정했다.
status: draft
updated: '2026-11-12'
tags:
- mawd
rag_include: true
generated:
  by: codex/gpt-6
  at: '2026-11-12T14:38:57+09:00'
sources:
- id: chat
  resource: /references/user-chat-interaction.md
  title: 사용자 통합 채팅·입출력 모드 요구
- id: liner
  resource: https://liner.com/developers/docs/liner-model-api-chat-completions#image-input
  title: Liner image input
- id: media
  resource: https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia
  title: Web media access
- id: direction
  resource: /references/user-build-direction.md
  title: 사용자 최신 개발 방향
decision_status: accepted
decision_basis: user-confirmed
---

# 결정 상태

**accepted**. 사용자는 이후 “이미지 부분 선택과 카메라는 후순위로 두고”라고 확정했다. 말·글 지칭으로 네 입출력 조합을 먼저 구현한다. 등록 이미지의 모델 분석까지 후속으로 두는 것은 [D-008](D-008-technology-stack.md)의 일정상 구현 선택이다. [최신 응답](../references/user-build-direction.md).

# 첫 MVP

말·글의 위치/모양 설명과 직전 대화로 부위를 특정하고 모호하면 되묻는다. 이미 등록된 작품 이미지를 채팅 카드에 보여주는 것은 가능하지만, 이미지 표시만으로 부분 선택·시각 분석을 구현했다고 부르지 않는다.

승인 자료에 부위 설명이 없다면 이미지 인식이 없는 도슨트는 그려진 대상을 확정할 수 없다. 파일럿에서는 필요한 시각 설명을 작가 자료에 포함한다. 등록 작품 이미지를 모델에 함께 전달하는 시각 분석도 일요일 구현에서 제외한다. 이후 실제 자료·응답 품질·비용을 확인한 뒤 추가한다.

# 기능을 나누어 판단

| 기능 | 추가 구현 | 제안 |
| --- | --- | --- |
| 채팅에 등록 작품 사진 표시 | 기존 공개 이미지 카드 | MVP에 포함 가능 |
| 말·글로 “오른쪽 위 둥근 것” 지칭 | 현재 작품·부위 문맥, 되묻기 | 첫 MVP 기본 |
| 등록 작품 사진을 AI가 참고 | 이미지 지원 모델, 근거 구분·품질 평가 | 일요일 이후 검증 |
| 등록 이미지에서 부분 터치/선택 | 좌표/영역 선택, 확대·크롭·화면 크기 대응 | 사용자 확정 후순위 |
| 카메라로 촬영해 질문 | 권한·촬영/업로드·회전·크기·재촬영·이미지 분석 | 사용자 확정 후순위 |

# 현실성의 근거와 한계

라이너 공식 문서는 텍스트와 이미지 입력을 함께 보내는 방식을 지원한다. 따라서 이미지 기반 질문은 기술적으로 가능하지만 행사 키의 모델·제한과 실제 작품 정답률은 검증되지 않았다.[^liner]

모바일 웹 카메라/마이크 사용은 브라우저 권한과 보안 환경 조건을 다뤄야 한다. 따라서 카메라는 기존 이미지 표시보다 별도 구현·실기기 검증이 필요하다는 판단이다.[^media]

첫 마감이 11월 15일 아침이고 핵심 개발자가 한 명이므로, 단일 채팅의 네 입출력 조합을 먼저 완성하고 이미지 입력 UI는 후속으로 둔다. 작품 인식 방식 QR·숫자와 이 질문용 이미지 입력은 별개다. 카메라 질문을 넣는다고 작품 자동 식별까지 구현한 것으로 보지 않는다.

[^liner]: [Liner Image input](https://liner.com/developers/docs/liner-model-api-chat-completions#image-input).
[^media]: [MDN getUserMedia](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia).
