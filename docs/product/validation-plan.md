---
type: Plan
id: P-005
title: 검증 계획과 지표 정의
description: 기능 수용 기준과 사업 가설을 분리한다.
status: draft
updated: '2026-11-14'
tags:
- mawd
rag_include: true
generated:
  by: codex/gpt-6
  at: '2026-11-12T14:12:26+09:00'
sources:
- id: articul8-comparison
  resource: /references/user-articul8-comparison.md
  title: 현재 구조·Numa·Bivia 비교 계획 요청
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
  title: 사용자 추가 응답
- id: chat
  resource: /references/user-chat-interaction.md
  title: 사용자 통합 채팅·입출력 모드 요구
- id: artist-auth
  resource: /decisions/D-016-artist-auth.md
  title: 작가 직접 회원가입과 로그인 선택 진입
decision_status: proposed
---

# 기술 완료와 사업 검증

동작 수용 기준은 [기능명세](../specs/functional-spec.md)를 따른다. 사용·지불 의향은 별도 실험이다. 원문 없는 과거 피드백을 구매 증거로 쓰지 않는다.

구체적인 수행 입력·대체 흐름·합격 조건은 [사용자 시나리오 UC-01~23 / 수용 기준 AC-01~23](../specs/user-scenarios.md)에 있다. 네 입출력 조합은 해설과 Q&A를 각각 검사하며, 공개 철회·버전 교체·응답 지연·타인 접근도 포함한다. 추가로 작가 공통 정보의 두 전시 재사용·철회, 온보딩의 QR 대상 보존, 작품 정보 탐색/선택 구분을 확인한다. 명세 작성 시점의 AC는 모두 미실행이며 문서 검증과 제품 검증을 구별한다.

# MVP 관찰

검색·문서 준비 방식의 후속 비교는 [P-006 현재 구조·Numa·Bivia 비교 계획](articul8-comparison-plan.md)을 따른다. 동일 생성 LLM과 승인 근거로 검색 효과를 먼저 보고, 동일 원자료로 준비·검수 시간을 따로 측정한다. Bivia의 근거 재정렬과 Numa의 전처리/선택적 검색은 실험 후보이며 현재 MVP의 채택 결정이나 측정 결과가 아니다.

| 지표 | 측정 | 주의 |
| --- | --- | --- |
| 작가 준비 시간 | 입력~승인/게시 작업·대기 시간 분리 | 작품 수·사전 자료 상태 기록 |
| 공급자 개입 | 전시별 편집·설치·오류 대응 시간 | 개입 원인 기록 |
| 승인 품질 | 의미 수정 없이 승인한 수/검토 초안 수 | 오탈자와 의미 수정 구분 |
| 관람 시작률 | 관찰한 웹 진입자/관찰한 관람객 | 표본 실험이며 전체 통계 아님 |
| 채팅·음성·질문 | 네 입출력 조합, 작품 번호 발화·전환, 부위 되묻기 과제 관찰 | 음성 입력과 출력을 독립 평가, 전체 세션 통계는 로그 필요 |
| 근거 준수 | 가능한/불가능한/다른 전시 질문 평가 | 인용이 승인 근거인지 확인 |
| 비용 | LLM·STT·TTS 호출 사용량·요금 기록 | 음성 길이·실패·재생성도 포함 |
| 지불 의향 | 실제 작품 데모 후 구체 가격 반응 | 호감·의향·예약·결제 구분 |

관찰은 데이터 수집 제품 기능의 조기 도입이 아니다. 작업 상태·오류 코드·사용량은 운영용이며 관람객 분석·질문 원문 장기 보관과 분리한다. [D-005](../decisions/D-005-measurement.md)에서 합의한다.

한 채팅을 유지하기 위한 임시 메시지·인식문과 원음/질문 장기 저장은 구분한다. 언어로 부위를 지정했다고 시각 인식이 완료된 것으로 평가하지 않는다. 작가의 부위 설명이 없는 경우 답변 보류도 정상 시나리오다.

# P2 데이터의 정의

- 웹 활성 시간은 웹 체류이며 실제 작품 앞 체류가 아니다.
- 후기·댓글 분석은 각각 수집 UI가 먼저 필요하다.
- 댓글 수는 호감도·구매 의향이 아니다.
- 질문 빈도는 보관 범위·동의·삭제 기준 확정 후 집계한다.
- 감정 영향은 선택적 직접 응답 후보이다. 체류·음성·표정으로 자동 추론하는 설계는 채택하지 않는다.

# 사업 검증 순서

현재 설명 방식·자료 상태 → 실제 입력/검수 관찰 → QR/음성 이용 확인 → 다음 전시 도입 조건·가격 반응 → 반복 요구를 P2로 선정.

Notion의 작가 10명·파일럿 3~5명·30분·QR 30%는 가정이며 확정 목표가 아니다. 인원·전시 조건을 확인한 뒤 표본과 목표를 정한다.

작가 인증은 [UC-20~23 / AC-20~23](../specs/user-scenarios.md#작가-가입로그인-수용-시나리오)에서 기존·신규 계정, 인증 선택, 가입 후 직접 로그인, 소유권·로그아웃과 중복/응답 유실을 검증한다. 아직 수행하지 않았다.

P0 개정 검증은 F01 부분 저장/선택 항목 모두 비움, F02 전체 항목·재정렬, F04 초안, F05 승인·정정의 공개 반영, F07 QR과 비공개, F08 동일 채팅/음성 제어를 확인한다. 기존 네 가지 모드 검증은 작성 당시 기준이다. [D-017](../decisions/D-017-p0-feature-spec.md).
