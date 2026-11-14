# 백엔드 에이전트 B — 공개·관람·인계

**B의 서버/API·모의 통합·문서 인계는 완료했다.** 아래 병합/검사 근거를 기준으로 프런트와 실환경 검증을 이어가며 완료된 구현을 다시 만들지 않는다.

## 최신 상태와 결정 (2026-11-14 확인)

- GitHub에서 W13 #16(`44bf7d3`)·W10 #15(`dadc23b`)·W9 #17(`de06460`)의 병합을 확인했다. 인계 기준은 이 계약이며 W9는 기본 off, 운영 SMTP·프런트는 미검증이다.
- A의 W11 #18·W2 #13·파일 읽기 #28(main `4f7faee`)은 병합됐다. 파일 읽기는 기본 off이며 프런트 후보 검수·실키 검증은 별도다. 승인 Q&A 서비스 RPC를 같은 게시 트랜잭션에서 호출하는 B 연결은 #25에 구현돼 CI가 성공했으며 최종 #25 병합도 완료했다.
- 인계 초안 #20과 시연 데이터 기반 #23은 병합됐다. W12·Q&A 시연 확장·키 당일 점검표 #25도 병합됐으며 서버 모의 통합은 완료했다. 아래 SHA별 상태 표를 따른다.
- [SRC-050](../docs/references/user-expected-qa-policy.md)의 생성 세트 상한은 작품 3개·전시 5개다. 개별 승인·철회하며 승인 Q&A는 생성 근거로 사용한다. 기본 작품 소개의 승인 원고 직접 반환은 유지한다.
- [SRC-052](../docs/references/user-gap-qa-exclusion.md)에 따라 관람 보완 요청의 Q&A 전환은 제외한다. 요청 조회와 재게시 후 확인/종료는 유지하며 재게시만으로 자동 종료하지 않는다.
- 이미지 없이 게시 허용, 모의 해설 운영 게시 차단, QR 제작 제외를 유지한다. 저장 음성과 Q&A 개수는 SRC-055에 따라 게시 필수에서 제외한다.

### PR 기준 상태 확인 (2026-11-14, 아래 SHA 기준)

