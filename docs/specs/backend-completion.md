---
type: Specification
id: SPEC-016
title: 백엔드 완성 작업 추적
description: W0~W8 범위와 의존 순서 및 검증 경계.
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
- id: request
  resource: /references/user-backend-completion.md
  title: 백엔드 완성 계획 요청 원문
---

# 범위와 상태

[사용자 요청](../references/user-backend-completion.md)의 목표는 화면과 키 입력만 남기도록 서버·DB·AI 연결을 완성하는 것이다. W0의 기반 구현과 로컬 검증을 마쳤고 W1은 병합됐고 W4 글 승인·게시가 진행 중이며 나머지 묶음은 착수 전이다. 전체 백엔드나 실서비스 완성을 뜻하지 않는다.

| 묶음 | 범위 | 상태 |
| --- | --- | --- |
| W0 | 계약·정책·플래그·라우팅·모의 제공사·타입 클라이언트 | done (PR #4 CI 통과·병합) |
| W1 | 작업 원장·해설 초안·추가 질문 | done ([PR #5](https://github.com/Ahn-taegyu/Yeobek/pull/5), `54437476`) |
| W2 | 자료 정리 후보·원문 이력 | not_started |
| W3 | 비공개 업로드·파일 검증·삭제 | not_started |
| W4 | 근거·승인·음성·게시와 철회 | in_progress (글 승인·게시 로컬 검증 완료, 음성 작업 미구현) |
| W5 | 관람 채팅·음성·보완 요청 | not_started |
| W6 | 운영 집계 API | not_started |
| W7 | 통합 검증·시연 자료·프런트와 키 당일 인계 | not_started |
| W8 | 운영 자동화 정책·이벤트·발송함·스티비/채널톡/Alt | not_started |

# 의존 순서와 검증

W0 → W1 → W4 → W5 글 채팅·보완 요청을 우선한다. W3 이후 W4 음성과 W5 음성 경로를 연결하고, W8 기반과 안내·문의·전사 순으로 진행한다. W6·W2를 뒤따르게 하며 W7 검증을 각 묶음에서 누적한다. 일정이 부족하면 사용자 요청의 우선순위를 따르고 미구현은 명시한다.

각 묶음은 해당 계약·권한·DB/HTTP 검사와 lint·타입·단위·빌드를 확인한다. 전체 흐름은 모의 제공사 통합 검사로 확인하고 결과를 실제 호출과 구분한다. 키 수령 후 기능별 실호출과 사람 평가·지연 비교가 필요하다. 미실행 검사는 완료로 표시하지 않는다.

# 미결정과 한계

모델 ID·행사 키 권한·제공사 요청 형식·품질과 비용은 실측 전 미확정이다. 파트너 우선 원칙은 [D-015](../decisions/D-015-partner-priority.md)를 따른다. 운영 자동화의 외부 발송은 동의·정책·승인 경계를 지키며 실제 운영 적용과 구분한다. 작가 직접 가입은 마감 이후다.

# W0 구현·검토한 계약

기존 실행 HTTP 17개 작업의 요청·응답을 `src/lib/contracts/`에 모으고 재수출로 기존 import를 보존한다. 타입 클라이언트는 응답 봉투를 검사하며 기존 로그인·홈의 네 호출을 사용한다. 미래 API 등록은 경로 구현과 함께 진행한다. 기존 SQL 응답 조립과 계약을 직접 대조하고 실제 쿠키 인증·초안 HTTP 회귀를 확인했다. 브라우저 직접 조작은 이번에 수행하지 않았다.

`src/lib/policy.ts`의 AI 길이 계약과 정책 기본값, `app_policies` migration이 추가되었다. 작가 일일 작업 100회·전시 일일 요청 1,000회·작업 보존 30일·정리 후보 만료 24시간은 측정 전 구현 초기값이다. 분당 6회·답변 접근 1시간과 사용자 확정 보완 질문 30일을 함께 둔다. W1은 작가 일일 한도와 작업 만료를 연결 중이며 전시 한도와 보완 질문 정리는 W5에서 연결해야 한다. 변경된 정책은 RPC에서 읽고 프로세스 메모리의 기본값으로 대체하지 않는다.

서버 `features.ts`는 `FEATURE_GAPS`, `FEATURE_FOLLOW_UP_QUESTIONS`, `FEATURE_OPS_AGGREGATION`, `FEATURE_VOICE_REQUIRED`를 읽는다. 생략 시 true, 명시 값은 true/false만 허용하며 빈 값·오탈자는 503이다. 기능이 미구현인 동안 true가 기능의 실행 가능성을 뜻하지 않는다.

W4 게시·재개는 서버 전용 worker가 현재 음성 필수 설정을 전달하며 같은 DB 트랜잭션에서 동기화·검사한다. 이전 공개본은 플래그 변경만으로 바뀌지 않는다. W5 보완 질문 저장도 실제 쓰기 권한 경계에서 비활성화를 강제한다. 이 연결은 아직 미구현이다.

# W0 검증 근거

부모가 실제 diff·원 계약·SQL 응답을 대조하고 실행한 결과: lint·typecheck·번들·단위 335개·프로덕션 build, 기존 스키마에서 새 migration 전진 적용·pgTAP 88개·DB 타입 생성, 실행 앱 HTTP 10개, mock 설정의 6기능과 오프라인 비교 5사례가 통과했다. DB reset이나 실제 AI 호출은 하지 않았다. 빈 기능 플래그, 모의 모드 변수명·환경 주입·결과 표시 누락을 교차 검토 후 수정하고 회귀를 확인했다. 새 DB 설치·Linux 통합은 PR의 CI에서 확인하며 기존 성공 결과를 코드 변경 없이 반복하지 않는다.

# W1 로컬 검증과 남은 확인

해설 생성·작업 조회·재시도·명시적 초안 적용 네 경로와 작업 원장을 구현했다. 서버 전용 service-role worker, 소유자별 일일 한도, 180초 lease와 30일 만료를 사용한다. 동기 실행 중단은 조회·재시도로 복구한다. 로컬 bundle·typecheck·build·단위 350개, pgTAP 135개, 모의 HTTP 5개가 통과했다. 기존 production HTTP 10개와 lint도 통과했고 PR #5의 CI를 확인하고 `54437476`으로 병합했다. 30일 만료는 접근 차단이며 물리 삭제 정리는 W5에서 구현할 예정이다. 실제 외부 호출은 아직 없다.

# W4 글 승인·게시 진행 중

근거와 해설을 별도 승인하고 선택 작품과 명시적으로 고정한 소개 근거를 원자적으로 게시한다. 중지·재개와 같은 소유자의 다른 전시를 포함하는 근거 철회, 출처 버전 변경 검사를 구현 중이다. `audio_assets`는 준비 스키마이며 음성 작업·저장과 업로드는 W3 이후다. 현재 글 게시와 음성 없는 재게시에는 `FEATURE_VOICE_REQUIRED=false`가 필요하다. 공개 문맥 서비스 RPC가 추가됐지만 W5 관람 HTTP는 아직 없다. 로컬 DB 197개·단위 357개·typecheck·build와 새 게시 HTTP 5개가 통과했다. 이미지 준비는 DB fixture이며 실제 업로드·미디어 검증은 W3에서 연결한다. 실제 AI 호출은 0회다.
