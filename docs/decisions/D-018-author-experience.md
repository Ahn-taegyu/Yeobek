---
type: Decision
id: D-018
title: 작가 검수·체험 개선과 사진 기반 글 인터뷰
description: 현재 사용자 요청의 다섯 구현 범위와 인터뷰 네 가지 기준.
status: draft
updated: '2026-11-14'
tags: [yeobek, author-experience]
rag_include: true
generated:
  by: codex/gpt-6
  at: '2026-11-14T22:19:00+09:00'
decision_status: accepted
sources:
- id: request
  resource: /references/user-author-experience-parallel.md
  title: 작가 검수·체험 개선과 AI 인터뷰 병렬 구현 요청
---

# 결정

[사용자 요청](../references/user-author-experience-parallel.md)에 따라 근거는 접어서 표시하고, 최근 학습 조회와 상시 질문·체험 진입을 제공한다. 예상 Q&A는 지시문 기반 재작성과 개별 사용·중지를 지원한다. 체험은 관람 컴포넌트를 재사용하되 작가 인증 아래 초안과 미리보기 전용 음성 API를 사용한다.

# 인터뷰의 네 가지 구현 기준

1. 작품당 질문 최대 5개.
2. 답변은 글 입력만 지원한다.
3. 저장된 답변은 근거 초안이며, 인터뷰의 “공개 근거로 사용”에서 명시적으로 승인한다.
4. 해설 생성 보완 질문 최대 3개와 합치지 않는다.

새 기능은 [F-024](../features/F-024-artwork-text-interview.md)로 구분한다. 기존 F-012 및 Notion F03 녹음 인터뷰의 우선순위·범위는 유지한다. 새 플래그는 기본 꺼짐이다.

# 공개 경계와 검증

인터뷰 질문·미승인 답변과 미리보기 대화·음성은 공개 응답에서 제외한다. 작가가 승인한 인터뷰 답변만 기존 게시 승인·스냅샷 절차를 거쳐 해설·예상 질문·관람 응답 근거가 될 수 있다. 다른 계정은 404를 받아야 한다. 인터뷰 사진 품질은 모의 실행으로 검증했다고 기록하지 않는다.

# 실행 순서

결정 기록 → B의 최근 학습 조회 API 선행 병합 → A·B·C 각 PR. B migration은 20261115000000~20261115005959, C는 20261115010000~20261115015959를 사용한다. 로컬 Supabase는 C만 소유하고 B는 DB 회귀를 CI로 확인한다. review.tsx는 A만 편집하며 공유 계약은 담당 항목만 추가한다. 병합 직전 최신 main 통합과 해당 head CI·교차 검토가 필요하다.

기능 완료·운영 활성화를 이 결정만으로 주장하지 않는다. 실제 외부 호출 품질과 음성 비용은 구현 검증 기록에서 구분한다.
