---
type: Reference
id: SRC-059
title: 관람 채팅의 공개 중지 작품과 없는 번호 안내 구분
description: 번호로 물은 작품이 공개 중지된 경우와 처음부터 없는 번호를 다른 고정 문구로 안내하는 사용자 결정.
status: stable
updated: '2026-11-14'
rag_include: false
generated:
  by: claude-code/claude-opus-5-5
  at: '2026-11-14T22:10:00+09:00'
evidence: user-stated
sources:
- id: screen-spec
  resource: /specs/screen-spec.md
  title: SC-V04 공개 이용 불가
- id: frontend-handoff
  resource: /specs/frontend-handoff.md
  title: 프런트 API 인계
---

# 사용자 확정 요청

> 작품은 전시장에 아마 존재할테고 작가가 작품 공개 중지를 했다하더라도 관람객들이 원래 리스트에 있던 거에 대해 물었는데 찾을 수 없다는 식으로 나오면 우리 프로그램 문제라고 생각하거나, 관람객들이 당황스러워 할 거 같아서 안내를 중지했다고 고친거야 그래서 이 플로우는 유지하고 싶어. 상황1: 작가가 작품을 원래는 공개했다가 중지한 상황 -> 해당 작품을 찾으면 지금은 온라인 안내를 제공하지 않는다는 문구 보여주기. 상황2: 애초에 없는 숫자(or 작품)를 입력하면 찾을 수 없다고 표시하기.

팀장이 관람 프런트 담당자의 백엔드 수정을 허용했다고 사용자가 전달했다.

# 반영 내용

- 관람 채팅에서 공개 목록에 없는 번호를 물으면 서버가 `was_artwork_number_published`로 같은 공개 전시에서 그 번호로 게시된 적이 있고 작품이 삭제되지 않았는지 확인한다.
- 게시된 적이 있으면 `artworkPaused` “이 작품은 지금 온라인 안내를 제공하지 않아요. 작품 목록에서 안내 중인 다른 작품을 볼 수 있어요.”, 아니면 기존 `artworkUnavailable`로 답한다. 작품명·내용·초안 상태는 반환하지 않는다.
- 프런트가 서버 문구를 글자 그대로 비교해 바꾸던 처리를 제거하고 서버 문구를 그대로 표시한다.
- 오류 화면(SC-V04)은 기존처럼 미존재·비공개·삭제를 구분하지 않는다.
