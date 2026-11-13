---
type: Review
id: RES-003
title: Next.js 통합 서버와 무료·행사 호스팅 비교
description: Next.js의 애플리케이션 경계와 배포 제공사의 제한을 구분하고 Render·Netlify·Cloudflare·Railway·VM을 검토한다.
status: draft
updated: '2026-11-13'
tags: [mawd, hosting, research]
rag_include: true
generated:
  by: codex/gpt-6
  at: '2026-11-12T06:02:54+00:00'
sources:
- id: current-stack
  resource: /research/recommended-stack.md
  title: Render 제외 후 최신 스택·모델 권고
- id: request
  resource: /references/user-stack-review.md
  title: 사용자 호스팅 조사 요청
- id: next
  resource: https://nextjs.org/docs/app/guides/backend-for-frontend
  title: Next.js Backend for Frontend
- id: event
  resource: https://luma.com/ml5gw54p
  title: MAWD 파트너 안내
- id: render
  resource: https://render.com/docs/free
  title: Render 무료 조건
- id: netlify
  resource: https://docs.netlify.com/manage/accounts-and-billing/billing/billing-for-credit-based-plans/credit-based-pricing-plans/
  title: Netlify 크레딧 요금
- id: cloudflare
  resource: https://developers.cloudflare.com/workers/platform/limits/
  title: Workers 제한
decision_status: proposed
---

# 판단

**11/13 갱신:** 사용자 안내로 Render는 행사 제공 후보에서 제외했다. 현재 추천은 [RES-004](recommended-stack.md)다. 아래 일반 서비스 비교는 유지하되 11/12 파트너 등재를 최신 지원 정보로 해석하지 않는다. 무료 Netlify의 함수 기본 리전은 미국이며 리전 변경은 Pro/Enterprise 조건이라는 점도 현재 권고에 반영했다.

**Next.js 통합 개발은 이번 인력·일정에 적합하다.** 작가 입력/권한·게시·작품 조회·AI API 호출 정도는 같은 TypeScript 앱의 Route Handlers로 충분히 설계할 수 있다. Next.js를 쓴다고 Vercel만 써야 하는 것은 아니다. 장시간 OCR·대량 음성 생성은 나중에 별도 worker로 분리한다.

