---
type: Decision
id: D-011
title: AI용 작가 지식 위키와 작가·관람객 필수 화면
description: DB 원본의 내부 지식 연결과 작가 홈·전시 온보딩·작품 정보·채팅 대상 표시 요구를 반영한다.
status: draft
updated: '2026-11-13'
tags: [yeobek, knowledge, screens]
rag_include: true
generated:
  by: codex/gpt-6
  at: '2026-11-13T02:37:18+00:00'
sources:
- id: screens
  resource: /references/user-wiki-screens.md
  title: 사용자 화면·저장 요구
- id: storage
  resource: /references/user-wiki-storage.md
  title: DB 원본 선택
- id: purpose
  resource: /references/user-wiki-purpose.md
  title: AI용 내부 위키와 작가 열람 질문
decision_status: accepted
decision_basis: user-confirmed
---

# 사용자 확정 요구

- 작가 입력은 **AI가 검색·참조할 내부 위키형 지식**으로 저장한다. 작가 정보와 전시 정보를 분리하고 작품·원자료·출처와 연결한다.
- **DB를 원본으로 저장한다.** 현재 기획 docs의 자료를 제품 DB에 섞거나 Markdown 파일을 별도 원본으로 이중 관리하지 않는다.
- 작가 로그인, 작가 정보·전시 기록·새 전시 시작을 갖춘 작가 홈, 전시 정보 입력이 필요하다.
- 관람객에게 전시 온보딩, 작품 목록을 배경으로 둔 기본 채팅, 작품 정보 화면을 제공한다. 선택 작품은 채팅 상단 또는 입력창의 mention 형태로 표시한다.
- 단일 채팅·독립 입출력·승인된 자료만 관람에 사용한다는 기존 결정은 유지한다.

# 요구를 구현하는 설계 제안

기존 SC-A01 로그인은 유지, SC-A02는 작가 홈으로 확장, SC-A03은 전시 생성/정보 입력으로 수정한다. SC-V01 채팅과 SC-V02 작품 목록의 배치를 바꾸고 SC-V05 온보딩·SC-V06 작품 정보를 추가한다. 기존 ID를 재번호하지 않는다.

초기 배치는 **작품 그리드 + 채팅 상단의 선택 작품 칩**을 제안한다. 입력창 mention·보기 전환 토글·여러 작품 동시 지칭을 필수로 추가하지 않는다. 이 배치 자체가 사용자 확정이라는 뜻은 아니다.

작가에게는 기존 정보 입력/수정·검수 화면에서 AI 참고 근거와 사용 승인 범위를 보여주는 안을 제안한다. **별도 전체 위키 탐색·Markdown 편집·그래프 화면은 MVP에 추가하지 않는다.** 작가 열람에 대한 후속 질문의 권고안이며 별도 화면의 최종 채택 결정이 아니다.

# 연결과 상태

[내부 지식 계약](../specs/artist-knowledge.md), [화면 명세](../specs/screen-spec.md), [기능명세](../specs/functional-spec.md), [F-023](../features/F-023-artist-knowledge.md)에 반영한다. 입력 폼을 구조화해서 저장하는 기능이며 새로운 AI 인터뷰·자동 OCR·위키 작성 에이전트를 P1으로 올리지 않는다. 현재 로그인·조회 화면 골격, DB·초안 저장 API는 일부 구현했다. 편집·검수·게시 화면과 제품 RAG·실제 관람 검증은 남아 있다. [실제 개발 범위](../specs/development-foundation.md)와 [재검토서](../reviews/mvp-foundation-2026-11-13.md)를 기준으로 구분한다.
