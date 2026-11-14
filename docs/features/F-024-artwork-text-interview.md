---
type: Feature
id: F-024
title: 사진 기반 작품 글 인터뷰
description: 작품 사진과 글의 빈 정보를 질문하고 작가 답변을 승인 가능한 근거 초안으로 저장한다.
status: draft
updated: '2026-11-14'
tags: [yeobek, author-experience]
rag_include: true
generated:
  by: codex/gpt-6
  at: '2026-11-14T23:10:00+09:00'
source_priority: prerequisite
proposed_phase: MVP
decision_status: accepted
work_status: in_progress
build_order: 21
depends_on: [F-002, F-003, F-023]
sources:
- id: request
  resource: /references/user-author-experience-parallel.md
  title: 작가 검수·체험 개선과 AI 인터뷰 병렬 구현 요청
---

# 범위

작품별 인터뷰 시작 → 사진·글 자료에서 답이 없는 질문 최대 5개 생성 → 작가 글 답변 또는 건너뛰기 → 근거 초안 저장 → “공개 근거로 사용”에서 승인한다. 생성은 기존 작업 원장과 한도를 재사용한다. 질문·답변 테이블과 소유자 권한, 생성·목록·답변 저장 API, 화면 및 기본 꺼짐 플래그를 구현한다.

기존 [F-012](F-012-interview.md)와 Notion F03 녹음 인터뷰를 대체하지 않는다. 해설 생성의 보완 질문 최대 3개는 별도로 유지한다.

# 수용 기준

- 새 플래그가 꺼지면 기존 흐름이 유지된다.
- 다른 계정의 조회·생성·답변 저장은 404이며 직접 DB 접근도 소유자 권한을 따른다.
- 인터뷰 원문과 미승인 답변은 공개 응답에 없고 명시적으로 승인한 근거만 게시 절차를 따른다.
- 최신 PR head의 단위·DB·HTTP·문서 CI와 교차 검토를 통과한다.
- 사진을 실제 읽는 모델의 품질 검증과 모의 계약 검증을 구분한다.

# 결정

[D-018 작가 검수·체험과 인터뷰](../decisions/D-018-author-experience.md). 구현 진행 중이며 실호출 품질·운영 활성화 완료를 뜻하지 않는다.
