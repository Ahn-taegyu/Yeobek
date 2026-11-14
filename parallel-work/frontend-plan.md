# 프런트 협업 계획 — 디자인 완료 화면

- 디자인: 작가 흐름 https://www.figma.com/design/IGPBnqMn7cLG2TTeYjXS1z/MAWD-6%ED%8C%80?node-id=176-331 · 관람객 https://www.figma.com/design/IGPBnqMn7cLG2TTeYjXS1z/MAWD-6%ED%8C%80?node-id=165-616
- 기술: Next.js 16.4(App Router, `node_modules/next/dist/docs/` 확인), React 19, Tailwind 4, 서버 API는 `src/app/api/**`, 요청·응답 타입은 `src/lib/contracts/`.
- 현재 프런트: `/`(소개), `/login`, `/artist`(전시 목록) 세 화면뿐이다. 관람 화면은 아직 없다.
- API 사용법은 백엔드 B가 쓰는 `docs/specs/frontend-handoff.md`를 기준으로 한다(15시쯤 초안). 그 전에는 `src/lib/contracts/`와 `docs/specs/api-contract.md`를 본다.

## 역할 나누기

**나 = 작가 화면 + 공통 UI.** 작가 화면은 아직 병합 중인 W10 계약과 사용자 결정(A2·A4·A5·A6)에 많이 묶여 있어서 결정권자가 맡는 게 빠르다.
**보조 작업자 = 관람 화면 + 작은 작가 화면.** 관람 화면은 기존 공개 API(W5)로 지금 바로 시작할 수 있고 폴더가 분리돼 충돌이 없다.

