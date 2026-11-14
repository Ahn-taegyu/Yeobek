---
type: Specification
id: SPEC-017
title: 프런트엔드 API 인계
description: 병합된 서버 계약에 대응하는 화면별 API·상태·오류·플래그와 미구현 경계.
status: draft
updated: '2026-11-14'
tags: [yeobek, frontend, api, handoff]
rag_include: true
generated:
  by: codex/gpt-6
  at: '2026-11-14T15:00:00+09:00'
sources:
- id: screens
  resource: /specs/screen-spec.md
  title: 화면 명세
- id: api
  resource: /specs/api-contract.md
  title: API 계약
- id: review
  resource: /references/user-v3-review-decisions.md
  title: 해설 수정·검수·모의 게시 결정
- id: signup
  resource: /references/user-signup-security.md
  title: 이메일 인증·비밀번호 정책
---

# 기준과 공개 주소

**기준 main `de06460` (W9 #17·W10 #15 병합).** 화면 구현·운영 활성화와 API 병합은 별개다. W11 예상 Q&A·미리보기·재작성, W12 공개 확장은 아래 예정 절에서 구분한다. 이후 병합 시 담당자가 해당 절과 기준 SHA를 갱신한다.

공개 주소는 기존 `listLabels` RPC/HTTP가 반환하는 **`/exhibitions/{exhibitionId}`**, 작품 주소는 **`/exhibitions/{exhibitionId}/artworks/{artworkId}`**를 유지한다. `/visit/{exhibitionId}`는 화면 구현 후보였으며 기존 공개 주소를 바꾸는 서버 계약이 아니다. 프런트가 `/visit` 아래에 화면을 만들면 기존 `/exhibitions` 주소에서 동일 화면으로 연결하는 경로를 제공한다. 서버 API 주소는 `/api/public/exhibitions/{id}`다. QR 제작은 이번 범위 밖이며 라벨 API는 유지한다.

계약 원천: `src/lib/contracts/routes.ts`, 각 Zod 스키마, `src/lib/client/index.ts`. 아래 스키마 이름으로 `z.input<typeof schema>`(요청), `z.output<typeof schema>`(응답)를 얻거나 `requestApi` 추론을 사용한다. 임의로 HTTP 타입을 복제하지 않는다.

# 공통 호출·오류·플래그

```ts
import { requestApi, ApiClientError } from "@/lib/client";
const { data: exhibition } = await requestApi("getPublicExhibition", {
  params: { id: exhibitionId },
});
// exhibition.artworks: 현재 공개 작품만. image/audio는 null 또는 생략될 수 있음.
```

JSON 성공은 `{data, requestId}`, 실패는 `{error:{code,message,retryable,fields?,retryAfter?},requestId}`다. `speech`·`getMedia` 성공은 Blob이다. 같은 출처 쿠키, `no-store`, 오류 파싱은 클라이언트가 처리한다. `ApiClientError.status === null`인 `NETWORK_ERROR`, 응답 계약 불일치 `INVALID_RESPONSE`도 표시한다. 쓰기는 같은 출처에서 호출하며 서비스 키를 브라우저에 넣지 않는다.

| 공통 오류 | 화면 처리 |
| --- | --- |
| 400 `INVALID_INPUT` | `fields`의 필드별 안내, 현재 입력 보존 |
| 401 `UNAUTHENTICATED` / 로그인 `INVALID_CREDENTIALS` | 로그인 유도 / 자격 정보 안내. 임의 외부 URL로 복귀하지 않음 |
| 403 `FORBIDDEN` | 요청 출처·권한 확인, 자동 반복 금지 |
| 404 `NOT_FOUND` | 타인/미공개/중지/플래그 off를 구분해 추측하지 않음 |
| 409 `REVISION_CONFLICT`, `SOURCE_REVISION_CONFLICT` | 최신 값 재조회 후 사용자 변경 병합. 오래된 revision으로 반복 저장 금지 |
| 409 `DUPLICATE_NUMBER`, `REQUEST_ID_CONFLICT` | 번호 수정 / 같은 ID의 원래 결과 확인 |
| 429 `AUTHOR_JOB_LIMIT`, `AUTHOR_UPLOAD_LIMIT`, `VISITOR_REQUEST_LIMIT`, `RATE_LIMITED` | `retryAfter`가 있으면 대기. 관람 한도 후에도 공개 승인 해설·저장 음성 사용 가능 |
| 503 `SERVER_CONFIGURATION_ERROR`, `SERVICE_UNAVAILABLE` | 설정/서비스 안내. `retryable` 기준으로 재시도 |

서버 플래그는 현재 `signup=false`, `gaps=false`, `opsAggregation=false`, `voiceRequired=false`, `followUpQuestions=true`가 기본이다. 브라우저가 요청 본문으로 덮어쓸 수 없고 공개 플래그 조회 API도 없다. 배포 설정과 인계 기준을 맞춘다. 모의 모드는 개발/test 서버의 `AI_PROVIDER_MODE=mock`에서만 허용되며 `mock:true`는 실물 품질 검증을 뜻하지 않는다. 인증·CRUD는 모의 데이터가 아니라 실제 로컬 Auth/DB를 쓴다.

# 화면별 연결표

경로의 `{id}`는 해당 행의 전시/작품/문서 ID다. 모든 행에 위 공통 오류를 적용하며 아래는 추가 계약이다. 별도 표시가 없으면 기능 플래그가 없고, AI 작업 외 CRUD·조회는 모의 모드에서도 같은 DB 계약이다.

| 화면 | 호출 API / 클라이언트 키 | 요청·응답 스키마 (`src/lib/contracts/`) | 상태·오류·플래그 |
| --- | --- | --- | --- |
| SC-A01 로그인 | POST `/api/auth/login` `login`, POST `/api/auth/logout` `logout` | `requests.ts`: `loginSchema`, `emptySchema`; `{authenticated:true/false}` | 성공 후 홈, 로그아웃 후 선택 화면. `INVALID_CREDENTIALS`, `RATE_LIMITED`. signup off와 무관 |
| SC-A02 홈·온보딩 | GET `/api/admin/profile` `getProfile`, PATCH `/api/admin/profile/onboarding` `updateOnboarding`, PATCH `/api/admin/profile/avatar` `setArtistAvatar`, GET `/api/admin/exhibitions` `listExhibitions` | `responses.ts`: `accountProfileResponse`, `profileResponse`, `exhibitionListResponse`; `onboarding.ts`: `updateOnboardingSchema`, `setOnboardingMediaSchema` | `onboardingComplete`, `dashboardStatus=preparing/ongoing/ended`, `counts`; 미공개는 종료일이 지나도 preparing |
| SC-A03 전시 1~3단계·작업 공간 | GET/POST `/api/admin/exhibitions` `listExhibitions/createExhibition`, GET/PATCH `/api/admin/exhibitions/{id}` `getExhibition/updateExhibition`, POST `.../{id}/advance` `advanceExhibition`, PATCH `.../{id}/poster` `setExhibitionPoster` | `authoring.ts`: `createExhibitionBody`, `updateExhibitionBody`, `advanceExhibitionSchema/Response`; `responses.ts`: `exhibitionResponse` | `state=draft/published/paused`와 `authoringStep=basic/world/artworks` 분리. 진행 실패는 HTTP 200 `advanced:false,blockers`; W12 게시 체크리스트는 예정 |
| SC-A04 작품·자료 편집 | GET/POST `/api/admin/exhibitions/{id}/artworks` `listArtworks/createArtwork`; GET/PATCH `/api/admin/artworks/{id}` `getArtwork/updateArtwork`; POST `.../exhibitions/{id}/artworks/reorder` `reorderArtworks`; 업로드·이미지 연결은 아래 절 | `authoring.ts`: `createArtworkBody`, `updateArtworkBody`, `reorderArtworksSchema`; `responses.ts`: `artworkResponse`, `artworkListResponse`; `materials.ts` | 초안 번호와 공개 번호 분리, `DUPLICATE_NUMBER`, `MATERIAL_IN_USE`, `ACTIVE_PUBLICATION`, `UPLOAD_EXPIRED` |
| SC-A05 해설 검수·학습 | POST `/api/admin/artworks/{id}/generations` `generateNarration`, GET `/api/admin/jobs/{id}` `getJob`, POST `.../jobs/{id}/retry` `retryJob`, PATCH `.../artworks/{id}/narration` `saveNarration`; GET `.../artworks/{id}/review` `reviewArtwork`, POST `.../evidence` `upsertEvidence`, POST `.../approvals` `approveArtwork`, POST `.../audio` `generateAudio` | `jobs.ts`: `GenerateNarration`, `RetryJob`, `AnyAiJob`, `saveNarrationSchema`; `publication.ts`: `reviewResponse`, `upsertEvidenceSchema`, `approvalSchema` | 작업 running/succeeded/abstained/failed/cancelled, 생성 성공≠적용/승인. `JOB_ATTEMPT_CONFLICT`, `AI_INVALID_CONTEXT`. followUpQuestions·voiceRequired. W11은 예정 |
| SC-A06 게시·중지 | POST `/api/admin/exhibitions/{id}/publication` `changePublication`; POST `/api/admin/evidence/{id}/impact` `evidenceImpact`, POST `.../revoke` `revokeEvidence` | `publication.ts`: `publicationSchema`, `publicationResponse`, `evidenceImpactSchema`, `revokeEvidenceSchema`, `revokeImpactResponse` | publish/pause/resume, 철회는 영향 토큰 필요. `voiceRequired` 기본 false(명시 true 설정 호환); 현재 리뷰 `blockingCodes` 제공. 이미지 선택 게시·W12 체크리스트는 예정 |
| SC-A07 번호 라벨 | GET `/api/admin/exhibitions/{id}/labels` `listLabels` | `publication.ts`: `labelsResponse` | 공개 주소·번호·제목만. 활성 공개본 없으면 목록 비어 있음. QR 제작 제외 |
| SC-A08 로그인·가입 선택 | GET `/api/auth/session` `getSession` | `signup.ts`: `authSessionResponse` | `authenticated`에 따라 홈/선택 화면. 세션 조회는 signup off에서도 가능 |
| SC-A09 회원가입·코드 확인 | POST `/api/auth/signup` `signup`, POST `/api/auth/resend` `resendSignup`, POST `/api/auth/verify` `verifySignup` | `signup.ts`: `signupSchema`, `resendSignupSchema`, `verifySignupSchema`, `signupPendingResponse`, `signupVerifiedResponse` | 202 verification_required → 200 verified, 항상 authenticated:false. `INVALID_VERIFICATION_CODE`, `SIGNUP_UNAVAILABLE`; signup 기본 off |
| SC-A10 작품 세계 | GET/PATCH `/api/admin/profile` `getProfile/updateProfile`; GET/PATCH `/api/admin/knowledge/{id}` `getKnowledge/updateKnowledge` | `requests.ts`: `profileSchema`, `updateKnowledgeSchema`; `responses.ts`: `accountProfileResponse`, `documentResponse` | `artWorldRegistered`, `sourceWarnings`; `SOURCE_UNAVAILABLE`. section은 `knowledge-sections.ts` 카탈로그 사용 |
| SC-V01 통합 채팅 | POST `/api/chat` `chat`, POST `/api/transcribe` `transcribe`, POST `/api/speech` `speech`, POST `/api/public/exhibitions/{id}/versions/check` `checkVersions` | `visitor.ts`: `visitorChatRequest`, `SavedVisitorReply`, `visitorReplyResponse`, `checkVersionsRequest/Response`; `voice.ts`: `transcribeRequest/Response`, `speechRequest` | answered/clarify/insufficient_evidence, `REQUEST_IN_PROGRESS`, `ANSWER_EXPIRED`; gaps 기본 off. 전시 공통 질문·답변 이미지 W12 예정 |
| SC-V02 작품 목록·전체보기 | GET `/api/public/exhibitions/{id}` `getPublicExhibition` | `responses.ts`: `publicExhibitionResponse` | `artworks`로 목록/클라이언트 검색. 선택만으로 chat/speech 호출하지 않음 |
| SC-V03 근거 패널 | 채팅 응답 `citations`, `publication`; `checkVersions` | `visitor.ts`: `visitorReplyResponse`, `publicationRefSchema` | 현재 API는 인용 ID만 제공하며 비공개 근거 본문 조회 API는 없음. 임의 관리자 호출 금지. current:false면 이전 답변 사용 중지 |
| SC-V04 이용 불가 | 공개 조회 API의 404, `checkVersions` | `responses.ts`: `apiErrorEnvelope`; `visitor.ts`: `checkVersionsResponse` | 미공개/중지/삭제/잘못된 주소 구분 없이 이용 불가 안내. 네트워크 오류와 구분 |
| SC-V05 전시 소개 | GET `/api/public/exhibitions/{id}` `getPublicExhibition` | `responses.ts`: `publicExhibitionResponse` | 현재 title/artistDisplayName/startDate/endDate/place/artistBio/introduction/theme/artworks. 포스터·시각은 W12 예정 |
| SC-V06 작품 정보 | GET `/api/public/exhibitions/{id}/artworks/{artworkId}` `getPublicArtwork`, GET `/api/media/{id}?kind=image` `getMedia` | `responses.ts`: `publicArtworkResponse`; `media.ts`: `publicMediaReference`, `mediaQuery` | 승인 narrationText, 공개 image/audio 참조. 파일 없음은 null/생략; 404면 현재 공개본 다시 조회 |

# 작가 저장·파일·가입 예시

부분 입력은 `draft:true`를 사용한다. PATCH의 `sections/sourceRefs`는 전체 교체이며, 생략/null 필드도 기존 값을 보존하는 부분 패치라고 가정하지 않는다. `expectedRevision`과 `expectedDocumentRevision`은 마지막 조회 응답의 값을 보낸다. section ID·선택지·최대 길이는 `knowledge-sections.ts`, 키워드는 `onboarding.ts`에서 읽는다. 온보딩은 Auth 이메일을 사용하고 성별 입력 필드는 없다. 활동 이력은 작가 문서 section으로 저장한다.

```ts
const { data: draft } = await requestApi("createExhibition", { body: {
  id: crypto.randomUUID(), draft: true, title: null,
  sections: [], sourceRefs: [],
} });
const { data: progress } = await requestApi("advanceExhibition", {
  params: { id: draft.id }, body: { expectedRevision: draft.revision, step: "world" },
});
// 필수 기본 정보가 없으면 HTTP 200, progress.advanced=false, blockers에 code/field.
```

파일은 `requestUpload`(POST `/api/admin/uploads`) → 응답의 staging 서명 URL로 업로드 → `completeUpload`(POST `/api/admin/uploads/{id}/complete`, expectedVersion) → ready 확인 → `setArtworkImage`(POST `/api/admin/artworks/{id}/image`) 또는 `setExhibitionPoster`로 연결한다. `materials.ts`의 `requestUploadSchema/uploadResponse/materialResponse`를 사용한다. 이미지 3MiB, PDF 6MiB이며 준비 중 파일은 연결하지 않는다. 비공개 원본은 `getMaterial`의 한시 URL로 소유자만 열고, 공개 화면은 `getMedia`만 사용한다. 파일 내용을 AI가 읽는 기능은 예정이며 업로드 성공으로 학습 완료를 표시하지 않는다.

```ts
const signupRequestId = crypto.randomUUID(); // 확인/재발송까지 보존
const { data: pending } = await requestApi("signup", { body: {
  requestId: signupRequestId, email, password, passwordConfirmation,
} }); // HTTP 202: {status:"verification_required",authenticated:false}
const { data: verified } = await requestApi("verifySignup", { body: {
  requestId: crypto.randomUUID(), signupRequestId, email, code,
} }); // HTTP 200: {status:"verified",authenticated:false}; /login에서 직접 로그인
```

가입 비밀번호는 8자 이상·UTF-8 72바이트 이하, 코드는 숫자 6자리다. 재발송도 새 requestId와 최초 signupRequestId·email을 보낸다. 같은 요청의 네트워크 재전송은 같은 requestId를 유지한다. 코드·비밀번호를 URL/로그에 남기지 않는다. 최초 가입 ID를 잃은 미인증 계정 복구·비밀번호 재설정은 미구현이다.

# 관람 채팅·음성 예시

```ts
const { data: reply } = await requestApi("chat", { body: {
  requestId: crypto.randomUUID(), exhibitionId, artworkId: selectedArtworkId,
  question: "이 작품의 색에는 어떤 의미가 있나요?", intent: "question",
  contextSequence: selectionVersion, inputMode: "text", outputMode: "text",
} });
// reply: answerId/requestId/contextSequence/inputMode/outputMode/answer/citations/
// outcome/publication/source/mock. requestId는 재시도에 재사용, 문맥 변경 시 sequence 증가.
```

작품 선택/해제 시 이전 요청을 취소하고 늦은 contextSequence 응답을 무시한다. 선택 자체로 답변·음성을 생성하지 않는다. 기존 main에서 artworkId:null 질문은 작품 선택 안내이며 전시 문맥 답변은 W12 예정이다. 번호만 입력하는 기존 해설 판별은 유지하고 명시적 소개 요청은 `intent:"narration"`을 사용한다.

STT는 `requestApi("transcribe", {body:{requestId,exhibitionId,file}})`의 multipart 요청이다. `transcript`를 입력창에 넣고 사용자가 확인 후 chat을 보낸다. `overLimit:true`이면 편집을 요구한다. `speech`는 `{requestId,answerId}`로 같은 관람 세션의 저장 답변만 낭독한다. 임의 텍스트 TTS가 아니다. 음소거는 speech 호출·재생을 막으며 기존 inputMode/outputMode 의미를 바꾸지 않는다. `getMedia`는 `{params:{id},query:{kind:"image" 또는 "audio"}}`를 받아 Blob을 반환한다. 생성한 Object URL은 사용 후 해제한다.

# 예상 Q&A·미리보기·지시문 수정 — 예정(W11, A 담당)

main `de06460`에는 이 API·플래그가 없다. A의 W11 PR 병합 뒤 실제 경로·스키마·오류·기능 플래그를 이 절에 추가한다. 기본 작품 소개의 직접 편집과 Q&A 지시문 재작성은 구분하고 생성·평가를 승인/게시로 표시하지 않는다. 학습 진행·Q&A 목록도 임의 경로를 만들지 않는다.

# 파일 읽기 — 예정(A 담당)

현재 업로드는 원본 보관·명시적 근거 연결이며 텍스트 추출/이미지 읽기 완료가 아니다. A가 병합 여부·플래그·이용 안내·후보 적용 계약을 이 절에 인계한다.

# 공개 확장과 시연 데이터 — 예정(W12/W7, B 담당)

이미지 없이 게시, 항목별 게시 체크리스트, 공개 포스터·시간, 채팅의 작품 이미지 참조, `exhibitionScopeChat`과 승인 Q&A snapshot은 후속이다. 기존 `voiceRequired`·음성/필수 Q&A 정책을 임의로 바꾸지 않는다. `db:seed:demo`와 키 당일 체크리스트는 아직 작성 전이다. 모의 게시 허용은 개발 시연에 한정하며 운영 게시 금지는 W12에서 회귀 검사로 확인한다.

## W12 글 우선 게시 변경 진행

최신 사용자 결정(SRC-055, A의 결정 기록)에 따라 저장 음성 사전 준비를 게시 필수에서 제외한다. 서버 기본값과 예제 환경은 voiceRequired=false이며 기존 배포의 명시 true는 유지된다. 이 기본값 변경만으로 이미지 없는 게시·전시 문맥·자동 TTS 화면 연결까지 완료한 것은 아니다. 음성을 켠 관람객의 답변 이후 speech 호출은 프런트 연결과 통합 검증이 필요하다.

W12 공개 시각 계약(구현 중): publicExhibitionResponse에 선택 필드 startTime/endTime(HH:mm 또는 null)을 추가한다. 게시 시점 값을 고정하며 초안 수정은 다음 게시 전까지 반영하지 않는다. 기존 공개본의 시간은 재게시 전 null이다. 포스터 공개 연결은 아직 후속이다.
