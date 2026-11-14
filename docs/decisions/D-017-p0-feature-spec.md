---
type: Decision
id: D-017
title: Notion P0 기능 범위와 승인본 사용
description: 최신 전시 제작·검수·공개와 관람 흐름을 기존 문서 ID에 연결한다.
status: draft
updated: '2026-11-14'
tags: [yeobek, mvp]
rag_include: true
decision_status: accepted
decision_basis: user-confirmed
generated:
  by: codex/gpt-6
  at: '2026-11-14T11:29:53+09:00'
sources:
- id: requirements
  resource: /references/user-p0-feature-spec.md
  title: 최신 P0 기능명세와 사용자 보완
---

# 적용 결정

[최신 P0 명세와 후속 보완](../references/user-p0-feature-spec.md)을 적용한다. F13 가입 후 직접 로그인은 [D-016](D-016-artist-auth.md)을 따른다. Notion F06·F09를 독립 범위에서 제외하고 F10을 F08에 통합한다. 저장소 F-xxx와 SC/BR/OP/UC/AC/EX는 연결표를 통해 유지한다.

전시별 작품 세계는 선택 입력 전체가 비어도 작품 등록을 막지 않는다. 관람은 전시 QR 한 개로 전시 소개를 거쳐 단일 채팅에 들어간다. 질문 입력은 글·음성, 답변은 글과 음소거 가능한 TTS를 제공한다. 작품 선택만으로 답변이나 해설을 생성하지 않는다. 최신 관람 화면 요구는 D-006의 기존 출력 UI와 D-008의 기존 text/text 기본값에 대한 후속 변경이다.

해설·예상 Q&A·미리보기에서 정정한 답변은 수정과 승인, 게시를 거쳐 공개 버전에 연결한다. 이전 활성 공개본은 일반 초안 수정과 별개이며 교체 게시 또는 철회까지 유효하다. 검수 완료의 정량 기준, 공개 필수 승인 범위, 번호 변경의 공개 적용, STT 인식 후 자동 전송 여부는 후속 검토한다.

[기능명세의 P0 연결표와 상세](../specs/functional-spec.md#notion-p0-기능-연결)를 따른다.
