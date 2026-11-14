---
type: Research
id: RES-010
title: 현재 검색과 Bivia 재정렬 무료 비교 실험
description: 합성 전시 근거로 키워드 선택과 Bivia score 재정렬을 비교하는 실행 도구, 무료 사용 경계와 실측 기록.
status: draft
updated: '2026-11-14'
tags: [yeobek, bivia, retrieval, evaluation]
rag_include: true
decision_status: proposed
work_status: done
generated:
  by: codex/gpt-6
  at: '2026-11-14T21:40:00+09:00'
sources:
- id: request
  resource: /references/user-bivia-comparison-experiment.md
  title: 현재 구조와 Bivia 무료 실험 요청
- id: plan
  resource: /product/articul8-comparison-plan.md
  title: 세 방식 비교 계획 P-006
- id: quickstart
  resource: https://docs.articul8.ai/bivia/quickstart/
  title: 공식 Bivia 인증·입력·보류 안내
- id: score
  resource: https://docs.articul8.ai/bivia/api/resources/decisions/methods/score
  title: 공식 Bivia Score 계약
- id: product
  resource: https://articul8.ai/bivia
  title: Bivia 가격과 무료 제공 개요
---

# 범위와 판단 기준

[사용자 요청](../references/user-bivia-comparison-experiment.md)에 따라 P-006의 **A/C 검색 단계부터** 실행한다. 운영 앱의 검색·답변 생성 경로는 수정하지 않고 독립 CLI에서 실제 `src/lib/ai/context.ts`의 `selectEvidence`를 가져온다. 기획 docs의 BM25 검색과 Numa는 이 실험에 포함하지 않는다.

| 항목 | A 현재 검색 | C Bivia 재정렬 |
| --- | --- | --- |
| 입력 | 같은 합성 승인 snapshot, 질문 | A와 동일 |
| snapshot 구조·범위·내용 해시 검사 | 기존 `validateContext` | 점수 요청 전에 동일 검사 |
| 선택 | 질문 단어 포함 수 → 작품 범위 → 원래 순서 | 허용된 모든 후보에 `/score` → 점수 → 작품 범위 → 원래 순서 |
| 최종 예산 | 근거 최대12개·8,000 Unicode 코드 포인트, 원문 단위 | 동일 |
| 외부 호출 | 0 | 후보마다1회, 순차 실행, 자동 재시도0 |
| 답변 LLM | 이번 단계에서는 호출하지 않음 | 동일 |

근거 회수 개선을 먼저 확인한다. 이 결과로 답변 정확도·말투·작가 의도 준수·실제 관람 보류 성공률을 확정하지 않는다. 후보 점수는 권한 판단이나 사실 확인 결과가 아니다. 제품 적용 시 DB의 게시·승인·철회 필터와 생성 후 현재성·인용 검증을 유지해야 한다. 여기서는 합성 snapshot 검증만 하며 실제 DB 철회 경쟁 조건은 시험하지 않는다.

# 데이터와 고정 조건

- `tests/evaluation/retrieval-cases.ts`: 가상 작가2명·전시3개·작품12개. 각 작품24개 근거 중 최대12개를 고른다. 모든 평가 질문이 개수 제한의 영향을 받을 수 있다.
- 개발30문항/4작품, 평가60문항/8작품. 작품·근거 ID가 분리되어 있다. 공통 질문 템플릿과 운영 안내는 공유하므로 독립적인 현실 문항90개로 해석하지 않는다.
- 평가 분포: 직접 사실18, 한국어 바꿔 묻기10, 복수 근거8, 답 없음10, 현재 버전8, 표의 연도 구별6.
- 정답 근거 그룹과 기대 사실은 합성 자료를 작성하면서 지정했다. **독립적인 사람의 정답 검수는 아직 없다.** 자료 안에 있는 정정·제작/보수 연도를 구별하며, 실제 PDF/OCR 품질은 측정하지 않는다.
- 답이 있는50문항에서 `allGroupsRate`는 필요한 모든 근거 그룹을 찾은 비율, `groupRecall`은 질문별 그룹 회수율 평균이다. 대체 근거가 있으면 그룹의 ID 중 하나면 된다. `precision`은 선택 자료 중 정답 그룹에 속한 비율이다.
- 답 없는10문항은 회수율 분모에서 제외하고 따로 센다. 자료를 선택했다는 이유만으로 환각이나 보류 실패로 판정하지 않는다.
- `/score`는 `fast`, `think=false`, `range=[0,1]`, `buckets=11`, `allow_abstain=true`. 보류한 자료는 점수 자료 뒤에 두며 최종 예산에 공간이 있으면 남을 수 있다. 관람객에게 보류 답변을 출력하는 정책은 별도다.
- 문항/반복마다 A/C 순서를 교대로 배치한다. 캐시·자동 재시도·실패 시 A로의 숨은 대체는 없다. HTTP/네트워크/형식/사용량 오류가 나면 C 실패를 기록하고 남은 문항을 중단한다.
- 실제 평가 후 prompt·fixture를 바꾸면 새 버전의 실험이다. 같은 평가 집합에 맞춘 개선을 독립 검증으로 표시하지 않는다. 기본1회이며 P-006의3회 반복·신뢰구간·사람 답변 평가는 후속이다.

