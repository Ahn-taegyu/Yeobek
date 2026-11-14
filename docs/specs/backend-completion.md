---
type: Specification
id: SPEC-016
title: 백엔드 완성 작업 추적
description: v3 D0 및 W0~W13의 범위·순서·검증 경계와 실제 진행 기록.
status: draft
updated: '2026-11-14'
tags: [yeobek, backend, automation]
rag_include: true
generated:
  by: codex/gpt-6.1-terra
  at: '2026-11-14T02:24:28+09:00'
decision_status: proposed
work_status: in_progress
sources:
- id: parallel-author
  resource: /references/user-backend-author-parallel-plan.md
  title: 병렬 백엔드 A 범위
- id: visitor-policy
  resource: /references/user-visitor-tts-publication-policy.md
  title: 자동 TTS와 관람 정책
- id: gap-exclusion
  resource: /references/user-gap-qa-exclusion.md
  title: 관람 보완 요청의 Q&A 전환 제외
- id: qa-policy
  resource: /references/user-expected-qa-policy.md
  title: 예상 Q&A 생성·검수 정책
- id: figma-review
  resource: /references/figma-review-v3.md
  title: Figma W11 화면 직접 대조
- id: signup-contract
  resource: /research/signup-auth-contract.md
  title: W9 이메일 가입과 직접 로그인 경계
- id: figma-authoring
  resource: /references/figma-authoring-v3.md
  title: Figma 작가 입력 화면 직접 대조
- id: status-precedence
  resource: /references/user-dashboard-status-precedence.md
  title: 미공개 전시 준비중 우선
- id: questionnaire
  resource: /references/user-artist-questionnaire.md
  title: 작가 기본 작품 세계 세부 질문지
- id: v3-answers
  resource: /references/user-v3-decisions.md
  title: v3 범위와 Vercel Hobby 답변
- id: review-answers
  resource: /references/user-v3-review-decisions.md
  title: 해설 수정·검수 화면·모의 게시 정책
- id: v3
  resource: /references/user-backend-plan-v3.md
  title: 백엔드 v3 화면·리스크 보강
- id: v2
  resource: /references/user-backend-plan-v2.md
  title: 백엔드 완성 계획 v2
- id: signup-policy
  resource: /references/user-signup-security.md
  title: 이메일 인증 필수와 비밀번호 8자 이상
- id: p0
  resource: /decisions/D-017-p0-feature-spec.md
  title: Notion P0 개정
- id: channel-auth
  resource: /references/user-channel-webhook-auth.md
  title: 채널톡 문의 웹훅 인증 선택
- id: request
  resource: /references/user-backend-completion.md
  title: 백엔드 완성 계획 요청 원문
- id: artist-auth
  resource: /decisions/D-016-artist-auth.md
  title: 작가 직접 회원가입과 로그인 선택 진입
- id: auth-timing
  resource: /references/user-auth-signup-timing.md
  title: 작가 직접 가입 마감 전 포함 결정
---

# v3 범위와 실제 상태

[원 계획 SRC-033](../references/user-backend-completion.md)의 목표를 유지하며 [v2 SRC-041](../references/user-backend-plan-v2.md)를 바탕으로 [v3 SRC-044](../references/user-backend-plan-v3.md)를 우선 적용한다. 상세 근거는 [기능명세 P0·BR-16](functional-spec.md), [화면](screen-spec.md), [시나리오](user-scenarios.md), [데이터 모델 P0](data-model.md), [RAG 승인→검색](rag-design.md)이다. 각 묶음 시작 때 원문을 다시 읽고 요약과 다르면 원문을 우선한다.

