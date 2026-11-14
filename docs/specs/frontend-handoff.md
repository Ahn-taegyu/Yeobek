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
- id: api-rollout
  resource: /references/user-api-rollout-publication.md
  title: API 적용 수정 계획과 최소 게시 UI 구현 요청
- id: qa-contract
  resource: /specs/api-contract.md
  title: W11 작가 검수 HTTP 계약
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

**기준 main `1bd6734` (#25 병합).** W9·W10·W11·W2·파일 읽기·시연 데이터·W12 계약과 서버 모의 통합을 포함한다. 최종headb8d1daf App43573981012·Knowledge43573981010 성공. 프런트 화면 연결과 운영 활성화는 별도 검증이다.

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
| SC-A03 전시 1~3단계·작업 공간 | GET/POST `/api/admin/exhibitions` `listExhibitions/createExhibition`, GET/PATCH `/api/admin/exhibitions/{id}` `getExhibition/updateExhibition`, POST `.../{id}/advance` `advanceExhibition`, PATCH `.../{id}/poster` `setExhibitionPoster` | `authoring.ts`: `createExhibitionBody`, `updateExhibitionBody`, `advanceExhibitionSchema/Response`; `responses.ts`: `exhibitionResponse` | `state=draft/published/paused`와 `authoringStep=basic/world/artworks` 분리. 진행 실패는 HTTP 200 `advanced:false,blockers`; 게시 전 `getPublicationChecklist` 조회(W12 #25) |
| SC-A04 작품·자료 편집 | GET/POST `/api/admin/exhibitions/{id}/artworks` `listArtworks/createArtwork`; GET/PATCH `/api/admin/artworks/{id}` `getArtwork/updateArtwork`; POST `.../exhibitions/{id}/artworks/reorder` `reorderArtworks`; 업로드·이미지 연결은 아래 절 | `authoring.ts`: `createArtworkBody`, `updateArtworkBody`, `reorderArtworksSchema`; `responses.ts`: `artworkResponse`, `artworkListResponse`; `materials.ts` | 초안 번호와 공개 번호 분리, `DUPLICATE_NUMBER`, `MATERIAL_IN_USE`, `ACTIVE_PUBLICATION`, `UPLOAD_EXPIRED` |
| SC-A05 해설 검수·학습 | POST `/api/admin/artworks/{id}/generations` `generateNarration`, GET `/api/admin/jobs/{id}` `getJob`, POST `.../jobs/{id}/retry` `retryJob`, PATCH `.../artworks/{id}/narration` `saveNarration`; GET `.../artworks/{id}/review` `reviewArtwork`, POST `.../evidence` `upsertEvidence`, POST `.../approvals` `approveArtwork`, POST `.../audio` `generateAudio` | `jobs.ts`: `GenerateNarration`, `RetryJob`, `AnyAiJob`, `saveNarrationSchema`; `publication.ts`: `reviewResponse`, `upsertEvidenceSchema`, `approvalSchema` | 작업 running/succeeded/abstained/failed/cancelled, 생성 성공≠적용/승인. `JOB_ATTEMPT_CONFLICT`, `AI_INVALID_CONTEXT`. followUpQuestions·voiceRequired. W11 검수 계약은 아래 절 |
| SC-A06 게시·중지 | GET `/api/admin/exhibitions/{id}/publication` `getPublicationChecklist`; POST `/api/admin/exhibitions/{id}/publication` `changePublication`; POST `/api/admin/evidence/{id}/impact` `evidenceImpact`, POST `.../revoke` `revokeEvidence` | `publication.ts`: `publicationChecklistResponse`, `publicationSchema`, `publicationResponse`, `evidenceImpactSchema`, `revokeEvidenceSchema`, `revokeImpactResponse` | publish/pause/resume, 철회는 영향 토큰 필요. `voiceRequired` 기본 false(명시 true 설정 호환); 현재 리뷰 `blockingCodes` 제공. 이미지 선택 게시·전시/작품별 차단 사유는 W12 #25; `PUBLICATION_BLOCKED` |
| SC-A07 번호 라벨 | GET `/api/admin/exhibitions/{id}/labels` `listLabels` | `publication.ts`: `labelsResponse` | 공개 주소·번호·제목만. 활성 공개본 없으면 목록 비어 있음. QR 제작 제외 |
| SC-A08 로그인·가입 선택 | GET `/api/auth/session` `getSession` | `signup.ts`: `authSessionResponse` | `authenticated`에 따라 홈/선택 화면. 세션 조회는 signup off에서도 가능 |
| SC-A09 회원가입·코드 확인 | POST `/api/auth/signup` `signup`, POST `/api/auth/resend` `resendSignup`, POST `/api/auth/verify` `verifySignup` | `signup.ts`: `signupSchema`, `resendSignupSchema`, `verifySignupSchema`, `signupPendingResponse`, `signupVerifiedResponse` | 202 verification_required → 200 verified, 항상 authenticated:false. `INVALID_VERIFICATION_CODE`, `SIGNUP_UNAVAILABLE`; signup 기본 off |
| SC-A10 작품 세계 | GET/PATCH `/api/admin/profile` `getProfile/updateProfile`; GET/PATCH `/api/admin/knowledge/{id}` `getKnowledge/updateKnowledge` | `requests.ts`: `profileSchema`, `updateKnowledgeSchema`; `responses.ts`: `accountProfileResponse`, `documentResponse` | `artWorldRegistered`, `sourceWarnings`; `SOURCE_UNAVAILABLE`. section은 `knowledge-sections.ts` 카탈로그 사용 |
| SC-V01 통합 채팅 | POST `/api/chat` `chat`, POST `/api/transcribe` `transcribe`, POST `/api/speech` `speech`, POST `/api/public/exhibitions/{id}/versions/check` `checkVersions` | `visitor.ts`: `visitorChatRequest`, `SavedVisitorReply`, `visitorReplyResponse`, `checkVersionsRequest/Response`; `voice.ts`: `transcribeRequest/Response`, `speechRequest` | answered/clarify/insufficient_evidence, `REQUEST_IN_PROGRESS`, `ANSWER_EXPIRED`; gaps 기본 off. 전시 공통 질문은 exhibitionScopeChat 기본 off, 답변 이미지·제목 선택은 W12 #25 |
| SC-V02 작품 목록·전체보기 | GET `/api/public/exhibitions/{id}` `getPublicExhibition` | `responses.ts`: `publicExhibitionResponse` | `artworks`로 목록/클라이언트 검색. 선택만으로 chat/speech 호출하지 않음 |
| SC-V03 근거 패널 | 채팅 응답 `citations`, `publication`; `checkVersions` | `visitor.ts`: `visitorReplyResponse`, `publicationRefSchema` | 현재 API는 인용 ID만 제공하며 비공개 근거 본문 조회 API는 없음. 임의 관리자 호출 금지. current:false면 이전 답변 사용 중지 |
| SC-V04 이용 불가 | 공개 조회 API의 404, `checkVersions` | `responses.ts`: `apiErrorEnvelope`; `visitor.ts`: `checkVersionsResponse` | 미공개/중지/삭제/잘못된 주소 구분 없이 이용 불가 안내. 네트워크 오류와 구분 |
| SC-V05 전시 소개 | GET `/api/public/exhibitions/{id}` `getPublicExhibition` | `responses.ts`: `publicExhibitionResponse` | 현재 title/artistDisplayName/startDate/endDate/place/artistBio/introduction/theme/artworks. W12 #25는 poster/startTime/endTime 추가 |
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

작품 선택/해제 시 이전 요청을 취소하고 늦은 contextSequence 응답을 무시한다. 선택 자체로 답변·음성을 생성하지 않는다. artworkId:null 질문은 기본 작품 선택 안내이며, W12의 exhibitionScopeChat=true이면 일반 질문에 공통 근거로 답한다. 번호만 입력하는 기존 해설 판별은 유지하고 명시적 소개 요청은 `intent:"narration"`을 사용한다.

STT는 `requestApi("transcribe", {body:{requestId,exhibitionId,file}})`의 multipart 요청이다. `transcript`를 입력창에 넣고 사용자가 확인 후 chat을 보낸다. `overLimit:true`이면 편집을 요구한다. `speech`는 `{requestId,answerId}`로 같은 관람 세션의 저장 답변만 낭독한다. 임의 텍스트 TTS가 아니다. 음소거는 speech 호출·재생을 막으며 기존 inputMode/outputMode 의미를 바꾸지 않는다. `getMedia`는 `{params:{id},query:{kind:"image" 또는 "audio"}}`를 받아 Blob을 반환한다. 생성한 Object URL은 사용 후 해제한다.

# 예상 Q&A·미리보기·지시문 수정 — W11, A 담당

PR #18은 main40564e6에 병합됐다. 배포 환경에서 해당 버전과 플래그 활성화를 확인한다. 전체 경로는 [W11 API 계약](api-contract.md#w11-예상-qa미리보기전시-일괄-생성), 요청·응답 타입은 `contracts/qa.ts`와 `routes.ts`를 따른다. 인증 쿠키와 같은 출처가 필요하고 다른 작가 자료는404다.

`FEATURE_EXPECTED_QA`, `FEATURE_EXHIBITION_QA`, `FEATURE_PREVIEW_CHAT`, `FEATURE_QA_REWRITE`는 기본false다. Expected QA·일괄 생성은 expectedQa, 전시 범위 생성은 추가exhibitionQa, 미리보기는previewChat, 재작성은expectedQa+qaRewrite가 필요하다. 플래그off는404이며 임의로 다른 API로 우회하지 않는다.

| 화면/동작 | requestApi 이름·입력·처리 |
| --- | --- |
| 학습·FAQ 생성 | `generateExpectedQa`: params.id=전시, body={requestId,artworkId,expectedRevision,expectedDocumentRevision}. artworkId:null=전시. 최초201, 같은 요청200; 작품최대3/전시최대5 |
| 진행·재시도 | `getExpectedQaJob`, `retryExpectedQaJob`: params.id=jobId, retry body={requestId,expectedAttempt}. 조회/네트워크 재전송은 AI를 다시 부르지 않음 |
| FAQ 목록 | `listQaItems`: params.id=전시, query.artworkId=작품(생략하면 전시만). 버전 이력이 함께 반환되므로 같은id의 최신version을 기본 목록에 표시 |
| 검수 | `approveQaItem`: expectedVersion/evidencePins, `withdrawQaItem`: expectedVersion. 미승인=draft, 승인=approved, 철회=withdrawn |
| 미리보기 | `previewChat`: 전시params.id와 body={requestId,artworkId,question}. 개별 질문 단위, 이전 대화 자동 전달 안 함. `getPreviewAnswer`로 재조회 |
| 정확/수정필요 | `evaluatePreviewAnswer`: params.id=답변jobId, body={requestId,rating:"accurate" 또는 "needs_revision"}. 횟수 제한을 검수 완료 조건으로 쓰지 않으며 승인/게시가 아님 |
| 사실 정정 | `createQaCorrectionEvidence`: {requestId,targetKind:"preview" 또는 "qa",targetId,targetVersion,sourceLabel,sourceBody}. targetVersion은QA만 버전, preview는null. 결과는draft 근거 |
| 근거 승인 | `approveEvidence`: params.id=근거, body={version}. 후보 citations의 정확한 body/출처에 대응하는 근거를 명시적으로 검수·승인 |
| 재작성 | `rewriteQa`: 정정 대상 필드+instruction+evidencePins. 생성/독립검증 뒤 새draft. `getQaRewrite`와 `retryQaRewrite`로 상태/재시도 |

새 사실은 정정 근거초안→승인→재작성→QA검수 순서다. 단순 말투 변경도 기존 승인근거 pin을 고른다. 원자료 section을 인용한 후보를 승인하려면 citation의 body, sourceDocumentId, sectionId, version으로 기존 `upsertEvidence`/`upsertExhibitionEvidence`에서 문서 근거를 만든 뒤 승인한다. 비공개 원문 전체를 공개 근거로 자동 복사하지 않는다. `gap` 대상은 제외되어400이며 관람 질문을 이 화면의 저장 질문으로 복사하지 않는다.

```ts
const { data: job } = await requestApi("generateExpectedQa", {
  params: { id: exhibition.id },
  body: { requestId: crypto.randomUUID(), artworkId: artwork.id,
    expectedRevision: artwork.revision, expectedDocumentRevision: artwork.document.revision },
});
// job.status: running/succeeded/abstained/failed/cancelled
// succeeded.result: {itemIds, mock}; EVIDENCE_REQUIRED는 자료를 보완하도록 안내
const { data: preview } = await requestApi("previewChat", {
  params: { id: exhibition.id },
  body: { requestId: crypto.randomUUID(), artworkId: artwork.id, question: "파란색을 쓴 이유가 있나요?" },
});
// preview.result: {answer,citations,mock} 또는 null. 평가/재작성에는 preview.id 사용.
```

HTTP200/201도 job.status가failed/abstained일 수 있다. `resultCode`를 확인하고 `EVIDENCE_REQUIRED`는 원자료 보완, `AI_INVALID_CONTEXT`·`REVISION_CONFLICT`는 최신 자료 재조회/새 생성, `REQUEST_TIMEOUT`은 명시적 재시도로 연결한다. HTTP409는 revision/요청ID/attempt 충돌이며 같은입력 재전송에 UUID를 바꾸지 않는다. HTTP429는한도,401은로그인,404는없는자료/권한/비활성,400은입력/근거문제다. 응답본문/질문/파일을 콘솔·분석로그에 남기지 않는다.

## 전시 일괄 학습

이미 구현된 묶음은 유지하며 기본off다. `createTrainingBatch`({requestId,expectedRevision})는 목록만 저장하고 `getTrainingBatch`는 모델을 실행하지 않는다. 프런트는 `runTrainingTarget`에 params={id:batchId,targetId}, body={requestId,expectedAttempt:0}을 한 건씩 보낸다. 재시도는 실제target.attempt를 기준으로 하며 성공 후 같은 요청은재실행하지 않는다. 배치가completed라도 자식실패를 확인한다. 원문 변경409면 최신 전시로 새배치를 만든다. 기본해설 결과의 적용/승인은 기존 원고 화면에서 별도로 한다.

# 자료 정리 후보 — W2, A 담당

PR #13은 main9c6efbf로 병합됐다(최종 head351156f App·Knowledge 성공). 별도 후보 검수 화면은 디자인 범위 밖이며 호출만으로 자동 적용하지 않는다. `contracts/proposals.ts`의 generateProposalSchema/proposalResponse/historyResponse를 사용한다. [W2 API](api-contract.md#w2-작가-자료-정리-후보이력)에 전체 계약이 있다.

1. 문서 GET의 id/revision으로 `generateProposal`(params.id=문서, body={requestId,expectedDocumentRevision})을 호출한다. 같은 요청 재전송은 UUID를 유지한다.
2. `getJob`에서 kind=organize/status/resultCode를 확인하고 succeeded의 result.proposalId로 `getProposal`을 조회한다. before/proposed/changes와 mock을 보여 준다.
3. 사용자가 검토한 뒤 `applyProposal`(body={reviewed:true})을 보낸다. 적용 후 문서를 다시 조회한다. 적용은 승인·게시를 대신하지 않는다.
4. `listDocumentHistory`(params.id=문서, query={limit:"50",beforeRevision:선택})로 원문/출처를 확인한다. 페이지 커서는 nextBeforeRevision이다.

오류:401 로그인,404 대상 없음/다른 작가,400 미검수·잘못된 입력,409 revision 충돌→최신 자료로 새 후보,410 PROPOSAL_EXPIRED→새 후보,429 일일 한도. GET이나 적용 재전송은 모델을 다시 실행하지 않는다. W10 여러 section은 보존하지만 한 생성의 근거는12개/8,000자로 제한되므로 전체 자료 처리 완료로 표시하지 않는다. 적용된 이력은 작업 원장 만료 뒤에도 남고, 만료된 미적용 본문은 정리된다. 이 API는 파일 내용을 추출하는 기능이 아니다.

# 파일 읽기 — A 담당

PR #28 main4f7faee에 병합됐으며 최종 head04facaa App·Knowledge CI가 성공했다. `materialExtraction` 기본off. 업로드 완료 후 학습 버튼의 명시적 POST만 파일을 읽는다. `extractMaterial`·`getMaterialRead`의 정확한 입력과 상태는 [API 계약](api-contract.md#파일-읽기와-w2-후보)을 따른다. 조회 경로의 id는 클라이언트 requestId이며 read.id가 아니다.

- 안내: “학습시키기를 누르면 참고 파일의 글을 읽어 정리 후보를 만듭니다. 스캔 PDF·참고 이미지는 AI 제공사로 전송됩니다. 후보를 확인하고 적용해야 설명 근거로 사용할 수 있습니다.”
- 텍스트 PDF 로컬 추출도 후속 W2 분류는 모델 호출이다. 파일 읽기와 분류는 각각 작가 일일 한도를 사용한다. 후보 문맥12개/8,000자 한도로 전체 도록 반영을 보장하지 않는다.
- running이면 같은 requestId로 상태 조회한다. succeeded+proposalJob이면 기존 W2 getJob/getProposal을 사용한다. 파일 읽기는 완료됐는데 후보 작업이 없다면 같은 POST를 재전송해 복구한다. failed/purged는 자동 재시도하지 않고 수동 입력을 안내한다. EMPTY는 읽을 글이 없는 결과다.
- 모의 결과는 실제 파일 내용이 아니라는 표시를 유지한다. 승인과 게시를 대신하지 않는다. 기존 캐시 조회는 플래그off에도 소유자만 가능하며 off는 새 읽기 실행을 막는다.
- **후보 검수 화면은 이번 프런트 디자인 범위에서 제외돼 있다.** 화면이 없으면 추출 기능을 켠 것만으로 사용자 학습 흐름이 완성되지 않는다. 후보 확인·명시적 적용을 지원하기 전까지 화면의 파일 학습 기능은 숨기고 “업로드 파일은 참고 자료로 보관되고, AI는 입력한 답변으로 학습합니다”로 안내한다. API/개발 시연 검증과 사용자 화면 완성을 구분한다.

# 공개 확장과 시연 데이터 (W12/W7, B 담당)

이미지 없이 게시, 항목별 게시 체크리스트, 공개 포스터·시간, 채팅 작품 이미지, `exhibitionScopeChat`과 승인 Q&A snapshot은 PR #25로 병합됐다. SRC-055에 따라 저장 음성과 Q&A 개수는 게시 필수에서 제외한다. `db:seed:demo` 기반은 #23으로 main0facdbc에 병합됐다. W12 #25에 작품별 모의 승인 Q&A 1개씩을 추가했고 키 당일 점검표와 단일 가입→관람 모의 회귀를 포함했다. 시연 시 FEATURE_EXPECTED_QA=true가 필요하며 기본 제품 플래그는 off를 유지한다. 모의 게시 허용은 개발 시연에 한정하며 운영 게시·재개 금지는 W12 DB 회귀로 확인한다.

## W12 글 우선 게시 계약

최신 사용자 결정(SRC-055, A의 결정 기록)에 따라 저장 음성 사전 준비를 게시 필수에서 제외한다. 서버 기본값과 예제 환경은 voiceRequired=false이며 기존 배포의 명시 true는 유지된다. 이 기본값 변경만으로 이미지 없는 게시·전시 문맥·자동 TTS 화면 연결까지 완료한 것은 아니다. 음성을 켠 관람객의 답변 이후 speech 호출은 프런트 연결과 통합 검증이 필요하다.

W12 공개 시각 계약(PR #25): publicExhibitionResponse에 선택 필드 startTime/endTime(HH:mm 또는 null)을 추가한다. 게시 시점 값을 고정하며 초안 수정은 다음 게시 전까지 반영하지 않는다. 기존 공개본의 시간은 재게시 전 null이다. 포스터도 선택 필드 `poster: {id, kind:"poster"} | null`로 추가한다. id는 공개 publication ID이며 `GET /api/media/{id}?kind=poster`로 읽는다. Storage 경로·서명 URL은 노출하지 않는다. 초안 포스터 변경은 재게시 전 미반영, 삭제·게시 중지·철회·교체 시 이전 참조 전송을 거부한다. 이 계약의 배포 전 PR #25 병합 여부를 확인한다.

W12 채팅 이미지 계약(PR #25): `visitorReplyResponse.image`는 선택 필드 `{id, kind:"image"} | null`이다. 선택된 공개본의 검증된 이미지 참조만 반환하고, 재시도 때도 현재 공개 상태로 다시 조회한다. 이미지 없음·조회 실패·대상 미선택은 null이며 답변과 기존 outputMode 의미를 유지한다. `GET /api/media/{id}?kind=image`로 읽는다.

W12 승인 Q&A 공개 연결(PR #25): 신규 공개본은 schemaVersion 2의 `items`와 `approvedQa`에 승인 버전·해시·근거 pin을 고정한다. draft/철회/운영 모드의 mock 후보는 제외한다. 기존 v1 조회는 유지하며 Q&A는 생성 근거로만 쓰고 기본 해설을 대체하지 않는다. 공개 응답에는 내부 QA 목록을 노출하지 않는다. 생성 후보는 최신 승인 시각·ID 순 최대100개 QA와 기존 근거를 합쳐 검증한 뒤, 전체12개·8,000자 예산으로 선정한다. QA 또는 연결 근거 철회는 해당 공개본과 캐시 답변·음성을 무효화하며 재게시가 필요하다. Q&A 개수는 게시 필수가 아니다.

W12 전시 공통 채팅(PR #25): `FEATURE_EXHIBITION_SCOPE_CHAT`/`exhibitionScopeChat`는 기본 false다. true일 때 작품 미선택의 일반 질문은 게시된 작가·전시 공통 근거만 사용한다. 응답 `publication.artworkId`는 null이고 image도 null이므로 작품을 임의로 선택하지 않는다. publicationId/version은 철회·캐시·음성 검사에 사용하되 작품 선택 ID로 쓰지 않는다. 명확한 작품 번호는 기존 작품 경로로 처리하며 모호한 번호·소개 요청은 선택 안내를 유지한다. 전시 공통 답변의 부족 근거는 특정 작품의 gap으로 기록하지 않는다.

## B 후속: 게시 준비 조회 (PR #25 계약)

SC-A06에서 `getPublicationChecklist` (`GET /api/admin/exhibitions/{id}/publication`, `publicationChecklistResponse`)로 전시 `exhibitionBlockingCodes`와 작품별 `blockingCodes`를 표시한다. 빈 배열이면 해당 조건을 충족한다. 전시명·기간·장소·작품 부재 사유와 기존 승인/근거 사유를 구분한다. 다른 계정은 404이며 POST 게시가 409 `PUBLICATION_BLOCKED`를 반환하면 `fields.exhibition` 또는 `fields[artworkId]`를 표시하고 다시 조회한다. 조회 이후 수정될 수 있으므로 조회 성공만으로 게시 성공을 표시하지 않는다. 배포 전 W12 병합 여부와 프런트 연결 검증을 각각 확인한다.

## B 후속: 작품 지칭과 음성 연결 (PR #25 계약)

질문에 명확한 공개 번호나 공개 작품 제목이 있으면 서버가 해당 작품으로 답한다. `reply.publication.artworkId`를 답변 대상과 상단 선택에 함께 반영하되, `contextSequence`가 현재 요청보다 오래된 응답은 선택을 덮어쓰지 않는다. 번호/제목 충돌·중복 제목·여러 작품 지칭·명시적으로 없는 제목은 `outcome:clarify, publication:null`로 재확인을 요청한다. 제목은 현재 공개본만 대조하며 비공개 초안 제목이나 유사어를 모델 추측으로 선택하지 않는다. 공개 목록에 없는 번호는 같은 공개 전시에서 그 번호로 게시된 적이 있고 작품이 삭제되지 않았으면 고정 문구 `artworkPaused`, 아니면 `artworkUnavailable`로 답한다. 프런트는 서버 문구를 그대로 표시한다([SRC-059](../references/user-visitor-paused-artwork-copy.md)). `image`는 선택된 활성 공개본 참조 또는 null이다.

작품 버튼 선택 자체로 채팅·TTS API를 호출하지 않는다. STT 응답은 입력창에 표시하고 관람객 확인 후 `/api/chat`으로 전송한다. 음성이 켜졌으면 답변의 `answerId`로 `/api/speech`를 호출하고 음소거 시 재생/생성을 중단한다. 글 답변의 `outputMode:text`도 이후 명시적으로 speech를 요청할 수 있다는 기존 계약을 유지한다. 서버의 선택 참조 검증과 프런트 상단 표시·음소거 UI 검증은 구분한다.

게시 체크리스트의 typed client 결과는 `{data, requestId}`이며 내부 목록은 `result.data`에서 읽는다. P0 전시는 artworks 단계/작성 필수 시각까지 검사한다. 개발용 모의 QA 공개본의 운영 전환은 [키 당일 점검표](key-day-checklist.md)의 선중지·전체 재게시 절차를 따른다.

# 승인·게시 최소 UI 추가 인계 (SRC-058)

[최신 요청](../references/user-api-rollout-publication.md)에 따라 별도의 기본 해설 검수에서 생성 결과 저장·근거 승인·해설 승인 후 서버 게시 점검표와 명시적 게시/중지를 연결한다. 질문형 미리보기는 별도 화면을 유지한다. 새 UI는 기존 reviewArtwork/saveNarration/upsertEvidence/approveArtwork/getPublicationChecklist/changePublication 계약을 소비하며 API/DB의 승인 의미를 변경하지 않는다. 이번 최소 UI는 기존 공개 소개의 승인 핀을 유지하며 작가가 명시적으로 항목별 제외할 수 있다. 새 소개 근거를 선택·교체하는 UI는 후속이다. 오래된 소개 때문에 게시가 막히면 해당 소개를 제외하고 다시 게시할 수 있다.

유료 AI·TTS·메일, 운영 배포·스케줄·환경 변수 변경은 이번 수용 범위가 아니다. 파일 읽기는 후보 검수/적용 화면이 준비될 때까지 기본off다. 모의 검증을 실제 API 품질·응답 시간·비용 검증으로 기록하지 않는다.

화면 경로는 `/artist/exhibitions/{id}/review`와 `/artist/exhibitions/{id}/publication`이다. 학습 완료에서 전달한 batch의 성공 해설은 원본 작업 ID와 함께 저장한다. 원고 저장은 별도 승인·게시를 실행하지 않는다. 버전 충돌이나 후속 조회 실패 후에는 최신 상태 확인을 요구하고, 다른 창에서 바뀐 저장 원고와 실제 미저장 수정이 겹치면 비교 후 선택한다. 번호 충돌은 다중 작품의 원자적 게시로 해결될 수 있으므로 최종 판단을 서버에 맡긴다.
