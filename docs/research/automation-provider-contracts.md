---
type: Research
id: RES-007
title: 업무 자동화 제공사 계약 조사
description: W8 스티비·채널톡·Alt 연결의 공식 근거와 구현 전 확인 항목.
status: draft
updated: '2026-11-14'
tags: [yeobek, automation, providers]
rag_include: true
generated:
  by: codex/gpt-6-astra
  at: '2026-11-14T05:28:00+09:00'
sources:
- id: request
  resource: /references/user-backend-completion.md
  title: 백엔드 완성 요청
- id: stibee-index
  resource: https://developers.stibee.com/llms.txt
  title: 스티비 공식 API 목차
- id: stibee-mail
  resource: https://help.stibee.com/email/automation/api
  title: 자동 이메일 API 사용하기
- id: channel-function
  resource: https://developers.channel.io/ko/articles/e7c2fb6f
  title: 채널 앱 핵심 개념과 인증
- id: channel-hook
  resource: https://developers.channel.io/en/articles/Getting-started-f2a30b58
  title: 기존 채널 웹훅 설정
- id: alt-api
  resource: https://altalt.io/llms.txt
  title: Alt 개발자 REST API 안내
- id: alt-hook
  resource: https://altalt.io/en/developers/webhooks
  title: Alt 웹훅 계약
- id: alt-schema
  resource: https://altalt.io/developers/openapi.yaml
  title: Alt 공식 OpenAPI
- id: channel-native
  resource: https://github.com/channel-io/app-sdk/blob/main/ts/packages/core/src/types/native.ts
  title: 채널톡 Native Function 타입 계약
- id: channel-signature
  resource: https://github.com/channel-io/app-sdk/blob/main/ts/packages/server/src/guards/signature.guard.ts
  title: 채널톡 서명 검증 소스
---

# 조사 상태

[W8 요청](../references/user-backend-completion.md)의 구현 전 조사다. 공식 공개 문서를 읽었으며 실제 키·발송·전사 조회·웹훅 등록은 실행하지 않았다. 계약 조회만으로 행사 키 권한이나 통합 동작을 검증했다고 보지 않는다. W8 구현과 모의 전 구간 검증은 남아 있다.

# 스티비

