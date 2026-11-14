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

## 구현 및 시연 확인 (2026-11-14)

- [관람·이메일 인증 #21](https://github.com/Ahn-taegyu/Yeobek/pull/21), [작가 홈·전시 작성 #22](https://github.com/Ahn-taegyu/Yeobek/pull/22), [학습·예상 질문·미리보기 #24](https://github.com/Ahn-taegyu/Yeobek/pull/24), [공개 시각 #26](https://github.com/Ahn-taegyu/Yeobek/pull/26). 기존 공개 주소 `/exhibitions/{exhibitionId}`와 `/exhibitions/{exhibitionId}/artworks/{artworkId}`를 사용한다.
- 375px Chrome과 로컬 Auth·DB에서 가입, 메일 인증, 직접 로그인, 온보딩, 전시 등록 3단계, 프로필·포스터·작품 이미지 업로드, 학습, 예상 질문 승인, 미리보기 평가, 수정 초안 저장을 확인했다. 시연 데이터 전시의 관람 소개·작품 선택·채팅과 전사 확인 후 전송을 별도로 확인했다. 작품 선택 직후 `/api/chat`과 `/api/speech` 요청은 없었다. AI 응답과 음성 전사는 로컬 모의 제공사를 사용했다.
- 디자인과 달라진 항목: 사용자 결정에 따라 성별을 수집하지 않고 인증된 이메일을 읽기 전용으로 표시한다. 학습 진행 화면은 간단한 상태와 진행 바로 표시한다. W12가 반환하는 공개 포스터·시각과 답변 이미지는 #26에 연결했다. 기존 공개본은 있는 필드만 표시한다.
- 공식 `npm run db:seed:demo`로 작품 3점의 게시 전시를 만들고, 375px Chrome에서 키보드로 관람 시작, 전체보기 검색, 작품 선택, 글 답변과 공개 작품 이미지 표시를 확인했다.
- 공개 미디어는 W12 `4b77931`과 프런트를 합친 검증 커밋 `65fcf21`에서 375px Chrome과 격리 Supabase로 확인했다. 포스터는 다시 게시한 뒤에 공개됐고 채팅에 작품 이미지가 표시됐다. 작품 선택과 전사 확인 단계에서는 채팅이 자동으로 전송되지 않았다.
- 통합 검증 브랜치의 `1cd3d88`에서 첫 채팅 응답이 브라우저에 도착하지 않는 상황을 재현했다. 같은 질문을 다시 보냈을 때 서버가 저장한 동일 답변을 반환했다. 동등한 수정은 프런트 전용 `f8c66ec`에 있다. 가입·인증 폼의 기본 제출을 POST로 바꾼 `41364b5`는 변경 파일 lint와 diff 검사를 통과했다.
- 병합 전 확인: W12 PR #25의 `6b95af8` App·Knowledge CI는 통과했다. W12 병합으로 공개 미디어 계약이 `main`에 들어간 뒤 프런트 변경만 통합하고, 최신 PR의 App·Knowledge CI와 최종 화면 확인을 마친다.

## 디자인 누락 및 화면 변경 기준

- 화면은 Figma의 문구·구성·진입 순서를 기준으로 한다. 기술 상태, 내부 작업 이름·결과 코드, 승인 절차, API 구현 설명은 화면에 표시하지 않는다. 사용자가 실패를 이해하고 재시도하는 데 필요한 문구만 남긴다.
- 디자인 확인 필요: 예상 질문 인용 검토·근거/답변 승인·철회, 사실 정정 근거 등록·승인, 전시 범위/작품 범위 전환, 비밀번호 복구, 게시/중지. 예상 질문은 목록과 질문별 미리보기로 연결하며 위 조작에 별도 UI를 추가하지 않는다. 근거를 선택하거나 승인하는 화면이 없으므로 지시문 수정은 현재 답변에 이미 승인된 근거가 연결된 경우에 저장할 수 있다.
- 학습 디자인에는 작업 원장의 상태나 코드가 없다. 현재 화면의 ‘여운 학습시키기’ 조작으로만 실제 학습을 시작한다. 진행 표시와 실패 시 재시도를 사용한다.
- 색과 모서리 반경은 프런트 작업 브랜치의 `src/app/theme.css`, 로고 자산은 `src/components/ui/brand.ts`에서 바꾼다. 단계·관람 화면·작품 선택 페이드와 하단 시트 전환은 공통 모션 시간·이징을 사용한다. 기기의 모션 줄이기 설정을 존중한다.