Next.js 공식 가이드는 Backend for Frontend 기능이 완전한 백엔드 대체는 아니라고 설명한다. 무엇을 같은 앱에서 처리할지 정하는 것이 핵심이다. [공식 가이드](https://nextjs.org/docs/app/guides/backend-for-frontend)

# 통합의 단점과 대응

| 문제 | 이 제품에서 나타나는 경우 | 초기 대응 |
| --- | --- | --- |
| 화면과 서버 배포가 묶임 | UI 변경이 게시/API 경로에도 영향을 줌 | 게시·권한·채팅 핵심 흐름을 배포 때 확인. 서비스 로직을 React 컴포넌트 밖에 둠 |
| 요청 중 오래 걸리는 일 | 큰 PDF OCR, 여러 작품 임베딩/음성 일괄 생성 | 요청은 접수/상태 반환. 장기 작업은 worker 단계로 분리. 이번 MVP에서는 수동 발췌 |
| 저장 상태를 프로세스에 의존 | 서버 재시작/여러 인스턴스에서 대화·중복 방지 상태 유실 | 영구 상태와 요청 ID는 DB, 채팅 화면 기록은 명세대로 브라우저에 |
| 대용량 파일 경유 | PDF/원본을 Next 서버로 받아 다시 저장하거나 모든 미디어를 프록시 | 직접 Storage 업로드. 관람 전달 경로는 공개 중지 계약과 CDN 비용을 함께 설계 |
| 권한·캐시 결합 오류 | 미승인 설명 또는 오래된 공개 버전이 캐시에 남음 | 사용자/작품/공개 버전 검사, 승인본 버전별 저장. 비공개 응답의 공용 캐시 금지 |
| 다른 클라이언트 확장 | 모바일 앱에서 Server Actions에만 의존한 기능을 재사용하기 어려움 | 공유 서버 함수 + 명시적 Route Handler 계약을 사용 |
| 자원 경쟁 | 작은 자체 VM에서 Next 빌드·이미지 처리와 DB가 동시에 실행 | 빌드는 배포 단계에서, 파일 처리는 분리. 메모리/연결 수 관찰 |

단일 프로젝트 내부에서 `lib/domain`, `lib/data`, `lib/ai` 정도의 경계를 유지하면 충분하다. 시작부터 별도 API 서비스·마이크로서비스·큐 플랫폼을 구축하지 않는다. 외부 DB 연결은 풀/제공사 연결 방식에 맞추고 인스턴스마다 무제한 연결을 만들지 않는다.

# Vercel의 제약과 Next.js의 제약을 구분

- Vercel Function의 요청 본문과 **버퍼링한 응답** 제한은 4.5MB다. 현재 문서는 스트리밍 응답 예외를 안내한다. 이것을 Next.js 전체의 파일 상한으로 말하면 부정확하다. 원본 직접 업로드는 여전히 권고한다. [Function 제한](https://vercel.com/docs/functions/limitations)
- 현재 Vercel은 **모든 플랜에서 WebSocket을 지원**한다. “Vercel은 WebSocket 서버가 불가능”이라는 과거 정보로 제외하지 않는다. 연결은 Function 최대 실행 시간의 영향을 받으므로 재연결·상태 복구가 필요하다. [WebSockets](https://vercel.com/docs/functions/websockets)
- Live 음성은 브라우저가 제공사와 직접 연결하고 앱 서버는 단기 자격증명·도구 권한을 처리하는 설계도 가능하다. Next 서버가 모든 음성 패킷을 중계해야 하는 것은 아니다.
- Vercel Hobby는 개인·비상업 용도다. 유료 도슨트 SaaS의 운영까지 무료 플랜으로 가정하지 않는다. 이번 행사 시연의 조건과 상업 운영 전환을 따로 확인한다. [Hobby 조건](https://vercel.com/docs/plans/hobby)

# 무료 또는 행사 제공 후보

| 옵션 | 확인한 조건 | 이 프로젝트에 대한 판단 |
| --- | --- | --- |
| **Render** | 11/13 사용자 안내로 행사 제공 후보 제외. 일반 Free Web은 15분 무활동 뒤 휴면, 다시 켜는 데 약 1분. workspace 월 750 instance hours | 이번 행사 지원을 전제로 선정하지 않음 |
| **Netlify Free** | Next App Router/SSR/Route Handlers 지원. 월 300크레딧 hard limit, production 배포 1회 15크레딧 | Vercel 외의 관리형 무료 후보. 개발 중 매번 production 배포하면 잔량을 빨리 소모하므로 미리보기와 사용량 관리 |
| **Cloudflare Workers Free** | 일 10만 요청, 요청당 CPU 10ms, 메모리 128MB. 현재 Next 가이드는 vinext 권고 | 간단 API/파일 전달에 강점. 기존 Next 코드의 호환성·런타임 차이를 먼저 검증해야 해 이번 일정의 첫 선택은 아님 |
| **Railway** | 신규 trial $5/30일, 이후 Free 월 $1 크레딧 | Node/Docker 배포 후보지만 계속 무료로 운영할 넉넉한 서버 예산으로 보지 않음 |
| **무료 VM + Node/Docker** | OCI/GCP 등의 자원·리전·할당 조건, 직접 운영 | Next와 PostgreSQL까지 배치 가능. VM/백업/HTTPS/보안 운영을 맡을 수 있을 때 |

근거: [행사 파트너](https://luma.com/ml5gw54p), [Render Free](https://render.com/docs/free), [Netlify Next 지원](https://docs.netlify.com/build/frameworks/framework-setup-guides/nextjs/overview/), [Netlify 요금](https://docs.netlify.com/manage/accounts-and-billing/billing/billing-for-credit-based-plans/credit-based-pricing-plans/), [Workers 제한](https://developers.cloudflare.com/workers/platform/limits/), [Workers Next 배포](https://developers.cloudflare.com/workers/framework-guides/web-apps/nextjs/), [Railway trial](https://docs.railway.com/pricing/free-trial). VM 상세는 [Postgres 비교](storage-and-postgres.md)를 따른다.

Netlify의 300크레딧은 빌드 횟수만의 한도가 아니다. 대역폭 1GB당 20크레딧 등 사용량이 함께 차감된다. Free가 상업 프로젝트를 허용한다는 안내는 있으나 팀의 private Git 저장소/기여자 연결 조건은 계정 구성 때 확인한다. 현재 공개 사이트의 무료 플랜 표시 조건도 확인한다. [공식 Free 안내](https://www.netlify.com/blog/introducing-netlify-free-plan/), [현재 표시 정책](https://www.netlify.com/changelog/2026-08-19-pre-launch-toolbar-and-powered-by-netlify-badge/). 과거 글의 오래된 무료 대역폭 숫자는 현재 요금으로 사용하지 않는다.

Workers의 10ms는 네트워크 응답을 기다리는 전체 시간이 아니라 **실제 CPU 사용 시간**이다. LLM 응답이 3초 걸린다는 이유만으로 이 한도를 넘는 것은 아니지만 SSR·파싱·이미지 처리 부담은 따져야 한다. Cloudflare Pages의 정적 export만으로 Next 서버 기능까지 배포할 수는 없다. 새로운 vinext 경로와 기존 OpenNext 호환 경로를 구분한다.

# 대회에서 제공되는 것의 확인 범위

11/12 공식 모집 페이지의 Render 등재는 과거 조회 이력이다. **11/13 [사용자 안내](../references/user-render-excluded.md)로 Render 제외를 반영했다.** 지원 확인을 기다리는 작업도 제거한다. 외부 메시지는 보내지 않았다.

사용자가 전달한 AI API 크레딧과 일반 호스팅 크레딧은 다르다. Render에 배포하는 것만으로 “제공 API 한 개 이상 핵심 사용” 요건을 충족한다고 가정하지 않는다. Liner 핵심 호출 계획은 유지한다. 행사 Liner Notion 가이드는 이번 재조회에서 404로 본문을 확인하지 못했으므로 공개 API 문서와 실제 행사 키 검증을 구분한다.

# 권고 순서

1. **지금 개발:** Next.js Node 앱 + 관리형 Supabase DB/Auth, 파일 직접 업로드. 핵심 기능을 호스팅 전용 API에 묶지 않는다.
2. **배포 후보:** Render 제외 이후 Vercel을 우선 권고한다. 유료/무료 조건과 AI 역할 배분은 [현재 추천](recommended-stack.md)에 따른다.
3. **무료 대안:** Netlify에서 최소 Route Handler·녹음 업로드·SSR을 먼저 배포해 호환성과 크레딧을 확인한다. 기존 Vercel 경로도 실제 사용 조건에 맞으면 유지 가능하다.
4. **자체 서버:** 이미 준비한 무료 VM이 있고 복원/권한/배포를 확인할 수 있다면 별도 대안. 새 인프라 운영을 추가하면서 기능 일정도 그대로 지킬 수 있다고 가정하지 않는다.

호스팅을 바꿔도 LLM·STT·TTS·DB·파일 저장/전송 비용은 별도로 남는다. 이번 문서는 비용·기능의 공식 조건 조사이며 실제 계정 생성, 무료 크레딧 수령, 배포 성공, 한국 리전 지연을 검증한 보고서가 아니다.