| 화면 | 담당 | 필요한 API | 지금 시작 가능? | 예상 |
| --- | --- | --- | --- | --- |
| 공통: 디자인 토큰, Button·Input·TextArea·Chip·Header(뒤로)·StepIndicator·BottomSheet·Toast, API 호출 훅 | 나 | — | 예 | 1~1.5h |
| 온보딩 1 기본 정보(이름·Email·성별·작가명) | 나 | `/api/admin/profile/onboarding` (W10) | **예** (PR #15 병합됨) | 1h |
| 온보딩 2 활동 이력(5개) · 3 작업 키워드 칩 | 나 | 같은 API, 선택지는 계약에서 가져옴 | 예 | 1h |
| 작가 홈(프로필·개수·탭·포스터 카드) | 나 | `/api/admin/profile`, `/api/admin/exhibitions` | 예 | 1~1.5h |
| 나의 작품 세계(질문 7개) | 나 | 작가 section 저장 (W10) | 예 | 0.5h |
| 전시 등록 1/3 기본 정보(날짜+시간, 질문 3개, 기간 역전 오류) | 나 | `/api/admin/exhibitions`, `.../advance` | 예 | 1.5h |
| 전시 등록 2/3 질문 6개 | 나 | 같은 API | 예 | 0.5h |
| 전시 등록 3/3 자료(전시 파일 업로드, 작품 아코디언·추가·편집, 포스터·작품 이미지) | 나 | `/api/admin/uploads`, `.../artworks`, `.../reorder`, `.../poster`, `/api/admin/artworks/[id]/image` | 예 | 2h |
| AI 답변 미리보기(채팅, 정확해요/수정 필요) | 나 | W11b 미리보기 (A, 19시 이후) | W11b 병합 후 | 1.5h |
| AI 답변 수정(지시문 입력·저장) | 나 | W11b 지시문 수정 | W11b 병합 후 | 1h |
| 관람: 전시 소개(포스터·전시명·작가명·장소·기간) | 보조 | `/api/public/exhibitions/[id]` (+W12 포스터·시간) | **예** | 1h |
| 관람: 채팅 초기(음소거·작품 선택·입력·음성 버튼) | 보조 | `/api/chat`, `/api/speech`, `/api/transcribe` | **예** | 2h |
| 관람: 작품 한 줄 목록·선택 상태(“2. The Swing ▾”) | 보조 | 공개 전시 응답의 작품 목록 | **예** | 1h |
| 관람: 답변(질문 → 작품 이미지 → 글) | 보조 | `/api/chat` + `/api/media/[id]` (W12에서 이미지 참조 추가) | 글 답변은 예, 이미지는 W12 후 | 1h |
| 관람: 전체보기 격자·검색(클라이언트 검색) | 보조 | 공개 전시 응답 | **예** | 1h |
| 관람: 이용 불가 상태(미공개·중지·잘못된 주소, SC-V04) | 보조 | 공개 API 오류 코드 | 예 | 0.5h |
| 이메일 가입·로그인 선택·인증 안내(디자인 없음 → 기존 `/login` 스타일 최소 폼) | 보조 | `/api/auth/login`, `/api/auth/signup`·`verify`·`resend`·`session` (W9, PR #17 병합됨) | **예** | 1.5h |
| 학습 중(작가·전시·작품 이름, 진행 표시) | 보조 | 작품별 작업 조회 `/api/admin/jobs/[id]` | W11b 후(그 전엔 모의) | 1h |
| 자주하는 질문 목록 → 미리보기 이동 | 보조 | W11b 예상 Q&A 목록 | W11b 후 | 1h |

합계: **나 약 11~12시간, 보조 약 12시간**(사람 작업 기준). 18시간 안에 들어가지만 여유가 적다. 아래 드랍 순서를 같이 쓴다.

## 폴더와 브랜치

- 나: `feat/front-artist` — `src/app/artist/**`, `src/components/artist/**`, `src/components/ui/**`, `src/app/globals.css`, `src/app/layout.tsx`
- 보조: `feat/front-visitor` — 관람 경로 `src/app/visit/[exhibitionId]/**`(B의 인계 문서가 다른 공개 주소를 정하면 그쪽을 따름), `src/components/visitor/**`, `src/app/signup/**`, `src/app/login/**`, 학습 중·자주하는 질문은 `src/app/artist/exhibitions/[id]/learning|faq/**`
- 공통 UI가 필요하면 보조는 나에게 요청한다. 급하면 `src/components/visitor/`에 임시로 만들고, 나중에 내가 공통으로 옮긴다.
- 둘 다 `src/lib/contracts/`와 `src/app/api/**`는 고치지 않는다. 필드가 모자라면 백엔드 에이전트에게 요청한다(작가 쪽은 A, 관람·공개·가입은 B).
- 전시 등록 3/3의 파일 업로드 영역 근처에 안내 문구 자리를 둔다. 파일 읽기(A 5번)가 들어가면 "여운 학습시키기" 때 파일도 읽는다고 쓰고, 빠지면 "업로드 파일은 참고 자료로 보관되고, AI는 입력한 답변으로 학습합니다"로 쓴다. W2 자료 정리 후보 확인 화면은 디자인이 없어 이번 범위에서 뺀다.
- PR은 화면 묶음 단위로 작게 올린다. `npm run lint`, `npm run typecheck`를 로컬에서 돌리고 나머지는 CI로 확인한다.

## 진행 순서

1. **14~15시** 내가 토큰·공통 컴포넌트를 먼저 올린다(첫 PR). 그동안 보조는 관람 화면을 모의 데이터로 정적 마크업한다.
2. **15~16시** B의 인계 문서 초안과 시연 데이터가 나오면, 보조는 로컬 시연 전시(`npm run db:seed:demo`)에 관람 화면을 연결한다.
3. **16~19시** 나는 온보딩·홈·작품 세계·전시 등록을 만든다(W10은 이미 병합됨). 보조는 관람 채팅·음성·전체보기를 마치고 가입·로그인을 만든다.
4. **19시 이후** A의 W11b가 병합되면 나는 미리보기·지시문 수정, 보조는 학습 중·자주하는 질문을 붙인다. B의 W12가 병합되면 보조는 포스터·답변 이미지를 붙인다.
5. **마지막** 시연 흐름을 처음부터 끝까지 한 번 돌린다: 가입 → 인증 → 로그인 → 온보딩 → 전시 등록 → 학습 → 미리보기 → (게시는 시연 데이터) → 관람 채팅.

## 프런트 드랍 순서 (모자라면 위에서부터)

1. 전체보기 검색창(격자만 남김)
2. 학습 중 화면 애니메이션(정적 문구 + 진행 개수만)
3. 온보딩 3 작업 키워드 칩(선택 항목이라 건너뛰기만 둠)
4. 프로필 사진 업로드(이니셜 아바타로 대체)
5. 홈 탭별 개수(탭 필터만 남김)
6. 관람 음성 버튼(글 채팅만. 음소거·TTS 재생은 유지)

드랍 금지: 전시 등록 1~3, 관람 소개·채팅·작품 선택, 가입·로그인, 미리보기.

## 완료 조건

**화면 하나가 끝난 기준**
- 해당 Figma 화면의 문구·항목·순서와 같다(다르면 PR에 이유를 적음).
- 실제 로컬 API에 연결돼 있고 모의 데이터가 화면 코드에 없다.
- 불러오는 중·빈 상태·오류(네트워크·401·404·검증 실패)가 화면에 보인다.
- 휴대폰 폭(375px)에서 가로 스크롤 없이 동작하고, 버튼·입력이 키보드로 접근된다.
- `src/lib/contracts/`·`src/app/api/**`를 고치지 않았다.
- PR이 병합됐고 최신 head App CI(lint·typecheck·build)가 성공했다.

**프런트 전체가 끝난 기준**
- 시연 흐름이 끊기지 않는다: 가입 → 이메일 인증 → 직접 로그인 → 온보딩 → 홈 → 전시 등록 1~3 → 학습 중 → 자주하는 질문 → 미리보기·지시문 수정 → (시연 데이터로 게시된 전시) 관람 소개 → 채팅·작품 선택·답변.
- 관람 화면에서 작품 선택만으로 답변·음성 요청이 나가지 않고, 음성 인식문은 확인 후 전송된다(브라우저 네트워크 탭으로 확인).
- 버린 화면·기능은 PR과 `parallel-work/frontend-plan.md`에 적혀 있다.

## 보조 작업자에게 전달할 내용 (AI 도구를 쓴다면 그대로 프롬프트로 사용)

```
Yeobek 저장소에서 관람객 화면과 작은 작가 화면을 만든다. 브랜치는 feat/front-visitor.
먼저 AGENTS.md, docs/collaboration.md, parallel-work/frontend-plan.md를 읽어라.

디자인(관람객): https://www.figma.com/design/IGPBnqMn7cLG2TTeYjXS1z/MAWD-6%ED%8C%80?node-id=165-616
디자인(작가 흐름 중 학습 중·자주하는 질문): https://www.figma.com/design/IGPBnqMn7cLG2TTeYjXS1z/MAWD-6%ED%8C%80?node-id=176-331
Figma에 접근할 수 없으면 docs/specs/screen-spec.md의 SC-V01~V06을 기준으로 하고, 접근하지 못했다고 알려라.

내 범위: frontend-plan.md 표에서 담당이 "보조"인 행. 파일은 src/app/visit/**, src/components/visitor/**,
src/app/signup/**, src/app/login/**, src/app/artist/exhibitions/[id]/learning|faq/**만 만든다.
src/lib/contracts/, src/app/api/**, src/components/ui/**, globals.css, layout.tsx는 고치지 않는다.
필요한 API 사용법은 docs/specs/frontend-handoff.md를 따르고, 없으면 src/lib/contracts/를 읽어라.
Next.js는 node_modules/next/dist/docs/의 버전별 문서를 확인하고 써라.

규칙:
- 관람 화면은 작품을 선택하는 것만으로 답변·음성을 요청하지 않는다. 질문을 보낼 때만 /api/chat을 호출한다.
- 음성 인식 결과는 입력창에 넣고 사용자가 확인한 뒤 보낸다(자동 전송 금지).
- 비공개 파일 경로나 서명 URL을 만들지 않는다. 이미지·음성은 /api/media/[id]만 쓴다.
- 가입 화면은 디자인이 없으니 기존 /login 스타일의 최소 폼으로 만든다. 가입 후 자동 로그인하지 않고
  "이메일 인증 후 로그인" 안내를 보여 준다. 비밀번호는 8자 이상.
- 모의 데이터는 화면 파일 안에 두지 말고 로컬 시연 데이터(npm run db:seed:demo)를 쓴다.
- 시간이 모자라면 frontend-plan.md의 "프런트 드랍 순서"대로 줄이고, 줄인 것을 PR에 적어라.
- 화면 묶음마다 작은 PR. npm run lint와 npm run typecheck를 돌리고 나머지는 CI로 확인한다.
- 화면 하나가 끝난 기준: Figma와 문구·항목이 같다, 실제 API에 연결, 로딩·빈 상태·오류 표시, 375px 폭에서 가로 스크롤 없음,
  contracts·api 미수정, PR 병합과 최신 head CI 성공.
- 전체가 끝난 기준: 시연 데이터로 관람 소개 → 채팅 → 작품 선택 → 답변이 끊기지 않고, 작품 선택만으로 요청이 나가지 않으며,
  가입 → 인증 안내 → 로그인이 동작한다.

- 보고는 화면 묶음마다 3줄: 끝난 화면, 확인한 검사, 막힌 점(필요한 API 필드).
```
