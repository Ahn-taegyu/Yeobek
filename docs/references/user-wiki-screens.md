---
type: Reference
id: SRC-014
title: 작가 지식 저장과 작가·관람객 화면 수정 요청
description: 작가·전시 정보 연결 저장과 홈·온보딩·작품 정보·채팅 대상 표시 요구 원문.
status: stable
updated: '2026-11-13'
tags: [yeoback, requirements, screens]
rag_include: false
generated:
  by: codex/gpt-6
  at: '2026-11-13T02:37:18+00:00'
sources: []
evidence: user-stated
---

# 사용자 요청

> 기획, 기능 수정
>
> - 작가가 입력하는 정보가 현재 docs폴더처럼 wiki화 되어 저장되어야 한다. 작가 정보, 전시 정보가 따로 정리되어 연결되는게 좋을 것 같다.
> - 필요 화면(현재 기획에 없다면 추가, 다르다면 수정, 있다면 유지)
>   - 작가
>     - 작가 로그인
>     - 작가 홈(작가 정보, 전시 기록, 새 전시 시작)
>     - 전시 정보 입력
>   - 관람객
>     - 전시 온보딩
>     - 기본 채팅 화면(배경에 작품 목록 <- 그리드 or 리스트)
>     - 작품 정보 화면
>     - 작품 선택 시 채팅창 상단에 표시 혹은 입력창에 mention 처럼 표tl

# 해석 경계

마지막 `표tl`은 문맥상 작품 선택의 표시 요구로 해석한다. 그리드/리스트와 상단/mention 중 하나가 확정된 발언은 아니다. 실제 앱 구현이나 별도 위키 편집기 개발을 요청한 것으로 확대하지 않는다.

저장 방식은 [후속 선택](user-wiki-storage.md), 위키의 목적과 작가 열람 질문은 [추가 설명](user-wiki-purpose.md), 반영은 [D-011](../decisions/D-011-knowledge-and-screens.md)을 따른다.
