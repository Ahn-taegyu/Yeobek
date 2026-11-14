---
type: Research
id: RES-011
title: Bivia 병렬화·보류 보완과 Liner 최종 답변 비교
description: 이전 점수의 재사용, 최대4개 병렬 판단과 보류 근거 보존을 검증하고 같은 Liner 생성 모델로 최종 답변을 비교한다.
status: draft
updated: '2026-11-14'
tags: [yeobek, bivia, liner, retrieval, evaluation]
rag_include: true
decision_status: proposed
work_status: in_progress
generated:
  by: codex/gpt-6
  at: '2026-11-14T22:35:00+09:00'
sources:
- id: request
  resource: /references/user-bivia-answer-recomparison.md
  title: 재비교 요청과 Liner 크레딧 사용 승인
- id: previous
  resource: /research/bivia-retrieval-experiment.md
  title: 첫 검색 실험 RES-010
- id: plan
  resource: /product/articul8-comparison-plan.md
  title: 세 방식 비교 계획 P-006
- id: score
  resource: https://docs.articul8.ai/bivia/api/resources/decisions/methods/score
  title: Bivia Score 계약
- id: account
  resource: https://app.articul8.ai/plan
  title: Articul8 계정별 무료 잔량·일일 요청 한도
- id: liner
  resource: https://liner.com/ko/developers/docs/llm-gateway
  title: Liner Gateway 모델·토큰 가격
---

# 실험 범위

[후속 요청](../references/user-bivia-answer-recomparison.md)에 따라 **검색뿐 아니라 관람객에게 반환할 최종 답변**을 비교한다. A는 기존 `selectEvidence`, C1은 첫 실험의 Bivia 보류 후순위 정책, C2는 이번 보류 보존 정책이다. A/C2는 동일한 Liner `openai/gpt-6-luna`로 생성하며 별도 계열의 `google/gemini-3.8-flash`가 익명 X/Y 답변을 평가한다. 두 모델 모두 Liner Gateway 경로다. 후속 사용자 승인에 따라 Liner 크레딧을 사용하며, 전체를 무료 실험이라고 표현하지 않는다.

운영 앱과 DB를 변경하지 않는다. 실제 서비스 `createDocentHarness`의 프롬프트·출력 형식·인용/길이 검증·보류 고정 문구를 재사용하되, 합성 publication store의 `isCurrent=true`를 사용한다. 방문 세션 저장·실제 DB 권한/철회·HTTP·최근 대화·음성은 검증 범위가 아니다. 하네스가 선택된 최대12개 근거를 다시 정렬할 수 있으나 제외된 근거를 추가하지 않는다.

# 6,000회와 사용 예산

- 계정 Plan & Usage는 Bivia Requests `6.0K`, `RESETS IN 1 DAY`를 표시했다. **6,000회는 이 계정의 일일 요청 한도**이며 무료 토큰 잔량과 다른 지표다. 정확한 초기화 시각·시간대는 UI에서 확인되지 않았다.
- 첫 실험1,488회는 24.8%다. 개발48회와 평가60문항×24근거=1,440회로 구성됐다. 첫 실험 종료 때 요청 `1.5K/6.0K`, 재확인 때 `0/6.0K`로 표시됐으나 초기화 시점을 추정해 더 쓰지 않았다.
- 실험 직전 무료 토큰 `999M/1.0B`, 90일 만료, 플랫폼 잔액0, 자동 충전은 결제 수단 설정 전 상태를 확인했다. 표시값은 반올림된다. 과거 사용분을 그대로 차감한 잔여4,512회·92,286,528토큰을 로컬 상한으로 유지했다.
- 이전1,440개 점수를 재사용해 60문항의 보류 정책과 답변 품질을 비교한다. 새 Bivia 호출은 개발6문항×24근거×순차/병렬2조건=**288회**뿐이다. 전체 요청·추정 토큰을 실행 전에 예약하고 실패·중단 시 자동 환급하지 않는다.
- Liner는 사용자 승인 크레딧으로 생성 최대120회·평가 최대60회, 공시 토큰 단가 기반 예약 상한 $3를 둔다. 단가 환산은 청구서나 실제 현금 결제액이 아니다. 결제 설정·충전은 변경하지 않는다.

# 변경한 동작과 재현 조건

