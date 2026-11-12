---
type: Decision
id: D-004
title: 도록 입력과 파일 범위
description: PDF 접수와 자동 추출·OCR·작품 매칭을 구분한다.
status: draft
updated: '2026-11-12'
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
- id: direction
  resource: /references/user-build-direction.md
  title: 사용자 최신 개발 방향
decision_status: partial
---

# 결정 상태

**partial** — 사용자가 위임한 일정·스택 선택에 따라 일요일 구현은 PDF 보관·수동 발췌 연결로 정했다. 장기 자동 추출·OCR 수준은 미확정이다. [D-008](D-008-technology-stack.md).

# 내용

PDF 접수와 자동 추출·OCR·작품 매칭을 구분한다.

# 영향

일요일에는 이미지·제목·메모와 도록 PDF를 접수하고, 작가가 관련 발췌문·쪽수를 입력해 작품에 연결한다. 자료 접수 P1을 유지하면서 자동 OCR·사진 추출·작품 매칭을 후속으로 둔다. 사진 3MB, PDF 6MB의 초기 상한은 [기술 스택](../specs/technology-stack.md)의 구현 선택이다.

# 남은 사항

사용자는 아직 자료가 없으며 PDF에 사진·설명이 함께 있을 때의 차이를 질문했다. 텍스트 PDF/스캔 PDF와 페이지 배치에 따른 차이를 설명했다. 장기 자동화 수준은 여전히 미정이다. 첫 마감의 수동 발췌 구현과 구분한다. 샘플 도록을 확보해 글자 선택 여부·한 페이지 작품 수·사진 해상도·설명 연결을 확인한 뒤 추출 범위를 정한다. 작품 자동 연결은 방문객 카메라 인식과 다른 기능이다.

# 근거

[사용자 원안](../references/user-mvp.md), [추가 응답](../references/user-answers.md), [Notion 초안](../references/notion-planning.md).
