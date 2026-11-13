---
type: Feature
id: F-002
title: 작가 자료·이미지·도록 입력
description: 작품 제목·번호·사진·작가 메모, 선택적 재료·크기·제작연도, 도록 파일과 근거 발췌문을 저장한다. 일요일에는 PDF 보관·수동
  발췌 연결까지 구현하고 자동 추출 수준은 후속 결정한다.
status: draft
updated: '2026-11-13'
tags:
- mawd
- feature
rag_include: true
generated:
  by: codex/gpt-6
  at: '2026-11-12T14:38:57+09:00'
source_priority: P1
proposed_phase: MVP
decision_status: proposed
work_status: not_started
build_order: 2
depends_on:
- F-001
- F-023
sources:
- id: knowledge-screens
  resource: /decisions/D-011-knowledge-and-screens.md
  title: AI용 내부 지식·DB 원본과 필수 화면 요구
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
---

# 목적과 첫 범위

작품 제목·번호·사진·작가 메모, 선택적 재료·크기·제작연도, 도록 파일과 근거 발췌문을 저장한다. 일요일에는 PDF 보관·수동 발췌 연결까지 구현하고 자동 추출 수준은 후속 결정한다.

입력은 일반 폼으로 받고 작가/전시/작품에 해당하는 내부 지식 문서·section·출처로 저장한다. 작가 공통 정보는 재입력하지 않고 연결한다. 이는 사용자용 위키 편집기나 자동 OCR을 추가하는 기능이 아니다. [내부 지식 계약](../specs/artist-knowledge.md).

# 우선순위

- 사용자 원안: **P1**.
- 현재 구현 제안: **MVP**. 사용자 원안과 상세 설계 제안을 구분한다.
- 구현 상태: 미착수. 이 문서는 기능명세이며 앱 구현 완료 표시가 아니다.

# 수용 기준

1. 작품 이미지·제목·전시 내 고유 번호를 입력·수정·저장할 수 있다.
2. 원자료, 파일/쪽수, 발췌문, 대상 작품 연결을 보존한다. 파일 접수와 Q&A 근거 등록을 구분한다.
3. 업로드 중·완료·실패와 형식/용량 오류를 표시하고 실패해도 입력 메모를 잃지 않는다.
4. 이미지에서 작가의 생각·감정을 추정해 확정 정보로 저장하지 않는다.
5. 자료가 없으면 필수 정보 부족을 안내한다. 자동 추출 없이 직접 이미지·설명을 등록할 수 있다.

# 제외 및 미결정

지원 확정 전 HEIC·DOCX·스캔 OCR·사진 자동 매칭을 제공한다고 약속하지 않는다. PDF 텍스트/이미지/레이아웃 자동 추출은 이번 마감에서 제외하고 샘플 확인 후 결정한다. 이미지 3MB·PDF 6MB의 초기 제한은 [기술 스택](../specs/technology-stack.md)을 따른다.

# 선행 조건

- [F-001 전시 개설·작가 접근](F-001-exhibition.md)
- [F-023 AI용 연결 지식 저장](F-023-artist-knowledge.md)

# 근거와 연결

[사용자 원안](../references/user-mvp.md) · [사용자 추가 결정](../references/user-answers.md) · [기능명세 전체](../specs/functional-spec.md)
