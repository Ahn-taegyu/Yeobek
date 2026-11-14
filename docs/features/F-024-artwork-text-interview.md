---
type: Feature
id: F-024
title: 사진 기반 작품 글 인터뷰
description: 작품 사진과 글의 빈 정보를 질문하고 작가 답변을 승인 가능한 근거 초안으로 저장한다.
status: draft
updated: '2026-11-15'
tags: [yeobek, author-experience]
rag_include: true
generated:
  by: codex/gpt-6
  at: '2026-11-14T22:19:00+09:00'
source_priority: unspecified
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

## 구현 계약

- 작가 화면 경로: `/artist/exhibitions/[id]/artworks/[artworkId]/interview`. 학습 완료 뒤 학습 화면에서 작품별로 진입하고 학습 화면으로 돌아간다([작성 순서](../decisions/D-018-author-experience.md#작성-순서-2026-11-15)).
- 서버 기능 플래그 `FEATURE_ARTWORK_INTERVIEW`는 기본 꺼짐이며, 꺼져 있을 때 생성·조회·변경 API는 사용할 수 없다.
- `GET /api/admin/artworks/{id}/interview`는 해당 작품의 인터뷰 질문과 저장된 답변 상태를 소유 작가에게 반환한다. 조회로 생성이나 공개를 수행하지 않는다.
- `POST /api/admin/artworks/{id}/interview/generations`는 작품 사진·글 자료를 바탕으로 답이 자료에 없는 질문을 최대 5개 생성한다. 기존 작업 원장과 한도를 재사용한다.
- `PATCH /api/admin/artworks/{id}/interview/answers/{questionId}`는 답변 저장, 건너뛰기, “공개 근거로 사용” 승인을 처리한다. 답변은 근거 초안으로 저장되며 승인과 게시 절차 전에는 공개 응답에 포함되지 않는다.
- 인증된 타 계정의 조회·생성·답변 변경은 404로 처리하고 DB 접근도 소유자 경계에 둔다.

세부 body·응답 계약은 [API 계약](../specs/api-contract.md#작품-글-인터뷰-계약-f-024)에 기록한다. 구현 근거 코드는 `src/lib/contracts/interview.ts` 및 `src/lib/contracts/routes.ts`; 저장 구조는 migration `supabase/migrations/20261115010000_artwork_text_interview.sql`이다.

# 수용 기준

- 새 플래그가 꺼지면 기존 흐름이 유지된다.
- 다른 계정의 조회·생성·답변 저장은 404이며 직접 DB 접근도 소유자 권한을 따른다.
- 인터뷰 원문과 미승인 답변은 공개 응답에 없고 명시적으로 승인한 근거만 게시 절차를 따른다.
- 최신 PR head의 단위·DB·HTTP·문서 CI와 교차 검토를 통과한다.
- 사진을 실제 읽는 모델의 품질 검증과 모의 계약 검증을 구분한다.
- 위 화면·세 API·기본 꺼짐 플래그와 소유권 경계가 연결되어 있으며, 세부 body 계약이 미정임을 문서화한다.

# 결정

[D-018 작가 검수·체험과 인터뷰](../decisions/D-018-author-experience.md). 구현 진행 중이며 실호출 품질·운영 활성화 완료를 뜻하지 않는다.