1. Bivia 요청은 동시에 최대4개다. 요청 직전 동기적으로 한도를 차감한다. 오류가 관측되면 새 요청을 중단하고 이미 전송된 요청의 완료를 기다려 사용량을 집계한다. 자동 재시도·유료 대체·A로의 숨은 장애 전환은 없다.
2. C2는 **A가 선택했던 근거 중 Bivia가 보류한 근거를 먼저 보존**하고 남은 예산을 Bivia 점수 순서로 채운다. 보류를 무관함으로 단정하지 않으며 점수나 확률을 임의로 보정하지 않는다. 점수와 선택된 출처 버전·본문은 보존한다. 모든 후보 보류 시 A 선택을 재현한다. 최대12개·8,000 코드 포인트·원문 단위 예산은 그대로다.
3. 캐시는 첫 공개 집계의 원본 SHA-256, 전체 corpus hash, scoring prompt hash, 완료 상태, 문항/근거의 중복·누락을 모두 검사한 뒤 사용한다. corpus·질문·버전·본문 변경은 캐시 재사용을 차단한다. 이번 비교에서 scoring prompt와 corpus는 변경하지 않았다.
4. 속도는 개발 데이터의 유형별 첫1문항, 총6문항에서 동시성1/4를 교대 순서로 실행한다. 두 조건 모두 C2 정책이다. 서버 부하·점수 변동이 있는 작은 표본이며 C2의 60문항 전체 지연으로 확대해 해석하지 않는다.
5. 답변은 기존 평가60문항에서 각 안1회, 총120개다. A/C2 생성 순서와 X/Y 평가 노출 순서를 별도로 교대한다. 생성에는 정답을 주지 않으며 평가에는 기대 사실·실제 인용 본문을 준다. 평가 기준은 사실 근거, 완전성, 적절한 답변/보류, 인용의 의미 일치, 한국어 명료성이다. 실제 JSON·인용 ID·outcome 검증 실패는 별도 실패로 센다.
6. 이 60문항은 첫 검색 실험에서 이미 본 **합성 회귀 세트**다. 새 독립 잠금 세트나 사람 수용 평가가 아니다. 보류 정책을 재평가 결과에 맞춰 반복 조정하지 않았다. C1의 최종 답변은 생성하지 않아 C1→C2의 답변 개선을 주장할 수 없다.

# 실행 명령과 키

필요한 키는 `BIVIA_API_KEY`, `LINER_API_KEY`다. Gemini/Groq 직접 키는 이번 Liner 실행에 필요하지 않다. 현재 worktree의 `.env.local`에만 서버 키를 두며 다른 작업 공간의 DB·배포 설정을 복제하지 않는다. 로컬 앱의 `AI_PROVIDER_MODE=mock`을 유지하고 이 실험 CLI만 명시적으로 호출한다.

```sh
# 최초 실험의 비공개 report.json을 지정. 공개 집계에 고정된 해시와 일치해야 함.
# BIVIA_SCORE_CACHE 환경변수 또는 .ai-eval/bivia-score-cache.json 사용
npm run ai:recompare:bivia -- --mode=replay

# 최근 계정 UI 확인 후 기존 .ai-eval/bivia-free-allowance.json 사용
npm run ai:recompare:bivia -- --mode=benchmark-free

# 사용자에게 Liner 크레딧 사용 권한을 받은 터미널에서만
# BIVIA_LINER_CREDIT_AUTHORIZED=1 설정 후 실행
npm run ai:recompare:bivia -- --mode=answers-credit
```

`replay`는 외부 fetch를 차단한다. 두 live 모드는 자격 증명을 읽는다. `answers-credit`는 `.ai-eval/bivia-answer-reservation.json`을 배타적으로 생성하여 같은 작업의 실수 재실행을 막는다. 파일을 자동 삭제하지 않는다. 중단된 작업은 보고서·이미 사용한 호출 수를 확인하고 다음 실행 범위와 예산을 다시 정한 뒤 처리한다. 원본 응답·키·계정 식별자는 공개 Git에 올리지 않는다. 정규 CI는 오프라인 단위 검사만 실행하며 이 live 실험을 발견하지 않는다.

# 결과와 검증 기록

실행 중이다. 측정 종료 후 집계·실패 사례·채택 판단을 이 절에 기록한다. 이전 실험 원문과 결과는 [RES-010](bivia-retrieval-experiment.md)에 보존한다.