[자동 이메일 API](https://help.stibee.com/email/automation/api)는 미리 설정한 자동 이메일 URL에 `AccessToken`과 `subscriber`를 포함한 JSON을 POST한다. 사용자 정의 필드로 안내 문단을 전달할 수 있다. 200은 요청 접수이며 최종 전달 성공이 아니다. 주소록 등록·수신거부 상태·자동 이메일 설정도 필요하다. 개별 진행 안내에는 이 경로를 우선 검토한다.

일반 이메일 생성·발송의 v2 API와 자동 이메일 트리거를 혼용하지 않는다. 공식 [API 목차](https://developers.stibee.com/llms.txt)의 요금제별 권한과 행사 크레딧이 다를 수 있다. 키 당일에는 자동 이메일 템플릿·필드·주소록을 함께 점검해야 한다.

구현 판단: 발송함의 `accepted`와 최종 전달 확인을 구분한다. 응답 유실 시 재발송하면 중복될 수 있으므로 결과 불명 상태는 운영자 확인으로 넘긴다. 수신 동의는 발송 직전에도 다시 검사하고, 개인화 필드의 HTML은 서버에서 이스케이프한다. 외부에는 수신 주소와 허용 안내만 전송한다.

# 채널톡

[AppStore Function](https://developers.channel.io/ko/articles/e7c2fb6f)은 원본 요청 바이트의 HMAC-SHA256 `x-signature`를 검증한 뒤에만 `context`를 신뢰한다. Signing Key와 발신용 App Secret·채널 토큰은 역할이 다르다. 기존 [Open API 웹훅 안내](https://developers.channel.io/en/articles/Getting-started-f2a30b58)의 URL token 방식과 같은 프로토콜로 가정하지 않는다.

공식 SDK의 현재 경로는 `ts/packages/` 아래다. Native 발신은 `https://app-store-api.channel.io/general/v1/native/functions`에 PUT, `x-access-token`과 `method: writeUserChatMessage`, `params: {channelId, userChatId, dto: {plainText}}`를 전달한다. 응답의 `result.message`만 읽고 고객 부가 정보는 버린다. `issueToken`은 App Secret과 channelId로 채널 범위 토큰을 받으며 갱신·캐시가 필요하다. 현재 어댑터는 이 토큰 공급자를 주입받으며 실제 토큰 저장소는 후속이다.

서명은 hex Signing Key와 원본 바이트로 HMAC-SHA256을 계산하고 base64 `x-signature`와 비교한다. 이 형식에는 시간 유효성 보장이 없으므로 별도 이벤트 식별·중복 방지가 필요하다. 서명된 채널 사용자도 Yeobek 작가 계정에 명시적으로 연결되어야 한다. 문의 본문이나 이메일 문자열만으로 작가를 선택하면 안 된다. 익명·미연결 문의에는 공개 도움말만 사용하고 계정 상태를 노출하지 않는다. 앱 설치·권한·Function 등록·실제 수신과 발신은 아직 검증하지 않았다.

# Alt

[공식 API 안내](https://altalt.io/llms.txt)는 `https://public-api.altalt.io/v1`의 Bearer 인증 읽기 API다. 노트·전사·요약 읽기 권한을 나누며 유료 플랜과 클라우드 동기화가 전제다. 실제 노트를 읽는 키이며 별도 sandbox는 없다. 공식 OpenAPI를 직접 읽고 `/notes/{note_id}/transcript`의 `note_id`, `revision`, `text`, `segments`와 노트 조회의 `id`, `revision`, 상태를 대조했다. 어댑터는 전사 조회 전후의 노트 revision·채널·준비 상태가 같을 때만 본문을 반환한다.

[웹훅](https://altalt.io/en/developers/webhooks)은 본문 자체가 아닌 노트 ID·revision·처리 상태를 알린다. `webhook-id`, `webhook-timestamp`, `webhook-signature`와 원본 바이트로 Standard Webhooks 서명을 확인하고 5분 허용 오차·중복 ID·역순 revision을 처리한다. 먼저 이벤트를 안전하게 저장해 응답하고, 실제 전사 조회·정리는 작업 실행기로 넘긴다. 삭제와 `access_lost` 통지는 저장된 복사본의 접근 중지·후보 무효화에도 연결해야 한다.

구현 판단: 서버 공용 키가 볼 수 있는 모든 노트를 모든 작가가 가져올 수 있게 하지 않는다. 인증된 작가와 미리 연결한 노트/통합 범위를 검사하고 원전사를 비공개 원자료로 보관한다. AI는 정리 후보만 만들며 작가 확인 전 공개 근거로 올리지 않는다.

# 다음 구현 경계

`MailPort`, `SupportPort`, `TranscriptPort`를 제공사 어댑터와 분리한다. 자동화 정책 off/draft/auto, 이벤트 중복 방지, 작업 원장, 발송함·동의·도움말을 먼저 연결한다. 모의 어댑터로 승인/자동 처리·재시도·동의 철회·계정 격리를 검증한 뒤 키 당일 절차를 작성한다. 제공사의 전달 결과나 권한을 확인하지 못한 상태는 완료로 표시하지 않는다.

스티비·채널톡·Alt 어댑터와 서명 검증을 코드로 추가했다. 발신은 내부 자동 재시도가 없고, 네트워크 실패·타임아웃·408/499·미확인 응답은 `unknown`으로 반환한다. 200 접수와 최종 전달은 구분한다. 거래성·홍보성 템플릿 URL 중복도 거부한다. 이는 제공사 경계의 구현이며 DB 승인·수신 동의·계정 연결·HTTP와 실행기 완성을 뜻하지 않는다. 실제 호출은 0회다.
