---
type: Reference
id: SRC-037
title: Notion P0 기능명세와 사용자 보완
description: 작성자 제공 7개 기능명세 및 적용 범위 보완 기록.
status: stable
updated: '2026-11-14'
tags: [yeobek, requirements]
rag_include: false
generated:
  by: codex/gpt-6
  at: '2026-11-14T11:29:53+09:00'
sources:
- id: notion-f14
  resource: https://app.notion.com/p/4163559f052980c38044cc8a9037f141
  title: 작가 홈
- id: notion-f01
  resource: https://app.notion.com/p/4163559f052980d3b437ecfa7cf41494
  title: 전시 생성
- id: notion-f02
  resource: https://app.notion.com/p/4173559f0529808db6daea82ca358296
  title: 작품 및 자료 등록
- id: notion-f04
  resource: https://app.notion.com/p/4173559f052980beb06cd208ea38ad7c
  title: AI 해설 및 예상 질문, 답변 생성
- id: notion-f05
  resource: https://app.notion.com/p/4173559f05298044923eef8fa4e958fa
  title: 해설 검수 및 승인
- id: notion-f07
  resource: https://app.notion.com/p/4173559f052980b0985fe113d0153f90
  title: 전시 공개
- id: notion-f08
  resource: https://app.notion.com/p/4173559f05298064af0de819d1f8c566
  title: 관람객 AI 도슨트
evidence: user-stated
---

# 출처

Notion F14·F01·F02·F04·F05·F07·F08의 상세 본문을 확인했다. 위 링크는 작성자 원문이다. 이 문서는 반영 범위와 사용자 후속 보완을 기록한다.

# 후속 확인

- F01은 필수값 미입력 상태에서도 임시저장한다. 전시별 작품 세계는 전 항목 선택이며 비어도 작품 등록으로 이동한다.
- F02는 기본 정보와 전체 안내 질문을 항목별로 반영한다.
- F05에서 작가가 수정·승인한 해설과 답변은 F07의 공개 버전을 경유해 F08 응답 생성에 사용한다. 기존 공개 승인본과 새 편집본은 구분하며 미승인 자료는 노출하지 않는다.
- Notion F06과 F09를 독립 기능 목록에서 제거하고 F10을 F08에 통합한다. F03·F11·F12는 P1이다. F13은 D-016과 커밋 2ee577b를 보존한다.
