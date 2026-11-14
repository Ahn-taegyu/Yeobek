---
type: Specification
id: SPEC-005
title: 파트너 API와 음성 통합 기준
description: 성능 유지 조건의 파트너 우선 경로와 실측·운영 자동화 경계.
status: draft
updated: '2026-11-14'
tags:
- mawd
rag_include: true
generated:
  by: codex/gpt-6
  at: '2026-11-12T14:38:57+09:00'
sources:
- id: bivia-experiment
  resource: /references/user-bivia-comparison-experiment.md
  title: 현재 구조와 Bivia의 무료 비교 실행 요청
- id: articul8-comparison
  resource: /references/user-articul8-comparison.md
  title: 현재 구조·Numa·Bivia 비교 계획 요청
- id: partner-priority
  resource: /decisions/D-015-partner-priority.md
  title: 성능을 유지하는 파트너 API 우선
- id: current-stack
  resource: /research/recommended-stack.md
  title: Render 제외 후 최신 스택·모델 권고
- id: answers
  resource: /references/user-answers.md
  title: 2026-11-12 사용자 범위·팀·일정 확인
- id: liner
  resource: https://liner.com/developers/docs/liner-model-api-chat-completions
  title: Liner Chat Completions
- id: chat
  resource: /references/user-chat-interaction.md
  title: 사용자 통합 채팅·입출력 모드 요구
- id: direction
  resource: /references/user-build-direction.md
  title: 사용자 개발 조건
- id: official
  resource: /references/stack-references.md
  title: 공식 기술 근거
decision_status: proposed
---

> **2026-11-14 후속 기준:** [D-015](../decisions/D-015-partner-priority.md)에 따라 해설·자료 정리·Q&A·평가·전사·합성은 Liner 경로를 우선 검토한다. 평가는 초안과 다른 모델 계열을 사용한다. EXAONE·OpenAI 직접 호출·Typecast는 비교 후보다. 구체 모델·권한·품질은 실측 전 미확정이며 아래 11/13 권고는 과거 기록이다. 운영 자동화의 스티비·채널톡·Alt는 이번 범위다.

# 기능별 경로와 검증

[D-015](../decisions/D-015-partner-priority.md)의 성능 유지 조건을 적용한다. 아래 경로는 우선 검토 대상이며 모델·권한과 실제 품질은 미확정이다.

| 기능 | 우선 경로 | 비교 후보와 확인 |
| --- | --- | --- |
| 해설 초안·자료 정리 | Liner | 행사 키·모델 접근과 생성 품질 확인 |
| 평가 | Liner, 초안과 다른 모델 계열 | EXAONE·OpenAI 직접 호출; 사람 라벨 비교 |
| 관람 Q&A | Liner | EXAONE·OpenAI 직접 호출; 근거 충실도·구조 준수·지연 비교 |
| 전사 | Liner | OpenAI; 한국어 번호·작품명·부정 표현 비교 |
| 합성 | Liner | Typecast·OpenAI; 한국어 청취 품질과 지연 비교 |

모델 ID·요금·행사 키 권한과 요청 형식은 공식 문서와 실호출로 확인한다. 자동으로 요청마다 제공사를 바꾸지 않는다. 실호출 전에는 실제 접근이나 품질을 검증했다고 표시하지 않는다. 이전 권고는 [D-010](../decisions/D-010-practical-stack.md)과 [추천 이력](../research/recommended-stack.md)을 따른다.

# 데이터와 음성 경계

서버는 소유권·공개 상태와 승인 근거를 검사하고 결과 구조와 인용을 검증한다. 비공개 원자료 전체를 공개 검색에 맡기지 않는다. `transcribe`와 `synthesizeSpeech`는 독립 계약이며 녹음 후 인식문 확인과 네 입출력 조합을 유지한다. 키는 서버에서만 사용한다.

# 운영 자동화와 다른 도구

스티비·채널톡·Alt는 W8의 안내 발송·문의 응대·전사 가져오기 범위다. 정책과 수신 동의, 승인 및 외부 전송 최소화를 지킨다. EXAONE은 비교 후보이며 Bivia와 VAPI는 채택하지 않았다. 파트너 접근과 외부 발송의 실제 동작은 키와 공식 계약 확인 후 검증한다.

# Numa·Bivia 비교 제안

11/14 [후속 실험 요청](../references/user-bivia-comparison-experiment.md)에 따라 A/C 검색 비교를 먼저 실행한다. [실험 도구와 기록](../research/bivia-retrieval-experiment.md)은 Bivia `/score`의 무료 API 시험을 다루며 운영 제공사 채택과 분리한다.

[P-006](../product/articul8-comparison-plan.md)은 현재 구조, Numa 문서 처리·그래프 회수, Bivia의 승인 근거 재정렬을 같은 답변 LLM으로 비교한다. Numa 전처리(B0)와 실시간 검색(B1)은 별도 결과로 기록한다. 고객용 ingest·그래프 API와 내부 팀용 검색·블록 API의 지원 범위를 구별하고, 인증된 서버 호출·필터·무료 한도를 확인하기 전에는 연동 완료로 표시하지 않는다.

승인·게시·철회와 근거 권한은 여백이 유지한다. 이 계획은 Bivia나 Numa의 도입 결정, 유료 호출 또는 운영 전환을 승인한 것이 아니다.