| 범위 | 확인한 상태·증거 | 남은 일 |
| --- | --- | --- |
| W11 | [#18](https://github.com/Ahn-taegyu/Yeobek/pull/18) 병합 `40564e6`, 검사 head `1d596e1`; [App](https://github.com/Ahn-taegyu/Yeobek/actions/runs/43565396278)·[Knowledge](https://github.com/Ahn-taegyu/Yeobek/actions/runs/43565396325) 성공 | 서비스 RPC·전시 Q&A·학습 묶음·W11 인계 완료. B 공개 연결도 #25 병합 |
| W2 | [#13](https://github.com/Ahn-taegyu/Yeobek/pull/13) 병합 `9c6efbf`, 검사 head `351156f`; [App](https://github.com/Ahn-taegyu/Yeobek/actions/runs/43567373083)·[Knowledge](https://github.com/Ahn-taegyu/Yeobek/actions/runs/43567373169) 성공 | W10 section·후보/이력 보존 반영. 파일 읽기도 #28 병합; 프런트 후보 검수·운영 cron은 별도 |
| 프런트 인계 초안 | [#20](https://github.com/Ahn-taegyu/Yeobek/pull/20) 병합 `461d32f`, 검사 head `f0d49e9` App·Knowledge 성공 | W12 계약과 최종 통합 인계도 #25 병합 |
| 시연 데이터 기반 | [#23](https://github.com/Ahn-taegyu/Yeobek/pull/23) 병합 `0facdbc`, 검사 head `605a7aa`; [App](https://github.com/Ahn-taegyu/Yeobek/actions/runs/43566211707)·[Knowledge](https://github.com/Ahn-taegyu/Yeobek/actions/runs/43566211687) 성공 | 승인 Q&A 3개 확장도 #25로 병합·CI 성공 |
| W12·키 당일 점검표 | [#25](https://github.com/Ahn-taegyu/Yeobek/pull/25) 병합 `1bd6734`, 최종 head `b8d1daf`; [App](https://github.com/Ahn-taegyu/Yeobek/actions/runs/43573981012)·[Knowledge](https://github.com/Ahn-taegyu/Yeobek/actions/runs/43573981010) 성공 | 서버/API·모의 통합·인계 완료. 실제 키/운영 전환·프런트 UI는 별도 |

CI 성공은 위 검사 head에 한정한다. #25에는 A 파일 읽기 #28·최종 인계 #30을 통합했고 P0 draft/advance→게시→관람/TTS, 체크리스트 typed client, 모의 Q&A 운영 전환, 제목 조사 회귀까지 확인했다. 외부 AI/TTS 호출0회. 완료 조건 최초 보강은 #27(`514347b`)이며 [B 최종 완료 표](../docs/specs/backend-completion.md#b-최종-완료인계-2026-11-14)에 범위·증거·남은 검증을 모았다.

- [SRC-055](../docs/references/user-visitor-tts-publication-policy.md): **승인 글로 먼저 게시하고 관람객이 음성을 켜면 답변 시 TTS를 생성한다.** 저장 음성·Q&A 개수·평가 횟수는 게시 필수가 아니다. 승인 Q&A는 생성 근거로만 사용한다.
- STT 인식문은 확인 후 전송한다. 질문이 명확히 지칭한 작품/번호는 답변 대상과 상단 선택에 함께 반영하고, 잘못된 번호·모호한 지칭은 추측하지 않는다. 초안 번호 변경은 다음 명시적 게시부터 공개본에 적용한다.

## 최초 계획과 수용 기준 (구현 완료)

| 순서 | 작업 | 예상 | 끝나는 기준 |
| --- | --- | --- | --- |
| 1 | **프런트 인계 문서 초안** `docs/specs/frontend-handoff.md` — SC-A01~A10·SC-V01~V06별 API·타입·상태·오류 코드·플래그. 기존 API와 병합된 W10(PR #15)·W9(PR #17) 계약 기준, 미구현은 "예정(W11/W12)"으로 표시. 공개 관람 주소 `/exhibitions/{id}` 유지(`/visit` 구현 시 기존 주소 진입도 지원) | 0.5~1h | 문서 PR 병합(Knowledge CI) |
| 2 | **시연 데이터** `npm run db:seed:demo` — 작가 계정, 전시 1개, 작품 3개, 승인 해설, 게시 상태. 로컬 개발 전용 | 1h | CI 또는 A 스택 여유 시 확인. 운영 환경에서 실행 거부 |
| 3 | **W12 공개·관람 P0** — 게시 체크리스트(전시명·기간·장소·작품 1개 이상·번호 고유·승인 해설), 이미지 없이 게시 허용, 시험용 해설 운영 게시 차단(R2), 공개 응답에 포스터·작가 표시명·날짜·시간, 채팅 응답에 대상 작품 공개 이미지 참조, `exhibitionScopeChat`(미선택 시 전시 공통 근거) | 2~3h | 병합. 기존 응답·outputMode 의미 유지 |
| 4 | **승인 Q&A 공개본 포함** — A의 W11a 서비스 RPC로 승인 Q&A를 versioned 공개 스냅샷에 넣고, 이전 schemaVersion 읽기 유지 | 0.5h | 병합 |
| 5 | **키 당일 점검 문서** `docs/specs/key-day-checklist.md` + 인계 문서 최종화 + 전체 흐름 확인 | 1h | 문서 병합 |

합계 약 5~6.5시간. 1·2는 프런트를 풀어 주는 일이라 가장 먼저 한다. W10(PR #15)과 W9 직접 가입(PR #17)은 이미 병합돼 있으니 인계 문서에 바로 넣는다.

## 완료 조건

- `docs/specs/frontend-handoff.md`가 병합돼 있고 SC-A01~A10·SC-V01~V06 모든 화면에 API·타입·상태·오류·플래그가 있다. 미구현은 "예정"으로 표시돼 있다.
- `npm run db:seed:demo`로 게시된 시연 전시(작품 3개, 승인 해설, A가 끝냈다면 승인 Q&A)가 만들어지고, 운영 URL에서는 거부된다.
- W12가 병합됐고 최신 head App·Knowledge CI가 성공했다. 게시 체크리스트 항목별 실패 사유, 이미지 없는 게시, 시험용 해설의 운영 게시 차단, 기존 응답·outputMode 호환이 검사로 증명돼 있다.
- `exhibitionScopeChat`은 기본 off이고 off일 때 기존 관람 회귀가 통과한다.
- 승인 Q&A가 공개 스냅샷에 들어가고 이전 schemaVersion을 읽을 수 있다(A의 W11a가 늦으면 미완료로 적음).
- `docs/specs/key-day-checklist.md`가 병합됐다.
- `docs/specs/backend-completion.md`의 W12·W7 행과 `docs/log.md`가 실제 상태와 같다. 외부 AI·TTS 호출은 0회다.

- SRC-055의 글 우선 게시·답변 시 TTS·작품 선택·다음 게시 번호 반영을 검사하고 프런트와 연결한다.

### 작업별 확인 기준

| 작업 | 완료로 판단할 동작·증거 |
| --- | --- |
| 인계 문서 | 화면별 실제 경로·타입·요청/응답 예·오류·플래그·모의 동작이 병합 코드와 맞는다. 예정 API를 호출 가능한 것으로 적지 않고 A의 Q&A 계약을 연결한다. |
| 시연 데이터 | 로컬에서 전시 1개·작품 3개·승인 해설·게시 상태를 기존 RPC/API로 만든다. 운영 URL 거부를 검사하고 A 연결 후 승인 Q&A를 포함한다. A 스택 사용은 조율하거나 CI에서 검증한다. |
| W12 게시·관람 | 체크리스트 항목별 실패와 이미지 없는 게시 성공, 모의 해설 운영 게시 거부를 검사한다. 포스터·작가명·기간/시각·작품 이미지는 공개 범위만 반환하며 기존 outputMode와 구버전 응답 호환을 확인한다. |
| A→B Q&A 연결 | 승인된 특정 버전만 snapshot에 넣고 draft·철회 항목은 제외한다. 이전 schemaVersion 조회, 교체 게시·철회 후 근거/캐시/음성 재검증을 검사한다. A의 RPC만 준비된 상태는 B 연결 완료가 아니다. |
| W7 최종 인계 | 가입→인증→직접 로그인→입력→생성→검수/승인→게시→공개 조회/채팅을 모의 모드에서 확인한다. 화면이 없으면 API/시드로 검증한 경계를 밝힌다. 실제 Auth·AI/TTS·품질·지연·비용·cron은 키 당일 체크리스트의 미검증 항목으로 남긴다. |

완료 증거는 **PR 링크, 검사 대상 head SHA, CI 링크·결과, 병합 SHA, 직접 확인한 범위·환경, 미검증 항목**으로 남긴다. A가 늦으면 독립 작업을 먼저 병합하되 Q&A 연결과 최종 통합은 미완료로 유지한다.

## 전달할 프롬프트

```
Yeobek 저장소의 남은 백엔드를 두 에이전트가 병렬로 진행한다. 너는 "공개·관람·인계"(에이전트 B)를 맡는다.
최신 체크포인트: W11 #18·W2 #13·파일 읽기 #28·인계 #20·시연 기반 #23·W12/점검표 #25가 병합 완료다. #25 main1bd6734, 최종headb8d1daf App43573981012·Knowledge43573981010 성공. 아래 순서는 최초 계획이며 다시 구현하지 않는다. 이후 범위는 프런트 UI·키 당일 실환경 검증이다.
에이전트 A는 진행 중인 Q&A 저장(W11a)·생성·미리보기·지시문 수정(W11b) → W2 자료 정리 → 업로드 파일 읽기를 맡는다.
W10·W9·W13은 이미 병합됐다. W11은 #18로 병합됐으며 전시 Q&A·학습 묶음 API도 포함한다. 기존 계약을 재사용한다.
SRC-050: 생성 세트당 작품 최대3·전시 최대5, 항목별 승인/철회, 승인 Q&A는 생성 근거다.
SRC-052: 관람 보완 요청의 Q&A 전환 제외, 조회·재게시 후 확인/종료 유지. 재게시만으로 자동 종료하지 않는다.
프런트는 사람이 구현하며 병합된 인계 문서·시연 데이터를 사용한다. 마감은 2026-11-15(일) 아침이다.

먼저 읽을 것: AGENTS.md, docs/AGENTS.md, docs/agent-workflow.md, docs/collaboration.md,
docs/specs/backend-completion.md(W12·W7 절), docs/specs/screen-spec.md(SC-A·SC-V 표), docs/specs/api-contract.md.
결정 기록: docs/references/user-v3-decisions.md, user-v3-review-decisions.md. 이 문서들은 해당 절만 찾아 읽어라.
PR #25는 병합됐다. 후속 작업은 최신 main과 완료 표를 기준으로 기존 체크아웃을 재사용한다.

## 네 순서
1. 프런트 인계 문서(0.5~1h): docs/specs/frontend-handoff.md를 만든다. 화면 ID(SC-A01~A10, SC-V01~V06)별로
   호출할 API, src/lib/contracts/의 타입 이름, 상태값, 오류 코드, 관련 플래그, 모의 모드 동작을 표로 적는다.
   main의 기존 API, 병합된 W10(PR #15: 온보딩·작품 세계·전시 단계 저장·작품 재정렬·사진/포스터·홈 집계)과
   W9(PR #17: 가입·인증 코드·재발송·세션) 계약을 기준으로 하고, 아직 없는 것은 "예정(W11/W12)"으로 표시한다. 공개 주소는 /exhibitions/{id}를 유지한다. /visit 화면을 추가해도 기존 공개 주소로 진입할 수 있어야 한다.
   프런트가 이 문서를 보고 바로 붙이므로 짧고 정확하게. 먼저 병합해라.
2. 시연 데이터(1h): npm run db:seed:demo. 작가 계정, 전시 1개, 작품 3개, 승인 해설, 게시 상태까지. 기존 RPC·API 경로로
   만들고 DB를 직접 조작하는 우회는 피한다. 로컬 개발 환경에서만 동작하고 운영 URL이면 거부한다. 생성 계정 정보는 Git 제외 .env.demo.local에만 저장하고 예제에는 비밀값을 넣지 않는다.
   A의 W11a가 병합되면 승인 Q&A 2~3개를 추가한다.
3. W12 공개·관람 P0(2~3h):
   - 게시 체크리스트: 전시명·기간·장소·작품 1개 이상·번호 고유·승인 해설. 항목별 미충족 사유 반환. 이미지 없이 게시 허용(A3).
     voiceRequired 기본 false. 저장 음성·Q&A 개수·평가 횟수는 게시 필수가 아니며 음성 출력은 답변 시 TTS로 생성한다.
   - 시험용(모의) 해설은 개발 시연만 허용하고 운영 게시는 차단한다(R2). 검사로 증명해라.
   - 공개 전시 응답에 포스터 참조·작가 표시명·시작/종료 날짜와 시간. 포스터도 공개 스냅샷과 공개 미디어 검사를 거친다.
   - 채팅 응답에 대상 작품의 공개 이미지 참조 필드 추가(기존 필드 의미 유지).
   - exhibitionScopeChat 플래그(기본 off): 작품 미선택 시 전시·작가 공통 승인 근거로 답한다. 작품 선택만으로
     답변·음성을 만들지 않는다. STT는 인식문 확인 후 전송(기존 유지), 질문이 명확히 지칭한 작품은 답변과 상단 선택에 함께 반영한다. 모호한 지칭은 추측하지 않는다.
     초안 번호 변경은 다음 명시적 게시에만 공개본에 반영한다.
     승인 답변 직접 반환은 하지 않고 생성 근거로만 쓴다.
   - 교체 게시·철회 때 근거·캐시·음성을 재검증하는 기존 동작을 깨지 마라.
4. 승인 Q&A 공개본 포함(0.5h): A가 W11a PR에 적은 서비스 전용 RPC로 승인 Q&A를 versioned 공개 스냅샷에 넣는다.
   이전 schemaVersion 읽기를 유지한다. A가 아직이면 3을 먼저 병합하고 기다리지 말고 5로 간다.
5. docs/specs/key-day-checklist.md(Auth 설정·이메일 인증 메일·실제 AI/TTS 키·음질·사람 평가·p50/p95·비용·플러그인 버전·
   Vercel Hobby 제약·cron 연결), 인계 문서 최종화, 가입→게시→관람 전체 흐름을 모의 모드로 한 번 확인.

## 하지 않는 것 (드랍, 이미 결정)
W6 운영 집계, W8 잔여(예약 안내·문의 본문 물리 삭제·요약), Alt 웹훅, 운영 브리핑·실패 분류, QR 제작, 게시·검수 화면 구현(프런트 범위,
디자인 없음). 시간이 남아도 먼저 나에게 묻는다.

## A와 충돌 막기
- 이 PC의 로컬 Supabase 스택(포트 고정, 한 대에 하나)은 A가 소유한다. 너는 로컬에서 스택을 시작·초기화·migration 적용하지 마라.
  DB(pgTAP)·HTTP 검사는 PR CI로 확인한다. 로컬은 unit·typecheck 등 DB 없는 검사만 한다.
- Q&A 표·미리보기·작업 원장 생성 경로·W2 자료 정리·파일 읽기는 A 소유다. 고칠 일이 생기면 A 몫으로 PR에 적어라.
- 병합 직전 main을 합친다. 이미 공유/적용한 migration200000~224000·230000/231000은 이름과 본문을 유지하고 추가 정정은 신규 migration으로 한다. CI의 전체 순서 적용과 기존 환경 전진 적용을 구분한다.
- database.types.ts, contracts/routes.ts, features.ts, docs/log.md, api-contract.md, backend-completion.md는 네 절·행만 추가한다.
- frontend-handoff.md는 네가 소유하고, A는 예상 Q&A·미리보기·파일 읽기 절만 추가한다.
- 프런트가 관람·공개 쪽 필드를 요청하면 네가 처리한다.

## 사용량 아끼기
- 전체 lint·typecheck·test·build·DB 검사는 PR CI로 한 번 확인한다.
- 별도 검토 에이전트는 공개 게시 SQL·권한·migration diff에만 쓴다.
- 실제 외부 AI·TTS 호출은 하지 않는다(모의 모드).

## 완료 조건 (모두 충족해야 끝)
- 저장 음성·Q&A 없는 승인 글 게시, 음성 활성 시 답변 TTS, 명확한 작품 지칭/상단 선택·모호한 지칭 처리·다음 게시 번호 반영을 검사한다.
- frontend-handoff.md 병합, 모든 SC-A·SC-V 화면에 API·타입·상태·오류·플래그 기재.
- db:seed:demo가 게시된 시연 전시를 만들고 운영 URL에서는 거부한다.
- W12 병합, 최신 head App·Knowledge CI 성공. 체크리스트 사유·이미지 없는 게시·시험용 해설 운영 게시 차단·기존 응답 호환을 검사로 증명.
- exhibitionScopeChat 기본 off, off일 때 기존 관람 회귀 통과.
- 승인 Q&A의 공개 스냅샷 포함과 이전 schemaVersion 읽기(A가 늦으면 미완료로 보고).
- key-day-checklist.md 병합. backend-completion.md의 W12·W7 행과 docs/log.md가 실제 상태와 같다. 외부 호출 0회.
- 이 문서의 작업별 확인 기준을 대조하고 PR·검사 head SHA·CI 링크·병합 SHA·환경·미검증 범위를 남긴다.
- A가 늦으면 독립 범위만 병합하고 승인 Q&A 공개 연결·최종 통합은 미완료로 유지한다.

## 보고
묶음마다 5줄 이내: 병합 SHA, 확인한 검사와 CI, 켠/끈 플래그, 기본값으로 처리한 결정, 프런트에 알릴 변경.
나머지 규칙(커밋·PR·병합 판단·사람 검토 지점)은 AGENTS.md와 docs/collaboration.md를 따른다.
```