# API 키와 무료 실행 설정

검색 실험에 필요한 키는 **`BIVIA_API_KEY` 하나**다. Supabase·Gemini·Groq·Liner 키는 필요하지 않다. 별도 worktree는 별도 `.env.local`을 사용한다. 실제 키를 저장소·docs·PR·채팅이나 `NEXT_PUBLIC_*`에 넣지 않는다.

1. [Bivia 시작 안내](https://docs.articul8.ai/bivia/quickstart/)에서 Articul8 계정의 API 키를 발급한다. 기존에 발급했다면 그 키를 사용한다. 메뉴와 권한은 계정별로 확인한다.
2. 실행할 저장소 루트의 `.env.local`에 `BIVIA_API_KEY=발급한_값`을 추가한다. 기존 Supabase 등 설정은 보존한다. 셸 값이 파일보다 우선한다.
3. [Plan & Usage](https://app.articul8.ai/plan)에서 Bivia 무료 토큰의 잔량·만료, 당일 요청 잔량, 결제 수단·자동 충전 상태를 확인한다. 플랫폼 크레딧과 Bivia 무료 토큰은 별도다. **유료 결제 가능성을 차단했는지 확인할 수 없으면 실호출하지 않는다.**
4. Git 제외 `.ai-eval/bivia-free-allowance.json`에 그 확인 결과를 작성한다. 아래0은 의도적인 실행 차단 값이며 실제 확인한 잔량과 ISO UTC 시각으로 바꾼다. 만료 시각이 날짜 수준으로만 보이면 실제 만료보다 이른 보수적인 시각을 적는다.

```json
{
  "verifiedAt": "2026-11-14T00:00:00Z",
  "expiresAt": "2026-11-15T00:00:00Z",
  "paidBillingDisabled": true,
  "freeTokensRemaining": 0,
  "freeRequestsRemaining": 0
}
```

`paidBillingDisabled=true`는 로컬 도구가 결제를 끄는 설정이 아니다. **제공사 계정에서 확인한 사실을 기록**하는 값이다. 도구는 계정 결제·할당량을 자동 조회하지 않는다. 1시간이 지나거나 UTC 날짜가 바뀐 확인은 거부한다. 계정의 초기 표시를 그대로 복사해 잔량을 복원하지 않는다. 다른 도구가 같은 할당량을 쓰면 다시 확인한다.

```sh
npm ci
# 외부 호출 없이 기존 검색 실행
npm run ai:compare:bivia
# 필요한 Bivia 호출 수·보수적 토큰 예약량만 계산, 네트워크0
npm run ai:compare:bivia -- --mode=preflight --split=eval
# 무료 한도 확인 파일과 키를 준비한 후: 개발용 한 문항, 최대24회
npm run ai:compare:bivia -- --mode=live-free --split=smoke --max-calls=24
# 평가60문항×후보24개, 최대1,440회 (생성 호출0)
npm run ai:compare:bivia -- --mode=live-free --split=eval --max-calls=1440
```

기본 실행은 `.env.local`을 읽지 않고 네트워크를 차단한다. 일반 `npm test`/CI는 모의 HTTP 단위 검사만 발견하며 실호출 파일은 별도 Vitest 설정에 둔다. 기존 `ai:compare`는 작가 해설 비교이고 유료 제공사 경로가 가능하므로 이 무료 실험 명령과 혼동하지 않는다.

실호출은 실행 전체의 요청/토큰을 먼저 예약하고 확인 파일의 잔량에서 차감한다. 같은 확인 파일의 동시 실행은 잠금으로 막는다. 실패·중단분도 자동 환급하지 않는다. 프로세스가 강제 종료되어 `.lock`이 남으면 해당 프로세스 종료를 확인하고 계정 잔량을 다시 읽은 뒤 정리한다. 토큰 예약은 요청 UTF-8 바이트 수에 여유를 둔 **로컬 추정**이며 공식 토크나이저가 아니다. 유료 결제 차단을 대신하지 않는다.

API 오류·15초 타임아웃·리디렉션·잘못된 JSON/점수·`billable_tokens` 누락 또는 예약 초과는 중단한다. 실패 응답 본문·키는 출력하지 않으며 다른 모델로 자동 대체하지 않는다. 성공 응답의 사용량도 과금 여부와 같지 않으므로 실행 후 무료 잔량과 결제를 확인한다.

# 연동 계약

공식 API 문서의 인증은 `Authorization: Bearer <key>`다. 공식 quickstart는 환경변수 이름 `A8_API_KEY`, 제품 소개는 `BIVIA_API_KEY`를 사용한다. 이번 도구는 `BIVIA_API_KEY`를 읽어 Bearer로 전송하며, 제품 소개의 `apikey` 헤더와 혼용·자동 인증 재시도를 하지 않는다.

```text
POST https://api.articul8.ai/bivia/score
Authorization: Bearer <BIVIA_API_KEY>
Content-Type: application/json
```

`state`에는 근거 라벨과 본문만, `question`에는 관련성 평가 지시와 관람 질문을 넣는다. 정답 근거 ID/기대 사실/소유자 ID/키는 입력에 넣지 않는다. 응답은 `type=score`, `status=answered|abstained`, 0~1의 숫자 `value` 또는 보류의 `null`을 검증한다. 점수 API는 단일 `probability`가 아닌 `levels` 분포를 제공할 수 있다. `model`, `input_tokens`, `billable_tokens`, `latency_ms`를 허용된 필드로 기록한다. 원문 전체 응답은 저장하지 않는다.

# 실행 기록

**2026-11-14, 검색 단계1회 비교 완료. 현재 방식에 Bivia를 바로 적용하지 않고 지연·보류 정책을 먼저 개선하는 것을 권고한다.** 필요한 근거의 회수는 개선됐지만 P-006의 제안 기준인 +10%p에는 못 미쳤으며, 최종 답변 품질과 비용/지연 기준은 아직 측정하지 않았다. 채택 결정은 미확정이다.

| 지표 | A 현재 검색 | C Bivia | 해석 |
| --- | --- | --- | --- |
| 완료 문항 | 60/60 | 60/60 | 양쪽 오류0 |
| 필요한 근거를 모두 선택 | 45/50, **90%** | 49/50, **98%** | **+8%p**; 답 없는10문항 제외 |
| 질문별 근거 그룹 회수율 평균 | 93% | 98% | 복수 근거의 일부 누락도 계산 |
| 선택 자료 정밀도 | 8.83% | 9.50% | 정답 근거1~2개/최대12개; 답변 정확도가 아님 |
| 검색 지연 p50 | 0.34ms | 8.33초 | 로컬 선택 vs 후보24개 순차 HTTP |
| 검색 지연 p95 | 0.67ms | 9.88초 | 실제 서비스 답변 지연이 아님 |
| 평가 외부 호출 | 0 | 1,440 | `model=dec-1`, 생성 LLM0회 |
| 평가 `billable_tokens` 합계 | 0 | 1,440,000 | 무료 토큰에서 차감; 현금 청구액이 아님 |

| 근거 유형 | A 필요한 근거 전부 회수 | C 필요한 근거 전부 회수 |
| --- | --- | --- |
| 직접 사실 | 18/18 | 18/18 |
| 한국어 바꿔 묻기 | 9/10 | 10/10 |
| 복수 근거 | 5/8 | 8/8 |
| 현재 버전 표기 구별 | 8/8 | 7/8 |
| 제작·보수 연도 구별 | 5/6 | 6/6 |

기존 누락5건이 개선되고 기존 성공1건이 후퇴했다. `eval-5-version`에서 C가 현재 재료를 명시한 정정 자료의 점수를 `abstained/null`로 반환해 최종12개에서 제외했다. 전체 점수 호출 중 보류는286/1,440회다. 보류한 근거를 최하위로 보내는 현재 정책의 손실이므로, 후속에서는 A 후보 보존/합집합 같은 대안을 **개발 세트에서** 시험한 뒤 새 평가 세트로 검증한다. 이 결과에 맞춰 이번 평가를 다시 조정하지 않았다.

개발용 smoke는30문항 중1개를 두 형식으로 각1회 실행했다. 초기 한국어 평가 지시와 JSON state 형식에서 근거를 놓쳤고, 공식 API 역할에 맞춰 state를 자료 본문, question을 평가 지시와 관람 질문으로 바꾼 형식에서 찾았다. 언어와 배치가 함께 바뀌었으므로 어느 요인이 개선 원인인지 분리할 수 없다. **이48회는 평가 지표에 포함하지 않는다.** 평가60문항 시작 후 prompt·corpus는 바꾸지 않았다.

전체 사용량은 smoke48회 + 평가1,440회 = **1,488회 / 1,488,000 billable tokens**, 유료 호출0회·생성 LLM0회다. 사전 UI의 무료1.0B·요청0/6.0K·결제 수단 설정 필요 상태를 확인했다. 사후 UI는 무료 약999M/1.0B, 요청 약1.5K/6.0K, Bivia 입력 약1.5M, 플랫폼 크레딧 사용0·잔액0, 자동 충전 설정 전 상태였다. UI는 반올림하므로 정확한 호출/토큰 수는 응답 원장을 따른다. 카드 등록·충전·결제를 수행하지 않았다. 표시 정가로만 환산하면 평가분은 약$0.0605이며 실제 청구액이 아니다. A의 검색 비용0을 분모로 비용 비율을 만들지 않고, 후속 동일 LLM의 전체 질문 비용과 비교한다.

공개 집계: 저장소의 `tests/evaluation/results/bivia-retrieval-2026-11-14.json`. 실행 base는 `e647c479f69617a545b3d00f569bae6424096441`에 당시 실험 코드의 미커밋 변경을 더한 상태이며, JSON의 파일별 SHA-256(실행 환경의 원시 파일 바이트)으로 실행 소스를 식별한다. 운영 selector는 base부터 변경하지 않았다.

- corpus SHA-256: `ecc1526922dad9d0f731ba1cea96fecc8ef518762dea88078012ef89030a25a9`
- prompt SHA-256: `ca010fc7fa4a632874350cfc6775c51d98bcfce9ef5591c38b3427b77feb14fc`
- 평가 report: `.ai-eval/bivia-2026-11-14T12-39-28-039Z-b1283dbe/report.json`(Git 제외)
- 로컬 검증: 연동·예산·잠금·오류·범위·선택·지표 검사26개 통과, 변경 파일 ESLint 통과, 문서 `check` 오류0. 전체 앱/문서 검증은 최신 PR CI 결과를 따른다.

실행별 `.ai-eval/bivia-시각-ID/report.json`에 코드 SHA와 dirty 상태, selector/실험 코드 해시, corpus/prompt 해시, 문항/반복/방식, 허용·선택 ID, 점수·모델·사용량, 실패와 지연을 저장한다. 답변 생성은0회다. 이 폴더는 Git·기획 RAG에서 제외한다. 공개 문서에는 합성 자료의 집계와 재현에 필요한 해시만 옮긴다.

# 남은 비교

현재 단계는 근거 선택만 평가했다. 동일 LLM·프롬프트를 고정한 실제 답변 비교, 사람 검수, 철회/범위/버전 경쟁 조건의 DB 통합, 실제 동의받은 작가 자료,3회 반복·질문 단위 신뢰구간, batch·병렬화 비용/지연은 후속이다. `dec-1`은 응답의 모델 이름이며 서버 배포 버전을 고정한 증거는 아니다. Bivia의 점수를 한국어 관련성의 보정된 확률로 해석하지 않는다. 채택은 P-006의 품질·지연·권한 기준을 함께 충족한 뒤 판단한다.
