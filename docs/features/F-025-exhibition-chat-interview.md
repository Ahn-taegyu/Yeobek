---
type: Feature
id: F-025
title: 전시 대화형 인터뷰
description: 전시 단위로 AI 질문 10개를 준비해 5개를 필수로 답하고, 원하면 5개씩 이어서 묻는 채팅 인터뷰.
status: draft
updated: '2026-11-15'
tags: [yeobek, author-experience, interview]
rag_include: true
generated:
  by: claude/opus-5.5
  at: '2026-11-15T00:00:00+09:00'
source_priority: unspecified
proposed_phase: MVP
decision_status: accepted
work_status: in_progress
build_order: 22
depends_on: [F-002, F-003, F-023, F-024]
sources:
- id: request
  resource: /references/user-figma-review-interview.md
  title: Figma 인터뷰·검토 와이어프레임 반영과 전시 인터뷰 진행 방식
---

# 범위

학습 뒤 인터뷰 화면(Figma 114/115)에서 전시 하나에 대한 대화형 인터뷰를 진행한다. 처음 질문 10개를 만들고 5개 답변을 필수로 받는다. 5개를 답하면 "추가 인터뷰를 진행할까요?"에서 추가 진행 또는 내용 검토를 고른다. 추가 진행을 고르면 다음 5개를 미리 만들어 둔다(대기 질문이 한 묶음 이하일 때만, 전체 최대 50개). 이후 5개마다 같은 선택을 다시 묻는다.

답변은 글 또는 음성(작가 미리보기 전사, 미리보기 플래그가 켜진 경우)으로 입력한다. 저장한 답변은 작가 본인의 말이므로 승인된 전시 근거로 바로 기록한다. 다시 답하거나 건너뛰면 이전 근거를 철회한다. 예상 질문 생성은 이미 승인 근거를 읽고, 해설 입력에는 이 근거를 추가한다. 다시 학습하면 반영된다. 질문은 기기 음성 합성으로 읽어 준다(음소거 가능).

## 구현 계약

- 화면: `/artist/exhibitions/[id]/interview`. 플래그는 기존 `FEATURE_ARTWORK_INTERVIEW`를 함께 쓴다(꺼지면 검토로 이동).
- API: `GET /api/admin/exhibitions/{id}/interview`, `POST …/interview/generations`(`{requestId}`), `PATCH …/interview/answers/{questionId}`(`save`·`skip`).
- 저장: `exhibition_interview_questions`, RPC `list_/save_exhibition_interview_answer`(작가), `reserve_/complete_exhibition_interview`(서비스 역할), `ai_jobs.kind='exhibition_interview'`. migration `20261115040000_exhibition_interview.sql`.
- 정책: `exhibition_interview_initial=10`, `_batch=5`, `_required=5`, `_max=50`.

작품별 사진 인터뷰 [F-024](F-024-artwork-text-interview.md)의 API·데이터는 유지하되 작성 흐름의 인터뷰 화면은 이 기능으로 바꾼다.