| 묶음 | 실제 상태 | 남은 경계 |
| --- | --- | --- |
| W0 | done, PR #4 | 기존 계약 유지 |
| W1 | done, PR #5 | 예상 Q&A는 W11이며 기존 followUpQuestions와 다름 |
| W3 | done, PR #8 | OCR·자동 매칭 제외 |
| W4 | done, PR #6·9 | P0 공개 계약 변경은 W12 |
| W5 | done, PR #7·10 | P0 전시 문맥·출력 전환은 W12 |
| W8 | in_progress, PR #11의 진행 안내·문의 범위 병합 | 예약 안내·Alt·요약·분류·브리핑·물리 삭제 등 잔여 |
| W2 | done, [PR #13](https://github.com/Ahn-taegyu/Yeobek/pull/13), main9c6efbf | 최종 head351156f App43567373083·Knowledge43567373169 성공, W10·이력/만료 신규220000 |
| 파일 읽기(A) | done, [PR #28](https://github.com/Ahn-taegyu/Yeobek/pull/28), main4f7faee | 최종 head04facaa App43571147499·Knowledge43571147654 성공, HTTP/비활성 회귀 통과; materialExtraction 기본off |
| D0 | done, PR #14 | main 861d27a, App·Knowledge CI 성공 |
| W10 | done, PR #15, main dadc23b | v3 온보딩·사진/포스터·홈 상태, 전체 CI 성공 |
| W13 | done, PR #16, main44bf7d3 | 리스크1·5·6·8·9 및 기한 반영, App·Knowledge CI 성공. 운영 적용은 W7 |
| W9 | done, PR #17 | 직접 가입, 이메일 인증 필수·최소 8자 확정 |
| W11 | done, PR #18, main40564e6 | 예상 Q&A·검수·미리보기·B용 승인 조회, 최종 App/Knowledge 성공; 공개 연결은 B |
| W12 | done, [PR #25](https://github.com/Ahn-taegyu/Yeobek/pull/25), main1bd6734 | 최종 headb8d1daf App43573981012·Knowledge43573981010 성공. 공개/관람·P0 단계·모의 출처·Q&A·번호/제목·클라이언트 회귀 완료; 운영 전환은 점검표 |
| W6 | not_started | 운영 및 가입→전시→게시 집계 |
| W7 | done (서버 모의 검증·문서 인계), #20·23·25 병합 | 가입→P0 draft/advance→생성/검수→게시→관람/TTS 단일 흐름 성공. 실제 SMTP·AI/TTS·품질/비용/지연·cron·프런트 UI는 미검증 |

전달 당시와 실제 차이: PR #12는 `23f6ee0`으로 `docs/p0-feature-spec`에 이미 병합됐으나 main에는 없었다. D0는 이 통합 브랜치와 main을 합친다. main의 SRC-035·036을 보존하고 기획 브랜치의 가입·직접 로그인 출처만 SRC-039·040으로 옮긴다. SRC-037·038은 유지한다. W2는 실제로 착수해 있었으므로 폐기하지 않고 Draft PR로 보존했다.

PR #11 head `6ca0cef`의 App checks `43549028404`·Knowledge checks `43549028410` 성공과 차단 리뷰 부재를 확인해 `2d7bea1`로 병합했다. 아래 과거 기록의 CI 대기·미연결 표현은 당시 상태다. 실제 외부 AI·발송 호출은 0회이며 서버 모의 검증과 실물 품질을 구분한다.

# 순서와 검증

**최신 병렬 계획(SRC-054): A는 W11 → W2 → 업로드 파일 읽기, B는 인계·시연 데이터 → W12 → 최종 점검을 맡는다. 이전 직렬 계획의 W6·W8 잔여·Alt·브리핑·평가 통계는 이번 범위에서 제외한다.** W7의 검증 근거는 각 묶음에서 누적한다. 완료 묶음을 다시 만들지 않고 변경 차이만 새 migration·추가 필드로 구현한다.

각 묶음은 migration → RPC·pgTAP → 저장소 어댑터·플레이북 → HTTP·통합 검사 → API·개발 기반·작업 추적·로그 순으로 정리한다. 경로·표·RPC 이름은 제안이며 기존 관례를 따른다. 전체 lint·typecheck·단위/DB/HTTP·build·knowledge verify는 최신 head CI로 확인하고 로컬은 좁은 재현과 기존 DB 전진 적용 등만 한다. 위임 diff를 직접 대조하고 오류를 피드백한 뒤 영향 검사를 재검증한다.

# 남은 묶음의 수용 범위

## W13 보안·운영 보강

리스크 1 IP 해시 제한과 승인 해설/저장 음성 접근 유지, 5 개인정보·신규 플래그 기본 off, 6 이미지 3MiB/PDF 6MiB 전송 상한, 8 invalid_context 재시도 불가, 9 public RPC 전체 권한 카탈로그 대조 및 실행 시간/임대 간격을 먼저 구현한다. 상한·플래그 변경에는 CI·환경 예제·검사를 맞춘다. 원본 IP는 저장하지 않고 신뢰할 프록시 헤더와 실제 호스팅 요금제를 확인한다. 1·5·6·9는 마감 축소 대상이 아니다.


## D0 문서 통합

PR #12가 병합된 문서 브랜치를 main에 통합하고 ID 충돌·목차·로그·API·개발 기반을 양쪽 보존한다. 새 v2 원문 SRC-041과 가입 정책 SRC-042를 연결한다. Knowledge CI 성공과 교차 검토 후 병합하며 제품 구현 완료로 쓰지 않는다.

## W10 입력 계약

주체별 section ID·라벨·필수 여부·길이를 `src/lib/contracts/`의 단일 선언에서 파생시킨다. 기존 ID를 유지하며 전시 1단계 선택 3개·2단계 선택 6개, 작품 안내 질문 6개와 작가 공통 작품 세계를 원문대로 연결한다. 작가 질문 7개는 SRC-043을 반영하며 임의 필수 항목을 추가하지 않는다.

전시 필수값이 비어도 임시저장하고 날짜·시간·작성 단계를 공개 상태와 분리한다. 1단계 다음/최종 완료에서 전시명·시작/종료 날짜와 시간·장소·기간 순서를 검증하고 조건별 사유를 반환한다. 2단계 선택 답변은 모두 비어도 통과한다. 작품은 부분 저장·임시 제목·크기 단위·초안 정렬을 제공하고 재정렬은 원자적으로 번호를 갱신한다. 활성 공개 번호는 게시 전까지 유지한다. PATCH 전체 값 저장/생략 null 계약은 유지한다. 홈은 작성 단계·작품 세계 등록 상태를 반환하고 W8 상태 조회 및 W12 미완성 게시 차단과 연결한다.

## W9 직접 가입

[확정 정책](../references/user-signup-security.md)은 **이메일 인증 필수, 가입 비밀번호 최소 8자, 가입·이메일 확인 후에도 직접 로그인**이다. 새 강도 규칙을 기존 계정 로그인에 소급 적용하지 않는다. 재설정·추가 강도·세션 수명·안내/동의는 미결정이다.

signup/session API 이름은 제안이다. 공식 Supabase 문서로 가입 방식과 확인 동작을 검증하고 브라우저의 직접 Auth 가입 우회를 막는다. 응답에서 세션 쿠키를 설정하지 않고 자동 반환 세션도 관리자 접근에 사용하지 않는다. 계정 존재를 드러내지 않는 오류·결과 불명 복구·요청 중복과 정책 기반 호출 제한을 구현한다. 비밀번호·토큰을 로그·업무 원장·이벤트에 보관하지 않는다. 프로필은 기존 최초 홈 조회/전시 생성 시 계정당 하나만 지연 생성한다. `signup` off는 404, 기존 로그인은 유지한다. 가입 직후/확인 전 관리자 401, 확인 후 직접 로그인, 로그아웃 후 401·기존 계정 불변을 검사한다.

## W11 예상 Q&A·검수·미리보기

작품/전시 Q&A에 질문·답변 작업본·출처 ID/버전·기준 revision·내용 버전/해시·draft/approved/withdrawn·생성/정정/보완답변 출처를 보존한다. 승인은 특정 버전을 고정한다. 생성 작업은 기존 원장의 중복·한도·재시도를 사용하고 전시 일괄 시작은 대상별 예약과 묶음 상태 조회로 구현한다. 작가 보완 질문 `followUpQuestions`와 예상 Q&A의 이름·저장을 분리한다.

목록·수정(새 작업본)·승인·철회와 review bundle 상태를 연결한다. 작가 미리보기는 인증·소유권을 확인하고 초안 문맥/관람 공개 캐시·한도를 분리한다. 응답별 평가·정정은 새 Q&A 작업본으로 검수하며 대화 전체를 공개 근거로 쓰지 않는다. 보완 질문 답변도 동일 검수 경로를 쓴다. `expectedQa`, `previewChat` 플래그를 준비한다. SRC-050에서 생성 세트당 작품 최대3·전시 최대5, 개별 승인·철회와 평가 횟수 조건 없음, 승인 Q&A를 생성 근거로 사용하는 기준을 확정했다.

## W12 공개·관람 P0

전시명·기간·장소·작품 1개 이상·번호 고유·승인 해설의 체크리스트와 보완 화면을 제공한다. 이미지는 선택이며 이미지 없이 게시를 허용한다(A3). SRC-055에 따라 `voiceRequired` 기본 false이며 저장 음성·Q&A 개수·평가 횟수는 게시 필수가 아니다. 관람객이 음성을 켜면 답변 시 TTS를 요청한다. 기본 작품 세계와 참고 파일은 선택이다.

승인 Q&A를 versioned 공개 스냅샷에 포함하고 이전 schemaVersion 읽기를 유지한다. 교체 게시·철회에서 근거·캐시·음성을 재검증한다. 공개 전시 주소와 번호·제목 라벨을 유지하며 QR 제작은 MVP에서 제외한다. 기존 응답 호환을 별도 필드/플래그로 유지한다. 작품 조회 API는 목록/정보용으로 남긴다. 공개 소개에 날짜·시간을 반환한다.

`exhibitionScopeChat`이 켜지면 미선택/해제는 전시·작가 공통 승인 근거와 전시 Q&A를 사용한다. SRC-050에 따라 승인 Q&A는 생성 근거로 사용하고 기본 작품 소개의 승인문 직접 반환은 유지한다. 새 P0 흐름은 항상 글 답변을 반환하고 음소거에 따라 TTS를 요청한다. 기존 outputMode 의미는 변경하지 않는다. 작품 선택만으로 답변·해설·음성을 만들지 않는다. 선택 시 안내 음성 이행 플래그는 새 P0 흐름에서 기본 off로 둔다. 기존 구현은 질문 이후 선택 요청 문장의 낭독도 있으므로 실제 호출 조건을 확인하고 선택 동작과 혼동하지 않는다. STT 인식문은 확인 후 전송한다. 명확한 작품 제목/번호는 응답 참조와 상단 선택에 반영하고 잘못된 번호·모호한 지칭은 추측하지 않는다. 초안 번호는 다음 명시적 게시부터 공개본에 반영한다.

## W8 잔여·W6

가입 완료 거래성 안내, 검수 대기/미완성 초안 N일 안내, 승인 독촉·전시 종료 예약 안내를 추가한다. N은 정책값이며 진행 이름은 새 P0 단계에 맞춘다. 가입 폼에서 수신 동의를 받지 않고 홍보성은 동의 전 발송하지 않는다. 문의 본문의 물리 삭제·로그 정제, 보완 질문 요약이 남는다. Alt 웹훅/전사 가져오기는 W2 후에 후보로 연결하고 직접 원문을 덮어쓰지 않는다. 실패 분류·운영 브리핑도 후속이다.

W6는 [원 계획 W6](../references/user-backend-completion.md)의 운영 집계와 운영자 전용 접근·기능 플래그 범위를 유지한다. 추가로 자동화 처리·자동 비율·개입 건수와 가입→전시 생성→게시 집계를 반환한다. 이메일·관람 질문·비공개 원문을 반환하지 않는다.

## W2 보존 체크포인트

[PR #13](https://github.com/Ahn-taegyu/Yeobek/pull/13)은 후보 생성·조회·명시적 적용·원문 이력, 작업 원장 중복 방지·원자적 완료를 보존한 Draft다. 부모 직접 단위·계약 92개, DB 46개, 실제 로컬 Auth·DB와 모의 AI HTTP 6개가 통과했다. 신규 131000으로 SQL 변수 참조 오류를 수정했다. 최초 head `4252478`의 Knowledge CI는 성공했으나 App CI는 테스트 fixture의 TypeScript 오류(TS2353)로 실패했으며 후속 d276d9f에서 수정해 App·Knowledge CI 성공을 확인했다. 구형 section 2개 제한, 후보/이력 FK와 만료 작업 정리의 정합성을 W10 이후 맞춰야 한다. 미병합이며 main 기능으로 표시하지 않는다. F03 인터뷰는 P1이므로 포함하지 않는다.

## W7 검증·인계

모의 전체 경로는 가입→이메일 확인→직접 로그인→홈→전시 2단계 임시저장/이어쓰기→작품/재정렬→해설·Q&A→검수/정정/승인→게시→공개 주소/전시 소개→전시·작품 채팅→보완/재게시다. 다른 계정 404, 승인 전/게시 전 데이터와 미리보기의 공개 노출 금지, 철회·캐시·TTS 재검사 및 플래그 off의 기존 흐름을 포함한다.

`npm run db:seed:demo`는 계정·전시 1개·작품 3개와 승인 Q&A가 포함된 게시 상태를 준비한다. `frontend-handoff.md`는 SC-A01~A10·SC-V01~V06별 API·타입·상태·오류·플래그·모의를, `key-day-checklist.md`는 Auth 설정·실제 파트너/AI·음질·사람 평가·p50/p95·비용·플러그인 버전을 다룬다. 인계 초안은 #20으로 병합됐으며 최종 계약 보강과 키 당일 점검표도 #25로 병합됐다. 가입부터 P0 작성 단계/관람/TTS까지 단일 모의 HTTP 회귀는 최종 headb8d1daf App43573981012에서 성공했다. #28·30을 통합한 #25는 main1bd6734로 병합됐다. section 목록 항목 추가/제거의 변경 용이성과 신규 플래그 off 회귀를 확인한다.

# 미결정과 마감 조정

일요일 아침(2026-11-15)이 마감이다. Q-09는 이메일 인증·8자만 확정됐고 나머지는 열어 둔다. W11 질문 수/검수 기준과 승인 Q&A 사용은 SRC-050에서 확정했다. W12의 글 우선 게시·선택적 답변 TTS·STT 확인·작품 지칭·다음 게시 번호 정책은 SRC-055를 적용한다. 미결정인 실물 모델/음성과 운영 설정은 키 당일 체크리스트에서 구분한다.

운영 자동화가 우선이면 W8 안내/요약·W6을 W11 미리보기 정정·전시 전체 Q&A보다 앞당길 수 있다. 줄이는 순서는 **지시문 재작성(직접 수정 유지) → 전시 전체 예상 Q&A → Alt → 브리핑 → W2**다. 축소한 기능은 플래그 off·미구현으로 인계한다. 현재 D0는 새 제품 플래그를 켜거나 끄지 않는다. 실물 모델·음성·행사 키·발송 품질은 미검증이며 모의 성공으로 대체하지 않는다.

# 이전 구현·검증 기록

아래는 시점별 기록이며 현재 상태는 위 표를 따른다.

# W0 구현·검토한 계약

기존 실행 HTTP 17개 작업의 요청·응답을 `src/lib/contracts/`에 모으고 재수출로 기존 import를 보존한다. 타입 클라이언트는 응답 봉투를 검사하며 기존 로그인·홈의 네 호출을 사용한다. 미래 API 등록은 경로 구현과 함께 진행한다. 기존 SQL 응답 조립과 계약을 직접 대조하고 실제 쿠키 인증·초안 HTTP 회귀를 확인했다. 브라우저 직접 조작은 이번에 수행하지 않았다.

`src/lib/policy.ts`의 AI 길이 계약과 정책 기본값, `app_policies` migration이 추가되었다. 작가 일일 작업 100회·전시 일일 요청 1,000회·작업 보존 30일·정리 후보 만료 24시간은 측정 전 구현 초기값이다. 분당 6회·답변 접근 1시간과 사용자 확정 보완 질문 30일을 함께 둔다. W1 작가 일일 한도·작업 만료와 W5 관람 한도·보완 질문 정리를 RPC로 연결했다. 변경된 정책은 RPC에서 읽고 프로세스 메모리의 기본값으로 대체하지 않는다.

서버 `features.ts`는 `FEATURE_GAPS`, `FEATURE_FOLLOW_UP_QUESTIONS`, `FEATURE_OPS_AGGREGATION`, `FEATURE_VOICE_REQUIRED`를 읽는다. 생략 시 true, 명시 값은 true/false만 허용하며 빈 값·오탈자는 503이다. 기능이 미구현인 동안 true가 기능의 실행 가능성을 뜻하지 않는다.

W4 게시·재개는 서버 전용 worker가 현재 음성 필수 설정을 전달하며 같은 DB 트랜잭션에서 동기화·검사한다. 이전 공개본은 플래그 변경만으로 바뀌지 않는다. W5 보완 질문 저장도 실제 쓰기 권한 경계에서 비활성화를 강제한다. W5 보완 요청 RPC는 검증된 서버만 호출하며 기능 설정을 인자로 전달해 쓰기·조회에서 검사한다.

# W0 검증 근거

부모가 실제 diff·원 계약·SQL 응답을 대조하고 실행한 결과: lint·typecheck·번들·단위 335개·프로덕션 build, 기존 스키마에서 새 migration 전진 적용·pgTAP 88개·DB 타입 생성, 실행 앱 HTTP 10개, mock 설정의 6기능과 오프라인 비교 5사례가 통과했다. DB reset이나 실제 AI 호출은 하지 않았다. 빈 기능 플래그, 모의 모드 변수명·환경 주입·결과 표시 누락을 교차 검토 후 수정하고 회귀를 확인했다. 새 DB 설치·Linux 통합은 PR의 CI에서 확인하며 기존 성공 결과를 코드 변경 없이 반복하지 않는다.

# W1 로컬 검증과 남은 확인

해설 생성·작업 조회·재시도·명시적 초안 적용 네 경로와 작업 원장을 구현했다. 서버 전용 service-role worker, 소유자별 일일 한도, 180초 lease와 30일 만료를 사용한다. 동기 실행 중단은 조회·재시도로 복구한다. 로컬 bundle·typecheck·build·단위 350개, pgTAP 135개, 모의 HTTP 5개가 통과했다. 기존 production HTTP 10개와 lint도 통과했고 PR #5의 CI를 확인하고 `54437476`으로 병합했다. 30일 만료는 접근 차단이며 W5 정리 RPC/HTTP를 추가했다. 운영 스케줄러는 배포 때 연결한다. 실제 외부 호출은 아직 없다.

# W4 글 승인·게시 (음성 후속)

근거와 해설을 별도 승인하고 선택 작품과 명시적으로 고정한 소개 근거를 원자적으로 게시한다. 중지·재개와 같은 소유자의 다른 전시를 포함하는 근거 철회, 출처 버전 변경 검사를 구현했다. `audio_assets`는 준비 스키마이며 음성 작업·저장과 업로드는 W3 이후다. 현재 글 게시와 음성 없는 재게시에는 `FEATURE_VOICE_REQUIRED=false`가 필요하다. 공개 문맥 서비스 RPC는 W5 관람 글 HTTP와 연결했다. 로컬 DB 197개·단위 357개·typecheck·build와 새 게시 HTTP 5개가 통과했다. 이미지 준비는 DB fixture이며 실제 업로드·미디어 검증은 W3에서 연결한다. 실제 AI 호출은 0회다.

# W5 글 관람 검증과 남은 범위

글 채팅, 공개 버전 일괄 확인, 작가 보완 요청 조회·닫기, 비밀값으로 보호한 만료 정리 HTTP를 연결했다. 실제 공개본으로 승인 해설·질의응답을 제공하고 서버 세션 쿠키, DB 분당/일일 상한, 동일 요청 재사용, 자료 부족 질문만 30일 보관을 적용한다. 음성 인식·낭독·미디어는 W3 이후이며 현재 음성 모드는 선호 값만 보존한다. 자세한 호출 계약은 [API 계약](api-contract.md#w5-글-관람보완-요청-계약)을 따른다.

Sol의 SQL·HTTP 테스트를 부모가 읽고 직접 실행했으며 별도 Sol이 서버 코드를 교차 검토했다. 전시 변경을 통한 분당 한도 우회, 비활성 보완 요청의 직접 DB 접근, UUID 대소문자, 취소·재시도 오류 매핑과 기록 장애의 정상 답변 차단을 발견·수정했다. 전진 migration·pgTAP 233개, 단위 383개(381개 전체와 추가 cron 인증 2개), typecheck·build, 관람 HTTP 5개와 기능 비활성 HTTP 2개를 확인했다. 실제 외부 AI 호출은 0회다. 정리 RPC/HTTP는 준비됐지만 운영 스케줄러는 배포 때 별도로 연결해야 한다.

# W3 비공개 파일 업로드

`feat/backend-materials`에서 3MiB 이미지·6MiB PDF의 비공개 업로드·완료·조회·삭제와 작품 이미지 지정·삭제를 연결했다. 원본의 크기·형식·실제 이미지 디코딩·PDF 페이지 수를 확인한 뒤 검증한 바이트를 별도 final 경로에 저장한다. 업로드 서명은 staging 경로에만 발급하며 final 충돌 시 실제 해시를 비교한다. `sharp` 0.35.5, `pdf-lib` 1.17.1을 고정했다. 자동 OCR·작품 매칭은 포함하지 않는다.

Sol SQL 구현을 부모가 검토·실행하고 별도 Sol이 Storage를 교차 검토했다. 삭제된 작품의 문서 응답 오류, 새 번호 인덱스 오류 매핑, 구형 PDF 근거의 신규 게시 우회, 동시 완료·정리 시점·SDK 409 처리를 수정했다. 공유된 SQL은 새 `061000` migration으로 보완했다. 부모 직접 pgTAP 282개, 단위 397개, lint·typecheck·build와 프로덕션 HTTP 15개(실제 Storage 5개 포함)가 통과했다. PR #8 head 807a01b의 App checks 43490571029와 Knowledge checks 43490571232가 성공했고 aa20688로 병합했다.

삭제는 즉시 논리 적용하고 물리 정리는 재시도한다. `cleanupPending`은 최종 파일 삭제뿐 아니라 준비된 자료의 임시 파일 정리도 뜻한다. `POST /api/cron/purge`가 만료 업로드와 정리 대상 최대 50개를 처리한다. 서명 URL은 완료 가능 시간과 별도로 약 2시간 유효할 수 있으므로 업로드 만료+2시간 3분 이후 다시 정리한다. 완료 자료는 임시 파일만 제거한다. 운영 스케줄러 연결은 배포 때 필요하며 실제 제공사 호출은 0회다.

구현 참고: [Supabase signed upload](https://supabase.com/docs/reference/javascript/file-buckets-createsigneduploadurl), [signed upload의 upsert 설정](https://supabase.com/docs/reference/javascript/file-buckets-uploadtosignedurl), [sharp 입력 검증](https://sharp.pixelplumbing.com/api-constructor/), [PDF 페이지 수](https://pdf-lib.js.org/docs/api/classes/pdfdocument#getpagecount).


# W4 음성 작업 로컬 검증

`feat/backend-audio`에서 승인 해설의 비공개 음성 저장을 연결했다. 기존 작업 원장에 audio 종류와 전용 플레이북을 추가하고, 합성 직전·완료 시 승인·근거·글 해시·음성 설정을 대조한다. 제공사·모델·목소리·형식·모의 여부의 지문을 만들며 같은 설정 버전의 다른 지문은 거부하고 새 `voice_config_version`을 사용한다. 이미 게시된 스냅샷은 설정 변경으로 소급 수정하지 않는다. 실환경 재개는 모의 음성을 차단한다.

부모가 Sol SQL·HTTP diff와 기존 게시 함수를 대조하고 별도 Sol 검토를 반영했다. SQL 완료 결과 변수·정리 CTE, 음성 작업을 해설 초안으로 적용하는 경로, 예약 오류 상세 유실, 취소 확인과 모의 음성 재개를 수정했다. 신규 migration 070000~073000의 전진 적용과 pgTAP 319개, 단위 408개(전체 407개 통과 후 플러그인 버전 기대값을 수정한 17개 재검사), lint·typecheck·build가 통과했다. 실제 Storage를 이용한 모의 음성 HTTP 1개, 기존 모의 작업·게시·관람 15개와 프로덕션 HTTP 15개도 통과했다. 음성 파일의 헤더·MIME·8MiB 상한과 충돌 해시를 검사하며 전체 MP3 디코딩이나 한국어 음질을 검증한 것은 아니다.

HTTP 실행 후 남은 음성 설정과 만료 답변이 DB 회귀 검사를 방해하지 않도록 테스트를 격리했다. PR #9 head `1a68b1e`에서 App checks `43495518705`와 Knowledge checks `43495518694`가 통과했고 `2a46ecc`로 병합했다. CI의 단위 408개·pgTAP 320개를 포함한 검사와 차단 리뷰 부재를 확인했다. 실제 외부 AI 호출은 0회다.

# W5 미디어·실행 기록 진행

`feat/visitor-audio`에서 공개 이미지·기본 해설 음성의 `GET /api/media/{id}?kind=image|audio`를 연결 중이다. ID는 공개본 UUID이며 private Storage 경로·서명 URL을 클라이언트에 주지 않는다. 공개 전시/작품 응답에 `image`와 `audio` 참조를 추가하고, 파일을 내려받기 전후 현재 공개 상태와 파일 해시를 확인한다. 실환경은 이미 활성인 모의 음성도 제공하지 않는다. 응답은 바이너리이며 no-store·nosniff와 기존 JSON 오류 봉투를 유지한다.

관람 Q&A의 제공사·모델·토큰 수·소요 시간도 세션별 만료 원장에 저장한다. 질문·프롬프트·답변 본문은 사용량 기록에 포함하지 않는다. 승인 해설은 모델 사용량을 만들지 않으며 저장된 답변 재사용은 사용량을 중복 기록하지 않는다. 모델이 응답을 반환하지 않은 네트워크 실패의 실제 과금은 알 수 없으므로 임의로 0 토큰을 기록하지 않는다.

관람 전사·낭독과 사용량 기록도 연결했다. 녹음은 편집 가능한 인식문만 반환하고 저장하거나 자동 전송하지 않는다. 인식문은 답변 보존 기간 안에서만 재사용한다. 낭독은 세션의 저장된 답변과 현재 공개 상태를 검사하며 승인 음성을 재사용하거나 생성 답변 음성을 비공개로 캐시한다. 작품 선택 전의 고정 안내도 전시 공개 상태·세션·만료를 검사해 낭독한다. 정리 cron은 만료된 관람 음성도 처리한다.

부모가 Sol 코드·SQL·검사를 직접 대조해 정리 CTE 오류, MP4/M4A 전달 불일치, TTS 설정 없는 승인 음성 재사용, 늦은 취소 응답, 작품 선택 전 음성 누락을 보완했다. 신규 migration 080000~085000을 전진 적용했다. DB 390개, 단위 452개(최종 전체 실행에서 451개 통과 후 정책 seed 검사 파일 목록을 보완한 4개 및 요청 복사 수정 후 기한 검사 2개 재검사), lint·typecheck·프로덕션 build, 관람 HTTP 6개·승인 음성/미디어 HTTP 1개·프로덕션 회귀 HTTP 15개를 부모가 직접 확인했다. 실제 Storage 저장·해시·권한·만료 정리 검사를 포함하지만 외부 AI 호출과 한국어 음질 검증은 0회다. CI·병합은 아직이며 W2·W6·W8과 W7 통합·인계는 남아 있다.

최종 교차 검토에서 요청 본문 수신을 포함한 60초 음성 기한, 초과 인식문 보존·편집 안내, 같은 세션의 만료 410, 승인 음성 파일 장애의 불필요한 합성 방지, 캐시 재사용 원장의 별도 쓰기 한도와 완료 실패 정산을 보완했다. 원래 녹음과 임의 답변은 저장/합성하지 않는다. Next.js 요청 객체를 복사할 때 생긴 실제 HTTP 오류도 고친 뒤 재검증했다.

PR #10 head `b8bc325`에서 App checks `43501138642`와 Knowledge checks `43501138638`의 성공, 차단 리뷰와 미해결 스레드 부재를 확인한 뒤 `8696d35`로 병합했다. 위 CI 대기는 로컬 검증 당시 기록이며 현재 W5 서버 범위는 병합 완료다.

# W8 제공사 경계와 DB 설계 진행

[공식 계약 조사](../research/automation-provider-contracts.md)를 거쳐 `src/lib/automation/`에 메일·상담·전사 포트, 스티비·채널톡·Alt 어댑터와 개발 전용 모의 어댑터를 추가했다. 서명 검증은 Alt의 시각 제한 HMAC과 채널톡 AppStore의 raw-body HMAC을 구분한다. 어댑터는 권한 검사를 대신하지 않는다. 서명 후에도 계정 연결, 이벤트 중복 방지, 상태별 정책과 발송 직전 동의 확인이 필요하다.

Sol이 작성한 Alt 코드를 부모가 공식 응답 구조와 대조하고 관련 검사를 직접 실행했다. 다른 Sol이 부모 작성 발신 코드를 검토해 408/499의 결과 불명 처리와 거래성·홍보성 템플릿 URL 구분을 보완했다. 전체 단위 523개, lint·typecheck·번들·문서 113개/검색 회귀 9개가 통과했다. 외부 실호출은 0회다. 운영 DB·작업 원장 연결·플레이북·실행기·HTTP는 후속이며 제공사 어댑터만으로 W8 완료를 판정하지 않는다.

DB 설계는 이벤트의 처리 대상과 자동화 종류를 분리하며, 같은 이벤트/종류의 중복을 막는다. 발송함의 `accepted`는 제공사 접수이고 `unknown`은 재전송을 멈추고 운영자에게 넘길 상태다. 초안 승인과 전송 사이에 정책·수신 동의가 바뀌면 다시 확인한다. 기존 `ai_jobs`는 명시적 자동화 종류에만 이벤트 대상을 허용하도록 확장하며, 작가용 조회·재시도에 운영 작업이 노출되지 않게 해야 한다. 이 문단은 구현 계약이며 DB 검증 완료 보고가 아니다.

이후 신규 `20261114090000_automation_foundation.sql`을 부모가 검토·수정 피드백 후 전진 적용했다. 운영자·정책·이벤트·동의·도움말·계정 연결·발송함과 RPC를 추가했다. 이벤트 완료의 동일 입력 재실행, 전송 직전 한 번만 본문 전달, 만료·동의 철회·정책 변경 차단을 DB에서 확인했다. 기존 포함 pgTAP 418개 통과 후 확장한 자동화 검사 45개를 직접 재실행했다(총 범위 435개). 타입 생성·정책 회귀 4개·typecheck·프로덕션 build도 통과했다. 아직 상태 전이 이벤트 트리거, `ai_jobs` 연결, 문의 원문과 대화 대상 고정, 토큰 저장소·웹훅 수신·실행기·HTTP는 남아 있다. 공개 제품 흐름은 이번 기반 추가로 바뀌지 않는다.

# W8 작업 원장·수신 동의·운영 검토

앞 절의 기반 이후 `091000` 원장, `092000` 검토 페이지, `093000` 발송 lease 재검사 migration을 전진 적용했다. 이벤트당 하나의 `ai_jobs`와 시도별 사용량·단계를 남기며 완료·발송함 생성을 원자적으로 처리한다. 자동화 일일 한도는 작가 생성 한도와 분리했다. 중단·만료·최대 시도 도달 시 실행 중 원장이 남지 않도록 정산하고, 운영 작업을 작가용 작업 조회에서 숨긴다.

작가 동의 GET/PATCH와 운영자 발송함 GET/승인/거절 HTTP, 로컬 운영자 지정 명령을 연결했다. 기본 목록은 완료 건에 밀리지 않는 draft 커서 조회다. 승인 시 만료·삭제를 차단하고 발송 예약 및 본문 전달 직전에도 검사한다. 정책/동의 잠금을 기다리다 lease가 끝나면 본문을 전달하지 않는다. 승인된 본문을 제공사 어댑터에서 임의 trim하지 않도록 같은 계약을 사용한다.

부모가 Sol 원장 코드와 별도 검토를 대조하고 `running` 잔류·오래된 대기 건 누락·만료 승인 문제를 수정했다. 발송 RPC 두 경로에서 삭제 전후를 직접 검증했고, 실제 DB guard 지연을 모사해 만료 허가가 나오지 않는 것도 확인했다. Zod 길이가 UTF-16이라는 리뷰 의견은 설치된 4.6.7에서 직접 재현되지 않아 채택하지 않았으며, 실제 재현된 trim 변형만 수정했다. 기존 HTTP fixture가 남긴 만료 파일·승인 건은 테스트 트랜잭션 안에서만 분리하고 rollback으로 복원한다.

부모 직접 전체 DB 480개와 이후 guard 지연을 추가한 큐 21개(총 검사 범위 483개), 계약 스냅샷 58개·typecheck·production build, 개발 HTTP 4개를 확인했다. 프로덕션 HTTP는 기존 API 10개·운영 4개가 통과했고, Storage는 실행 셸의 `TEST_CRON_SECRET` 누락을 바로잡아 해당 파일 5개만 재실행해 통과했다. 실제 외부 호출은 0회다.

발송 실행 컴포넌트는 DB의 일회 허가 → 제공사 한 번 호출 → 결과 기록을 다루며, 결과 불명·저장 오류를 자동 재발송으로 해결하지 않는다. 한 번에 한 건만 예약하고 마감 이후에는 진행 중인 한 건만 정산한다. 반환 건수는 제공사 결과이며 DB 저장 성공 건수와 같지 않다(`persistenceFailures` 별도). Store RPC 자체의 시간 상한과 mock/live 포트 조립은 런타임 책임이다. 전체 단위 535개 통과 후 수정 영향 검사 111개(발송 39·채널 14·계약 58개)를 부모가 직접 재실행했다. 아직 DB 저장소·런타임·cron 연결 전이며 여러 worker의 합산 발송률 제어, Liner 플레이북, 이벤트 트리거, 실제 문의 대상 고정, 토큰 관리·웹훅·전사 가져오기가 남아 있다. 이 단계를 W8 또는 전체 백엔드 완료로 표시하지 않는다.

# W8 진행 안내 모의 통합

후속 `100000`~`100300` migration과 `ops-notify` 0.9.0 플레이북으로 전시 생성·해설 초안 완료·게시 신호를 실제 실행기와 연결했다. 작업 원장은 서버 실행기가 예약·완료하고 AI 단계는 상태 조회·생성·출력 검증·상태 재확인으로 기록한다. 상태와 집계만 Liner에 보내며 `AI_ROUTE_AUTOMATION`은 Liner 경로만 허용한다. 승인/정책·수신 동의 뒤에 스티비 포트를 호출한다. 키 없는 개발은 같은 경로의 명시적 mock을 사용한다.

부모는 Sol의 SQL과 하네스 diff를 직접 읽고 기존 blocker 함수 이름 충돌을 수정했다. 다른 Sol의 실행기 검토로 완료 정책 변경 후 집계 오류, 전역 lease 만료 중 허가 반환, 기록 유실 시 발송 간격 보호를 보완했다. Terra가 작성한 실행기 pgTAP을 부모가 직접 읽고 실행했다. 리뷰의 작업 예약 인자 순서 의심은 실제 함수 계약과 실행으로 기각했다.

부모 직접 전체 DB 525개, 전체 단위 575개와 추가 실행기 경계 5개(현재 총 범위 580개), 계약 59개·lint·typecheck·production build, 실제 쿠키의 자동화 mock HTTP 4개 및 기존 production HTTP 19개가 통과했다. 최초 통합 테스트의 생성 상태 코드를 200으로 잘못 기대한 부분은 실제 계약 201로 고친 뒤 다시 실행했다. `draft` 승인 후 발송·`auto` 거래성 발송·`off` 무모델 처리·수신 동의 철회 차단·중복 발송 방지와 작업 단계/사용량 저장을 확인했다. Linux CI에 같은 mock HTTP 검사를 추가했다. 이전 head `f73bab5`의 App/Knowledge CI는 통과했으며 이번 추가 변경의 새 CI는 별도 확인한다.

현재 연결 범위는 거래성 진행 안내의 세 이벤트다. 승인 독촉·전시 종료의 예약 안내, 문의 응대와 검증된 대화 대상·토큰 저장/갱신·웹훅, Alt 가져오기, 보완 질문 요약·실패 분류·운영 브리핑, W2·W6·W7이 남아 있다. 실외부 AI/발송 호출은 0회이며 실제 품질·행사 권한은 키 입력 후 점검한다. 전체 목표나 W8을 완료로 판정하지 않는다.

# W8 채널톡 토큰 연결 준비

`110000` 신규 migration으로 서비스 전용 토큰 캐시를 추가했다. 앱별로 30분에 10회의 발급·갱신 예약 한도를 공유하고 채널별 30초 lease로 동시 발급을 막는다. 암호화 키는 서버 환경에 두고 앱·채널에 결합한 AES-256-GCM 암호문만 DB에 저장한다. 60초 이상 유효한 캐시는 외부 발급 없이 재사용한다. 신뢰된 설정 조립 함수는 채널이 다른 요청과 production mock을 차단한다. 아직 문의 처리 실행기에 연결하지 않았으며 웹훅·작가 연결·지원 플레이북이 남아 있다.

부모가 Sol의 제공사 코드와 다른 Sol의 SQL을 직접 읽고 공식 SDK 계약과 대조했다. 교차 검토에서 토큰 유효기간 상한 불일치, 저장 중 만료된 토큰 반환, 의존성 오류의 상세 노출 가능성을 보완했다. 요청 중단 후 늦은 발급·저장, 잘못된 앱·채널·키의 암호문, 다른 lease 완료와 롤링 한도도 검사했다. 부모 직접 전체 단위 616개, DB 598개(신규 73개), lint·typecheck·bundle·production build, 새 빌드의 기존 HTTP 19개가 통과했다. DB 타입 차이는 신규 RPC 두 개뿐이다. 최초 런타임 검사에서 production mock 오류의 한국어 메시지를 코드 문자열로 잘못 기대한 부분을 오류 코드 검사로 정정한 뒤 재실행했다. 실제 외부 발급·발송·AI 호출은 0회다.

PR #11 head `514e104`의 App checks `43545439379`와 Knowledge checks `43545439387`는 GitHub 계정의 결제 실패 또는 spending limit 때문에 job이 시작되지 않았다는 주석을 확인했다. 코드 실패로 해석하지 않으며 CI 성공으로도 간주하지 않는다. 사용자 계정의 Billing & plans 확인이 필요하다. 로컬 구현은 계속하고 최신 CI 성공 전 병합하지 않는다. 토큰 복구 도구·키 당일 점검은 W7, 나머지 W8·W2·W6도 계속 남아 있다.

사용자 재확인 요청 후 같은 두 workflow의 실패 job만 재실행했다. 두 번째 시도에서 App job `132299534589`와 Windows/Linux 문서 job `132299558594`·`132299558803`이 실제 실행 단계를 시작한 것을 확인했다. 앞 문단의 실행 차단은 해소됐으며 이 확인 시점에는 아직 검사 완료 전이다.

두 번째 시도의 Knowledge 검사는 성공했다. App은 lint·타입·단위·DB·빌드·일반 HTTP·기존 모의 AI 흐름을 통과했으나 새 자동화 HTTP의 auto 안내 대기에서 실패했다. SQL과 실행기를 대조한 결과, 발송 간격으로 approved에 돌려놓은 메시지를 같은 배치에서 재예약하고 중복 ID 검사로 빠져나오면 새 sending lease가 남는 경로를 재현했다. CI의 개별 행 이력은 없으므로 정확히 같은 경로였는지는 추론이다. null 허가 시 배치를 끝내 다음 cron에서 재시도하게 수정했으며 별도 Sol이 SQL·코드 교차 검토를 수행했다. 부모는 수정 전 좁은 회귀 실패와 수정 후 발송 검사 40개 성공을 확인했다. 최신 사용자 지시에 따라 전체 로컬 검사는 반복하지 않고 새 head CI에서 확인한다. 다른 null 허가도 남은 배치를 다음 실행으로 넘기므로 다음 cron 예약이 필요하다.


# W8 문의 자동화 진행

[사용자 선택](../references/user-channel-webhook-auth.md)에 따라 기존 채널톡 웹훅 URL 토큰으로 수신하고 AppStore Native API로 발신한다. 명시적 계정 연결, 고정된 chat 대상, 근거 기반 답변과 발송 전 재확인을 추가했다. 부모가 로컬 문의 pgTAP 31개와 관련 단위·계약 107개를 확인했다. 로컬 인증·실제 DB와 모의 답변을 사용한 HTTP 통합 1개는 통과했으며 실제 외부 호출은 미검증이고 물리 보존 삭제와 운영 로그 쿼리 제거 확인은 남았다. 문의 변경 전 SHA `8f80bd4`의 App·Knowledge CI는 성공했으나 현재 문의 변경의 최신 head CI는 대기 중이다. W2·W6·W7과 나머지 W8은 미완료다.


# W2 v2 전환 전 체크포인트 (미병합)

W8 PR #11은 head `6ca0cef`의 App checks `43549028404`·Knowledge checks `43549028410` 성공과 차단 리뷰 부재를 확인한 뒤 `2d7bea1`로 병합했다. 위 CI 대기는 당시 기록이다. W8 전체는 여전히 진행 중이다.

v2 전달 시 실제 로컬에서는 W2 작업을 시작한 상태였다. `feat/artist-knowledge-proposals`에 검토 가능한 체크포인트를 보존한다. 생성·조회·명시적 검수 적용·원문 이력 API와 작업 원장, 원자적 후보 저장·revision/원문 변경 차단을 구현했다. 기존 문서를 생성만으로 바꾸지 않는다. 적용 전 본문·출처를 이력으로 남긴다.

부모가 Sol SQL·하네스 diff와 계약을 직접 대조했다. 단위·계약 92개, 신규 DB 46개, 실제 로컬 Auth·DB와 모의 AI HTTP 6개가 통과했다. 실행 중 발견한 완료 SQL 변수 참조 오류는 이미 적용한 `130000`을 보존하고 신규 `131000`으로 고쳤다. 외부 AI 호출은 0회다. 계약 스냅샷은 신규 API 4개와 작업 조회·재시도의 organize 종류 추가다.

**W2 완료 또는 병합 가능 상태로 보지 않는다.** v2 순서에 따라 D0·W10을 먼저 한다. 아직 구형 주체별 section 2개 계약이며 W10 목록으로 바꿔야 한다. 후보·이력 FK가 만료 작업 삭제에 미치는 영향과 이력 보존 정책, 최신 CI, 프런트 검수 연결이 남는다. 서버 경로는 이 Draft 브랜치에만 있고 main에 활성화하지 않는다.
# W10 착수와 선행 검증

D0 PR #14 head `5b82df1`에서 Knowledge `43551559157`·App `43551559186` 모두 성공하고 차단 리뷰가 없음을 확인해 `861d27a`로 병합했다. W2 Draft #13의 테스트 타입 오류는 `d276d9f`에서 수정했고 Knowledge `43551643125`·App `43551642854` 모두 성공했다. W2는 새 section/만료 정책 선행 때문에 계속 미병합이다.

사용자는 W10의 작가 세부 질문 선택에 기존 자유 입력 유지 대신 질문지 전달을 선택했다. SRC-043의 7개 질문을 카탈로그에 추가하고 전시·작품 P0 원문과 함께 읽었다. 단계/부분 저장과 공개 번호 예약의 호환성을 검토 중이며 아직 W10 DB/HTTP 검증이나 병합을 완료하지 않았다.

W10 구현을 직접 확인했다: catalog check, 단위/계약 70개, 기존 DB forward migration, pgTAP 35개, 실제 로컬 Auth·DB HTTP 5개 통과. SQL CASE 구문 오류를 최초 적용 rollback 후 수정했다. 입력은 draft:true opt-in, 기존 기본 플래그는 유지한다. 전체 CI·새 DB 타입 drift·최종 교차 검토와 병합은 대기다. 공개 번호 반영과 QR/관람 변경은 W12, 직접 가입은 W9 순서로 이어간다.

사용자가 v3 변경분을 전달해 W10 진행분을 먼저 커밋·Draft PR로 보존하고 W13을 선행한다. 이 기록의 W10은 v2 범위이며 v3 온보딩·프로필·포스터·홈 집계까지 완료한 것이 아니다.

PR #15의 첫 App CI는 기존 PDF 페이지 검증과 SQL 오류 코드 회귀를 발견했다. 공유 140000을 수정하지 않고 141000으로 검증을 복구했다. 부모의 기존 DB forward 적용과 영향 DB 검사 163개가 통과했으며 최신 전체 CI는 대기다. 이 수정도 W13 선행 뒤 재개할 W10 체크포인트에 포함한다.

# v3 전환과 진행분 보존

D0는 PR #14로 main 861d27a에 병합됐다. W2 PR #13의 TS2353은 d276d9f에서 수정됐고 App/Knowledge CI가 성공했다. W10 v2 범위는 [Draft PR #15](https://github.com/Ahn-taegyu/Yeobek/pull/15), b950557로 보존했다. 직접 단위/계약 70개·pgTAP 35개·로컬 Auth/DB HTTP 5개·문서 check를 통과했지만 아직 미병합이다. v3의 “W10 미착수/W2 CI 오류” 표와 이 점이 다르다. W13은 fix/backend-security-hardening에서 main 기준으로 진행 중이다.

v3의 추가 수용 범위:

- W10: Figma 질문 문구, 활동 이력 5개, 이름/작가명·키워드·온보딩 상태·사진, 전시 포스터·기간 상태/집계. 기존 자료와 section ID를 보존한다. 프로필 사진/포스터도 3MiB 제한과 공개 검사를 거친다. 순서와 공개 번호 적용 시점은 분리한다.
- W9: 이메일 방식 유지·소셜 제외 확정. 인증 메일 재발송·만료 처리 최소 경로와 공식 발송 설정 확인을 추가한다.
- W11: 전시 묶음 생성/진행 상태, 미리보기 평가와 지시문 재작성. 지시문은 근거가 아니며 평가만으로 승인하지 않는다. 재게시 보완 요청은 자동 종료 대신 재확인 필요로 바꾼다.
- W12: 공개 포스터·작가 표시명·시각, 채팅 작품 이미지, 도슨트 “여운”, 명시적 승인/게시와 접속 URL. QR 제작은 MVP 제외. 모의 해설은 개발 시연만 허용하고 운영 게시를 차단한다.
- W8: 채널톡 저장 대상 고정 검사, 보완 요약은 건수·정제 주제만/URL·개인정보 차단, 스티비 수신 거부 동기화 전 홍보 off, 작가 없는 이벤트의 운영자 편중 해소.
- W7: Figma 화면 이름과 SC ID를 나란히 인계. 모델 ID, 인증 이메일 발송, 배포 환경 4.5MB 초과 미디어, 정리/자동화 스케줄 등록과 실행 시간 실제 점검. 설정하기 전 만료 데이터 물리 삭제를 완료로 표현하지 않는다.

[SRC-045](../references/user-v3-decisions.md)와 [후속 답변](../references/user-v3-review-decisions.md)을 적용한다. 이름·작가명·이메일 필수, 나머지 온보딩 선택, 성별은 기본 미수집이다. 작품 이미지·연도·크기는 작품 편집에서 선택 입력, 전시 파일은 공통 참고 자료다. 다음 버튼에서 저장하고 임시저장 API를 유지한다. 홈은 준비중=미공개 또는 시작 전, 진행중=공개·기간 내, 종료=종료 시각 경과이며 미공개는 종료 시각이 지나도 준비중이 우선이다(SRC-048). 기본 해설은 직접 수정하고 그 외 답변은 지시문으로 수정하며 두 검수 화면을 분리한다. QR·별도 도슨트 화면 후보는 MVP에서 제외하되 기존 서버 계약과 명시적 승인·게시는 유지한다. R1은 본문/근거 삭제 RPC 설계만 문서화, R3은 PR에 사람 검토 지점을 남기고 기존 위임 기준으로 병합한다. “정확해요”는 기본에 따라 평가 기록이며 승인·게시를 대신하지 않는다. W10 작가 화면 8개는 SRC-049에서 직접 대조했다. W11·W12 화면은 각 묶음 시작 시 직접 확인한다. 축소 순서는 지시문 재작성(직접 수정 유지) → 전시 전체 Q&A → Alt → 브리핑 → W2다. 미구현/비활성은 인계에 그대로 쓴다.

PR #15 후속 60f1113의 Knowledge 43554593053·App 43554593044가 모두 성공했다. 공개 PDF 검증/SQLSTATE 회귀는 141000에서 복구했고, 직접 영향 DB 163개도 통과했다. v3 W13 선행과 W10 추가 범위 때문에 Draft로 보존하며 아직 병합하지 않는다.


# W13 구현·검증 기록 (병합 전)

- 리스크 1: Vercel이 덮어쓴 단일 IP 헤더만 신뢰하고 HMAC 식별자로 제한한다. 서버 전용 `VISITOR_IP_HASH_SECRET`이 운영에 필요하다. 쿠키 교체와 무관한 네트워크 단위 초기 한도는 분당 30회/UTC 일일 200회다. 전시장 공유 NAT 용량은 실측 전 정책값이다. `/api/chat` 한도 응답은 429이며 프런트는 공개 작품 GET의 승인 해설과 공개 미디어/저장 음성을 계속 제공할 수 있다. 한도 오류의 fallback 필드로 안내한다.
- 리스크 5: gaps·opsAggregation 및 앞으로 추가할 플래그는 기본 off. 기존 voiceRequired·followUpQuestions 기본 true는 유지한다. 예제 환경과 CI에 명시값을 넣었다.
- 리스크 6: 150000 migration으로 이미지 staging 3MiB, 별도 PDF staging 6MiB, final 6MiB 제한. 선언 크기만 검사하지 않고 실제 signed transfer에도 적용한다. 기존 작은 PDF 완료 경로는 유지하고 큰 PDF 대기 예약은 URL을 재발급받아야 한다.
- 리스크 8: invalid_context → AI_INVALID_CONTEXT, retryable=false. 입력/근거 복구 없이 자동 재시도하지 않도록 표시하며 명시적 작가 재시도 RPC 자체를 제거하지 않는다.
- 리스크 9: public RPC 전체 시그니처와 PUBLIC/anon/authenticated/service_role 실행 권한을 기대 목록 100개와 대조한다. 이후 새 RPC마다 기대 목록을 갱신한다.
- 실행 시간: Vercel Hobby+Fluid 선택. vercel.json의 fluid=true, 작가 생성 150초<임대180초, 관람 글110초<임대120초, 음성90초<임대120초. 내부 업무 기한은 각각120/75/60초다. 배포 실제 실행 시간 확인은 W7에 남는다.

부모가 Sol의 실제 SQL·Storage diff를 읽고 범위/호환성을 대조했다. 별도 Sol 검토에서 찾은 음성 예약 전 취소 재확인·RPC abort 전달·scoped IPv6 정규화 오류를 보완했다. 직접 로컬 전진 migration, 네트워크 pgTAP 15개, 실제 Storage HTTP 6개, mock 관람 HTTP 7개, 관련 단위/계약 검사를 확인했다(마지막 IPv6 경계 포함 네트워크 단위 4개 통과). 전체 권한 검사는 W2/W10 RPC가 추가된 로컬 DB 대신 깨끗한 CI DB에서 확인한다. 전체 lint/type/unit/DB/HTTP/build/knowledge CI는 아직 대기다. 외부 AI·발송 호출은 0회, 운영 배포/스케줄도 미확인이다.


W13 최초 head771766f의 Knowledge43556303790은 성공했고 App43556303720은 lint/type/unit 이후 RPC 권한 pgTAP의 반환 문자열 collation 오류로 중단됐다. 실제·기대 SELECT 열 모두 COLLATE C로 고쳤다. 부모가 실패 파일만 로컬 실행해 비교가 정상 수행됨을 확인했으며 로컬에는 W10의 advance_exhibition_step 등 추가 RPC가 있어 기대대로 목록 불일치로 실패한다. 권한 기대 목록을 약화하지 않고 새 head의 깨끗한 CI DB에서 전체 일치를 확인한다.


## W13 병합과 W10 재개

PR #16 head77c99ff의 App43556599236·Knowledge43556599214가 모두 성공하고 차단 리뷰가 없어 main44bf7d3으로 squash 병합했다. DB 권한 전체 대조·타입 drift·빌드·실제 로컬 API/mockAI HTTP가 CI에서 통과했다. W10 브랜치에 main을 병합하면서 양쪽 문서·SRC043~047과 코드/타입/계약 snapshot을 보존했다. 신규 실제 API 호출·운영 배포는 없으며 W10 v3 추가를 이어간다.

## W10 v3 직접 검증과 병합 대기

Figma 작가 화면 8개를 직접 읽어 SRC-049에 문구·선택지와 차이를 기록했다. SRC-048의 미공개 우선 분류를 적용했다. 온보딩/비공개 사진·포스터 API, 활동 이력 5개, 상태별 홈 집계와 기존 입력 계약을 연결했다. 이름·이메일·키워드는 AI 근거로 자동 복사하지 않는다. 사진/포스터 공개 snapshot은 W12 후속이다.

부모가 Sol 구현의 실제 diff와 기존 SQL/HTTP를 대조하고 별도 Sol이 권한·동시성·호환성을 교차 검토했다. 검토에서 찾은 DATE→timestamp 초과 범위 오류를 날짜/시각 tuple 비교로 고쳤으며 두 극단 날짜 회귀를 추가했다. 새 counts는 이전 서버 읽기를 위해 optional로 선언했다. 170000/171000을 소유 로컬 DB에 전진 적용했고 DB 검사 147개, 단위/계약 78개, 기존 P0 HTTP 5개와 새 온보딩/실제 PNG Storage HTTP 1개가 통과했다. HTTP 최초 동시 실행에서는 Next 개발 manifest가 비어 500을 반환했으며 실패한 새 테스트만 단독 재실행해 통과했다. 전체 production HTTP와 타입 drift는 CI에서 확인한다.

로컬 DB에는 W2 보존 migration이 있으므로 생성 타입에서 정확한 W2 차이만 제외했다. 새 DB 전체 RPC 109개 권한 대조·타입 drift·전체 회귀는 최신 PR #15 CI 대기다. 새 제품 플래그를 켜지 않았고 gaps/opsAggregation 기본 off는 유지한다. 실제 외부 AI/발송 0회, 운영 배포 미수행. 이름/메일 확인, 업로드 복합 FK와 삭제 잠금, 새 section을 모르는 구형 클라이언트의 동시 배포/새로고침 경계를 PR 사람 검토 지점으로 남긴다.


## W10 병합과 W9 착수

PR #15 head2852ab9의 App43558293735·Knowledge43558293909가 모두 성공했다. 전체 권한 목록·타입 drift·빌드·production HTTP·mock AI 회귀와 문서 verify를 확인하고 차단 리뷰 없이 main dadc23b로 squash 병합했다. W10 입력 계약은 완료, 프런트와 W11/W12 범위는 별도다. W9는 feat/artist-email-signup에서 이메일 방식으로 진행한다. BR-16·SC-A08/A09·UC20~23·P0 데이터/RAG 원문을 다시 읽었다. 공식 계약과 새 보안 경계는 [가입 조사](../research/signup-auth-contract.md)에 기록한다.


## W9 구현·직접 검증 (CI 대기)

서버 전용 미인증 계정 생성, 코드 재발송/확인, 세션 조회와 기본off signup 플래그를 연결했다. 공유 원문의 서버 전용 가입 조건 때문에 Auth enable_signup:false를 유지한다. min8·OTP6·코드 전용 메일은 설정파일에 명시했고 기존 로컬 데이터를 보존한 재시작으로 확인했다.

Sol SQL/API 실제 diff를 부모가 기존 코드·원문과 대조하고 서로 교차검토했다. 초기 설계의 pending 사전등록 계정 활성화 위험을 발견해 최초 요청 nonce를 서버 app_metadata에 묶었다. 직접 Supabase OTP 토큰도 관리자 권한을 열지 못하도록 신규 가입 계정의 password AMR을 HTTP/RPC/RLS에서 검사한다. 기존 계정·익명 관람 계약은 유지한다. 개인정보/비밀번호를 운영 원장에 넣지 않는다.

부모가 migration180000/181000 전진 적용, DB43+23개, 단위/계약89개, 실제 Auth·Mailpit·쿠키·동시 한도 통합1개를 확인했다. pgTAP 첫 실행의 잘못된 공개 근거 fixture는 현재 schema-v1 형식으로 고쳐 해당 파일만 재실행했다. 새 DB 타입 drift·111개 public RPC 권한 대조·전체 lint/type/DB/HTTP/build·knowledge verify는 CI 대기다. 운영 메일/배포/프런트 화면 미검증, 외부 AI/업무 발송0회. 신규 플래그 기본off·CI 명시on, off HTTP도 별도 실행해 가입/재발송/확인 404와 로그인·세션 유지가 통과했다. 최초 실행은 로컬 네트워크 sandbox 접근 거부였으며 동일 서버/검사를 허용 환경에서 실행했다. 비밀번호 추가 강도·재설정·세션 수명은 기존대로이며 최초 가입ID 유실 복구는 남았다.


## W9 병합과 W11 착수

PR #17 head13286f0의 App43560654686·Knowledge43560654694 성공 및 차단 리뷰 없음으로 main de06460에 squash 병합했다. 전체 권한 목록·타입 drift·production HTTP·mock/off 플래그·문서 verify를 확인했다. signup 기본off, 운영 SMTP·프런트는 미검증이다. 최초 가입ID 유실 복구와 비밀번호 재설정은 미구현이다.

W11은 feat/expected-qa-review에서 SRC-050 결정과 SRC-051의 Figma4화면을 반영한다. 기능 P0·BR-16·화면·시나리오·데이터/RAG 원문을 직접 읽었다. 기존 AI 문맥 검증기가 W10 새 section ID와 2개를 넘는 section을 거부하는 문제를 발견해 공용 카탈로그 읽기 검증으로 보완한다. 생성 출처와 승인 근거의 본문·원문 버전을 대조하고, 배치 생성/조회와 실제 모델 실행을 분리하는 설계를 API/DB 담당이 교차 검토했다. 구현·직접검사·CI는 아직 진행 중이며 W11 완료가 아니다.


## W11 구현·직접 검증 (CI 대기)

SRC-050의 작품3/전시5 상한·항목별 승인/철회·평가횟수 비조건과 SRC-051 화면을 비공개 API로 연결했다. 전시 일괄 생성은 목록 저장/조회와 자식 실행을 분리하고, 기본 해설 적용·근거/QA 승인·게시는 자동화하지 않는다. 정정 근거 초안→승인→독립 평가 재작성 경로를 추가했다. 리스크2는 재게시 시 gap을 열어둔 채 새 공개본 재확인으로 처리하며 별도 종료 요청을 요구한다.

부모가 Sol 두 담당의 실제 diff를 교차 대조했다. 기존 W2 job shape 보존, 생성 뒤 같은 원문 근거 승인 시 fingerprint 충돌, 근거의 임의 문자 절단, 검수용 exact body 누락과 배치별 개별 retry 우회를 보완했다. 적용된 migration은 수정하지 않고193000으로 마지막 제약을 추가했다. 전진 적용 성공, DB91개(처음87개+training15→19), W10 AI 입력1개·예상QA5개·HTTP 계약89개, 실제 Auth/DB+모의AI HTTP6개를 부모가 직접 확인했다. 최초 HTTP 배치 상태 기대201은 계약200으로 수정했다. 전체 최신 CI는 아직 대기다.

기본 플래그는 expectedQa/exhibitionQa/previewChat/qaRewrite 모두off이며 개발 검증에서만 켰다. 실외부 AI 호출0회, 실제 품질·프런트·배포 스케줄은 미검증이다. W12 관람 승인QA 반영·공개 조건과 나머지 W8/W6/W2/W7은 미완료다.


W11 후속 확정: [SRC-052](../references/user-gap-qa-exclusion.md)에 따라 관람 보완 요청→Q&A 전환은 이번 MVP에서 제외한다. 위의 기획/과거 기록에 있는 gap 재작성·정정 대상은 현재 제공하지 않는다. 작가 미리보기와 기존 Q&A 수정, 보완 요청 조회·재게시 후 확인/종료는 유지한다.


W11 최종 교차검토 후194000으로 예약 시 생성 상한을 고정하고 잠금 대기 뒤 만료를 재확인했다. 실모델이 모의 이전 답변을 재작성하는 요청은 차단한다. SRC-052의 gap 전환 제외는 HTTP와 직접 RPC 모두 적용했다. 부모가194000 전진 적용·상한/모의/제외 DB42개와 최종 HTTP6개, 변경된 단위/계약101개를 직접 확인했다. 잠금 대기 중 만료의 실제 동시 실행 재현은 미수행이며 만료 후 콜백과 정적 잠금 순서를 검사했다. 최신 CI는 대기다.


## 병렬 A 전환

[SRC-054](../references/user-backend-author-parallel-plan.md)로 현재 목표가 바뀌었다. W11은 PR #18 a1df889로 커밋·공유됐고 App43563566225·Knowledge43563566258 전 단계가 성공했다. 목표 원문의 “미커밋/CI 미확인”과 다른 점이다. B용 서비스 승인QA 조회 RPC와 W11 인계를 보완한 최종 head로 다시 검증 후 병합한다. 이미 구현한 전시QA·학습묶음은 유지하고 기본off로 포함한다.

A가 로컬 Supabase를 소유하고 전진 migration만 적용한다. B는 공개 게시/스냅샷/관람 채팅·frontend-handoff 전체·시연·키 당일 점검을 맡으며 A는 W11 절만 제공한다. 별도 검토 에이전트는 SQL/권한/migration만 담당한다. 최신 TTS/작품지칭 정책은 [SRC-055](../references/user-visitor-tts-publication-policy.md)에 기록해 B에게 전달했고 아직 현재 코드의 게시 음성 조건을 바꾼 것은 아니다.

195000 서비스전용 승인QA 포트를 추가해 B에게 시그니처·반환형·같은 게시 트랜잭션 호출을 전달했다. 최신 main461d32f까지 확인했으며195000은 main 마지막181000보다 뒤다. 부모 전진 적용과 승인 조회 DB34개가 통과했고, 첫 fixture의 필수mock 누락을 바로잡았다. SQL/권한 독립 검토에 차단사항은 없었다. B 인계문서의 W11절을 추가하고 main461d32f를 합쳤다. 실제 게시 후 비공개 Q&A/미리보기의 관람 문맥·익명 응답 비노출과 게시 revision 변경 후 승인 거부를 포함한 DB31개가 통과했다. 최종 head CI·병합은 대기다.


# W11 병합·W2 병렬 계획 재개

W11 PR #18 검사 head1d596e18d102198c3fd830177bb1c21746f3ab5a의 [App43565396278](https://github.com/Ahn-taegyu/Yeobek/actions/runs/43565396278)·[Knowledge43565396325](https://github.com/Ahn-taegyu/Yeobek/actions/runs/43565396325) 성공과 차단 리뷰 없음 확인 후 main40564e6c5367402d898dbf4f1fb9a18fbf1477c6으로 병합했다. 앞의 대기 문장은 당시 기록이다. B에 서비스 승인 Q&A 포트·W11 인계·SRC-055 최신 음성 결정을 전달했다. 네 신규 플래그 기본off, 외부 AI/TTS0회. B의 공개 snapshot 연결은 W11 완료에 포함하지 않는다.

W2 PR #13에 main40564e6을 합치고 양쪽 API/CI/문서 충돌을 보존해 해결했다. 신규220000으로 W10 catalog 기반 원문 선택, mock snapshot, 후보의 job FK 분리, 적용 이력 보존, 만료 미적용 본문 정리/tombstone, W2+W11 공통 작업 한도를 보완했다. 이미 공유·적용한130000/131000은 수정하지 않았다. Sol의 SQL 독립 검토에서 발견한 지역 변수 함수명 참조 오류는 적용 전에 v_section_id로 수정했고 다시 읽어 차단 해소를 확인했다.

부모 직접 기존 데이터 보존 전진 적용, 후보/만료·이력·권한 DB56개, W10 생성·적용·이력/공통 한도 DB11개가 성공했다. 영향 단위28개와 계약93개가 성공했고 플러그인0.12.0 갱신 뒤 버전 기대를 고쳐 플러그인22개를 재확인했다(중복 합산 금지). W10 HTTP 회귀를 추가했으며 전체 lint/type/unit/DB/HTTP/build·문서 verify는 최종 head CI 대기다. 외부 AI 호출0회, 운영 cron·실물 품질·프런트 후보 검수 화면 미검증. 파일 추출은 다음 단계이며 업로드가 학습 완료를 뜻하지 않는다.

# A 파일 읽기 구현 체크포인트

W2는 PR #13 main9c6efbf 병합 완료다. 최종 검사 head351156f68458b0b7d28e9c27df1d2c76f04881fc의 App43567373083·Knowledge43567373169 성공을 확인했다. 위 과거 보존 체크포인트의 미병합/구형 section 문구는 당시 기록이다.

파일 읽기는 [SRC-054](../references/user-backend-author-parallel-plan.md) 범위로 진행 중이다. 로컬 PDF.js6.5.438, Liner catalog 이미지/PDF 입력과 명시적 OpenAI 대체 어댑터, 읽기 플레이북, 비공개 해시 캐시와 W2 후보 연결을 추가했다. 기존 공유 migration은 보존하고230000·231000을 A 소유 DB에 전진 적용했다. 별도 SQL 검토의 지적을 적용 전에 수정했고 부모가 DB31개·권한1개를 직접 확인했다. 첫 CLI DB 검사 대상이 적용 DB와 달라 소유 컨테이너를 직접 지정해 재확인했다. 초기 파일 fixture에는 final Storage metadata가 없어 실패했고 fixture를 보완했다.

materialExtraction 기본off, 기존 플래그 유지, 실외부 AI/TTS/발송0회. 한도·보관·모의 경계는 [조사](../research/material-reader.md), HTTP와 화면 미구현 경계는 [인계](frontend-handoff.md#파일-읽기--a-담당)에 기록했다. 전체 최신 CI·프런트·실물 품질은 아직 완료가 아니다.

PR #28 첫 head609b4c8의 Knowledge CI는 성공했고 App 타입 검사에서 PDF.js의 미지원 isEvalSupported 옵션과 모의 응답 타입이 실패했다. 설치된 타입 선언을 확인해 옵션을 제거하고 테스트 응답에 명시적 타입을 지정했다. 읽기 단위11개를 재확인했고, 본문 삭제·해시 재업로드 검사를 추가해 DB31개가 통과했다. 최신 head 전체 CI는 확인 전이다.

# A 최종 완료·인계 (2026-11-14)

| 범위 | 병합·검사 head | 최종 CI | 직접 확인·남은 경계 |
| --- | --- | --- | --- |
| W11a/b | [#18](https://github.com/Ahn-taegyu/Yeobek/pull/18), main40564e6 / head1d596e1 | [App](https://github.com/Ahn-taegyu/Yeobek/actions/runs/43565396278)·[Knowledge](https://github.com/Ahn-taegyu/Yeobek/actions/runs/43565396325) 성공 | 승인 조회 포트 DB34, 실제 게시 비공개 노출·미리보기 DB24, 최초 로컬 모의 HTTP6. 공개 snapshot 연결은 B 담당 |
| W2 | [#13](https://github.com/Ahn-taegyu/Yeobek/pull/13), main9c6efbf / head351156f | [App](https://github.com/Ahn-taegyu/Yeobek/actions/runs/43567373083)·[Knowledge](https://github.com/Ahn-taegyu/Yeobek/actions/runs/43567373169) 성공 | 기존 DB220000 전진 적용, 후보/권한56+W10/한도11. 생성→조회→명시적 적용→이력 HTTP는 CI에서 확인 |
| 파일 읽기 | [#28](https://github.com/Ahn-taegyu/Yeobek/pull/28), main4f7faee / head04facaa | [App](https://github.com/Ahn-taegyu/Yeobek/actions/runs/43571147499)·[Knowledge](https://github.com/Ahn-taegyu/Yeobek/actions/runs/43571147654) 성공 | 기존 DB230000/231000 전진, 파일 DB31+권한1, 실제 Storage 파일 HTTP/기본off·후보 적용 확인. 새 DB988개 포함 |

위 수치는 서로 다른 묶음의 실행 범위이며 중복 합산하지 않는다. A는 공유 로컬 DB를 reset하지 않았다. SQL은 별도 Sol 검토와 부모 수정·직접 검사, 나머지는 부모 diff 대조·좁은 회귀·최종 CI로 확인했다. 최초 타입/fixture 실패와 정정은 각 PR에 보존했다. 병합 SHA와 검사 SHA를 구분하며 후속 변경의 검증으로 재사용하지 않는다.

W9·W10·W11·W2는 병합 상태를 표에 반영했다. 새 expectedQa/exhibitionQa/previewChat/qaRewrite/materialExtraction은 기본off다. 전시 Q&A·학습 manifest는 이미 구현된 API를 보존했고 삭제하지 않았다. 추가 제외는 관람 보완 요청→Q&A 전환, 평가 집계, OCR 라이브러리, W6·W8 잔여·Alt·브리핑이다. 실외부 AI/TTS/발송0회이며 실물 품질·비용·지연·운영 cron/SMTP는 완료로 세지 않는다.

B 인계: `get_approved_qa_for_publication` 계약과 동일 게시 트랜잭션 사용, 신규 migration 번호/불변성, source12개/8,000자 예산을 전달했다. W12·시연 확장·최종 전체 흐름은 B의 완료 기록을 따른다. [프런트 인계](frontend-handoff.md)의 W11·W2·파일 읽기 절은 A의 병합 코드와 일치한다. 후보 검수 UI는 이번 디자인 범위 밖이므로 프런트가 명시적 검수·적용을 제공하기 전까지 파일 학습을 숨긴다. B의 키 당일 문서 예정 경로는 `docs/specs/key-day-checklist.md`이며, A 문서에서 그 파일의 병합/실물 검증 완료를 주장하지 않는다.

# B 최종 완료·인계 (2026-11-14)

완료는 서버/API·모의 검증·문서 인계 범위다. [PR #25](https://github.com/Ahn-taegyu/Yeobek/pull/25)의 최종 head `b8d1dafba9b7b3535764f117fa1f7e3fdfa122d9`, base `c5703122842c4aeebea828c208f5e0a9cd0f2cba`, 병합 `1bd6734e833e7310df552dd84c6e2b25b68ba54a`를 확인했다. [App43573981012](https://github.com/Ahn-taegyu/Yeobek/actions/runs/43573981012)·[Knowledge43573981010](https://github.com/Ahn-taegyu/Yeobek/actions/runs/43573981010) 모두 성공했다.

| 완료 조건 | 직접 확인한 증거·환경 |
| --- | --- |
| 계획 완료 조건과 상태 | 최초 문서 #27 병합514347b, A #18·13·28·30 완료 기록 보존. 최신 결정 SRC-050/052/055 적용 |
| 프런트 인계 | 초안 #20 병합461d32f, #25 최종 [인계 문서](frontend-handoff.md). SC-A01~A10·SC-V01~V06의 경로·타입·상태·오류·플래그, 체크리스트 typed client 실패→성공 회귀 |
| 시연 데이터 | 기반 #23 병합0facdbc, #25 승인 Q&A 확장. 로컬 전용 1전시·3작품·승인 해설/QA·게시·재사용 CI, 운영 URL/환경 거부 |
| 게시 수용 | 이미지/저장 음성 없이 승인 글 게시, P0 작성 단계/시각과 항목별 차단 사유, 모의 해설/QA 운영 게시·재개·유지/재전송 검사. 신규232000·233000 포함 DB1078개 성공 |
| 공개·관람 | 포스터/작가명/날짜/시간·공개 이미지 참조, Q&A v2/v1 호환·철회/캐시/음성 재검증, 명확한 제목/번호·조사/모호한 지칭, 다음 게시 번호 적용 |
| 플래그·호환 | exhibitionScopeChat 기본off 및 on/off 회귀, voiceRequired 기본false, 기존 outputMode 유지. 외부 AI/TTS 호출0회 |
| 단일 통합 | 실제 CI 로컬 Auth·DB·Mailpit + 모의 AI/TTS. 가입→메일 코드 확인→직접 로그인→온보딩→P0 draft/advance→해설/QA 생성→미리보기/재작성·승인→게시→관람/TTS→중지 통과 |
| 키 당일 인계 | [점검표](key-day-checklist.md) #25 병합. Auth/SMTP·실제 파일 읽기/후보 적용·AI/TTS·사람 평가·p50/p95·비용·플러그인·Hobby·cron 항목은 미검증 |

A/B 통합 검토의 체크리스트 envelope·제목 조사·모의 QA 운영 재개·P0 작성 단계 누락을 수정했다. 별도 SQL 권한/migration 검토와 부모의 실제 diff·좁은 회귀·CI 로그 대조를 완료했다. B는 A 소유 DB를 시작/reset/적용하지 않았다. 기존 DB 누락 migration의 전진 적용은 새 DB CI와 구분한다.

개발 DB의 공개본을 유지한 채 환경 변수만 live로 바꾸는 것은 지원되는 운영 전환이 아니다. 읽기 API는 앱 모드를 판별하지 않으므로 개발 공개본 선중지·전체 live 재게시 후 트래픽을 허용한다. 실제 프런트 화면, 운영 SMTP·외부 모델 품질/비용/지연과 cron은 이 완료 판정에 포함하지 않는다.
