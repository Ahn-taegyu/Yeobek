---
type: Reference
id: SRC-029
title: AI 하네스 수정·발전 계획 요청 원문
description: 하네스 플레이북 후속 작업에 관한 사용자 원문 보존.
status: stable
updated: '2026-11-13'
tags: [yeobek, ai, harness, playbook]
rag_include: false
generated:
  by: codex/gpt-6
  at: '2026-11-13T20:29:20+09:00'
sources: []
---

# 사용자 요청 원문

아래는 전달받은 원문이며 실행 당시 기준은 후속 검토에서 확인한다.

````text
# AI 하네스 수정·발전 계획 (PR #2 후속)

## Context

PR #2(`feat/ai-runtime-harness`, `e3c05f0`)는 제공사 어댑터, 관람 답변 하네스, 해설 후보 평가, 작가 자료 정리, 지침·스킬 묶음(플러그인)을 추가했다. 검토에서 확인한 문제는 세 묶음이다.

1. **기획과 다르게 동작** (임시 테스트로 재현)
   - 승인 해설이 601자 이상이면 그 작품의 모든 질문이 `invalid_context`로 실패. 명세·DB 상한은 2,000자.
   - 숫자만 보낸 `18`, `18번`이 해설 요청으로 처리되지 않음(BR-09).
   - "이 작품에 대해 알려줘" 등은 승인 해설 대신 모델이 새로 생성(BR-10).
   - "천 번을 봐도", "이 번에 본"이 작품 번호로 오해되어 `publication_unavailable`.
2. **pstack에서 옮기지 못한 핵심 두 가지**
   - 플레이북에 순서 있는 단계가 없다. 순서는 `harness.ts` 코드에만 있어 단계가 빠져도 드러나지 않는다.
   - 검증이 실물에 닿지 않는다. 실호출 0회, 스킬 문장을 바꿔도 품질 변화가 검사에 잡히지 않는다.
   - "도구 허용 목록"(`assertPluginTool`)은 상수끼리 비교하는 이름표라 실제 제한이 아니다.
3. **구조 결합**
   - 해설 초안이 관람 답변 계약(`validateAnswer`, 600자)을 빌려 씀.
   - 실패 방식이 모듈마다 다름(`HarnessError` 던짐 / `abstained` 반환 / `KnowledgeError` / `AiError`).
   - 사용량·작업 상태를 둘 포트가 없음. 시간 제한 로직이 두 벌.

목표: 위 문제를 고치고, "모든 요청이 선언된 절차를 거쳤다"를 테스트로 확인할 수 있는 구조로 만든 뒤, 지금 DB로 실행 가능한 해설 초안 경로부터 실물 검증으로 잇는다.

## 진행 방식

- 브랜치: `feat/ai-runtime-harness`(e3c05f0)에서 `feat/ai-harness-playbooks`를 만들어 작업하고, PR #2 브랜치를 대상으로 하는 후속 PR로 올린다. PR #2 자체와 main은 건드리지 않는다.
- **이번 승인으로 실행하는 범위는 0~2단계**다. 키와 DB 변경이 필요 없고 오프라인 검사로 완결된다.
- 3단계는 키 준비와 migration이 필요하므로 계획만 문서에 남기고 별도 승인 후 진행한다. 4단계는 게시 기능 이후다.
- 각 단계는 독립 커밋으로 나누고, 단계마다 검사를 통과시킨 뒤 다음으로 간다.

## 0단계 — 기록 (문서)

저장소 규칙(`docs/AGENTS.md`, `docs/agent-workflow.md`)에 따라 먼저 남긴다. 새 ID는 실행 시점에 `rg '^id:' docs`로 충돌을 확인한다.

- `docs/references/`에 이번 요청 원문 기록(다음 SRC 번호).
- `docs/reviews/ai-harness-review-2026-11-13.md`(다음 GUIDE 번호): PR #2 검토 결과. 재현한 동작 4건, 구조 평가, pstack 요소별 대응표.
- `docs/specs/product-ai-plugin.md`(SPEC-014), `docs/specs/ai-harness.md`(SPEC-013)에 아래 1~4단계를 **proposed 발전 계획** 절로 추가. 사용자 확정으로 올리지 않는다.
- `docs/index.md`, `docs/references/index.md`, `docs/log.md` 연결. `python scripts/knowledge.py verify`.

## 1단계 — 계약과 동작 수정

### 1a. 해설 길이와 해설 초안 전용 계약
- `src/lib/ai/contracts.ts`
  - `AI_LIMITS`에 `narration: 2000`, `narrationTarget: 600` 추가.
  - `publicationContextSchema.narration.text` 상한을 `AI_LIMITS.narration`으로 변경(DB `publications.narration_text` ≤ 2000과 일치).
  - `narrationDraftSchema`·`narrationDraftJsonSchema` 신설: `answer`(≤2000), `citations`, `outcome`. 관람 답변의 `answerSchema`(≤600)는 그대로.
- `src/lib/ai/harness.ts`: `validateAnswer`의 공통 검사(URL·UUID 금지, 인용 소속, outcome-인용 관계)를 스키마를 인자로 받는 내부 함수로 빼고, `validateAnswer`(관람)와 `validateNarrationDraft`(해설)를 둔다.
- `src/lib/ai/narration.ts`: `validateAnswer`/`answerJsonSchema` 대신 해설 전용 검증 사용. 선택 결과에 `overTarget: boolean`(600자 초과)을 추가해 명세의 "600자 초과는 경고"를 표현.
- `ai/yeobek/skills/draft-narration/SKILL.md`: "600자 이내"를 "600자 이내를 목표"로 맞춤.

### 1b. 명시적 의도와 숫자 입력
- `contracts.ts`의 `chatRequestSchema`에 `intent: z.enum(["question", "narration"]).default("question")` 추가. `해설 보기` 버튼은 `narration`을 보낸다.
- `src/lib/ai/context.ts`
  - `isNumberOnly(question)` 추가: `18`, `018`, `18번`, `십팔 번`처럼 번호만 있는 입력을 판별.
  - 판별 순서를 `resolveIntent(request)` 한 함수로 모은다: 명시 `intent` → 번호만 입력 → 기존 `isNarrationRequest` 정규식(보조).
- `harness.ts`의 `answer`는 `resolveIntent` 결과만 본다. 정규식은 그대로 두되 주 경로가 아니다.

### 1c. 번호 오판 축소와 없는 번호 안내
- `context.ts`의 `mentionedNumbers`: 한글 수사(일·이·삼…·천)는 뒤가 `작품`이거나 문장 끝·문장부호일 때만 번호로 인정한다. 아라비아 숫자 규칙은 유지. `천 번을`, `이 번에`가 제외된다.
- `ai/yeobek/messages.json`에 `artworkUnavailable` 고정 문구 추가(`scripts/ai-plugin.mjs`의 messages 스키마에도 추가).
- `harness.ts`: 질문 속 번호로 조회한 작품이 없으면 예외 대신 `fixed(artworkUnavailable, "clarify")`를 반환한다(EX-24: 같은 안내, 현재 작품 유지). 선택된 `artworkId` 자체가 없을 때의 `publication_unavailable`은 유지.

### 1d. 실패 결과 대응표 한 곳으로
- `src/lib/ai/outcome.ts` 신설: `HarnessError`, `KnowledgeError`, `AiError`, 해설의 `AbstentionReason`을 `{ status, code, retryable }`로 바꾸는 순수 함수 하나. 코드 이름은 `docs/specs/api-contract.md`의 EX 대응표를 따른다. HTTP 연결(3단계) 때 `src/lib/api/errors.ts`의 `ApiError`로 감싼다.
- 각 모듈의 오류 클래스와 반환 방식은 이번에 바꾸지 않는다. 대응표만 통일한다.

### 1e. 시간 제한 로직 한 벌로
- `src/lib/ai/deadline.ts` 신설: `narration.ts`의 `abortable`과 타이머 조합을 옮기고, `providers/http.ts`의 중단 경쟁도 같은 함수를 쓰게 한다. 동작 변경 없음.

## 2단계 — pstack 구조 적용

### 2a. 플레이북에 순서 있는 단계
- `ai/yeobek/plugin.json`: 각 플레이북에 `steps` 배열 추가. 예(visitor-answer):
  `request.validate → intent.resolve → publication.read → publication.recheck → evidence.select → model.generate → output.validate → publication.recheck.final`
  각 단계는 `{ id, tool? }`이며 `tool`은 그 플레이북의 `tools`에 있어야 한다.
- `scripts/ai-plugin.mjs`: `steps` 스키마 검증(중복 ID 금지, 참조 도구 소속 확인)과 지문(fingerprint) 포함. `src/lib/ai/plugin.generated.ts`는 `npm run ai:bundle`로 재생성.
- 플러그인 버전 `0.3.0 → 0.4.0`.

### 2b. 단계 실행기와 기록
- `src/lib/ai/playbook.ts` 신설
  - `startPlaybook(id)` → `{ step(stepId, fn), skip(stepId, reason), finish() }`.
  - `step`은 선언된 순서가 아니거나 없는 단계면 예외. `finish`는 선언된 모든 단계가 `done` 또는 이유 있는 `skipped`인지 확인하고 기록을 반환.
  - 기록 형식: `{ id, status: "done" | "skipped" | "failed", reason?, elapsedMs }[]`.
- `harness.ts`, `narration.ts`, `artist-knowledge.ts`의 기존 흐름을 `step`으로 감싼다. 로직은 옮기지 않고 경계만 표시한다. 고정 문구로 조기 반환하는 경로는 남은 단계를 `skip(…, 이유)`로 남긴다.
- 결과 타입(`DocentReply`, `NarrationResult`, 자료 정리 결과)에 `steps` 기록을 추가한다. 관람객 응답 본문에는 내보내지 않는 내부 메타데이터로 표시(`contracts.ts` 주석, 3단계 HTTP에서 제거).

### 2c. 도구 허용 목록을 실제 제한으로
- `src/lib/ai/plugin.ts`: `capabilitiesFor(playbookId, stores)` 추가. 선언된 도구에 해당하는 저장소 함수만 담은 객체를 만든다(예: visitor-answer는 `publication.read`, `publication.recheck`만). 타입은 생성된 manifest에서 유도해, 선언하지 않은 도구 호출은 컴파일 오류가 되고 런타임에도 존재하지 않는다.
- 하네스는 저장소를 직접 부르지 않고 이 객체만 쓴다. `assertPluginTool` 호출과 함수는 제거한다.

### 2d. 스킬 본문 정리
- `ai/yeobek/skills/retrieve-wiki/SKILL.md`의 마지막 문단(서버가 수행하는 검색 순서 설명)은 모델이 수행하는 절차가 아니므로 `docs/specs/product-ai-plugin.md`로 옮기고, 스킬에는 모델이 지킬 규칙만 남긴다.

## 3단계 — 실물 검증 (별도 승인, 키·migration 필요)

지금 DB로 실행 가능한 **해설 초안 경로부터** 연결한다. 관람 경로는 게시 기능이 없어 아직 실행할 수 없다.

- **3a. 작가 자료 로더**: 새 migration에 `get_narration_context(p_artwork_id)` RPC(security definer, `require_owner`, 기존 `subject_scope` 재사용). 작품·전시·작가 문서의 section을 `ArtistKnowledgeContext` 형태로 반환하고 source ID는 문서 ID·section·revision에서 결정적으로 만든다. pgTAP으로 소유자 격리 검사. `src/lib/api/db.ts`의 `authenticatedContext`·`rpc`로 `loadOwnedContext` 구현.
- **3b. 요청 원장 포트**: `AiRequestLedger`(`reserve`/`complete`) 포트와 새 테이블(논리 모델의 GenerationJob). 요청 ID 중복 방지, 소유자별 일일 호출 상한, 작업 상태(`running/succeeded/failed/unknown`)를 원자적으로 기록. `api_requests`는 관람 세션 전용이라 재사용하지 않는다.
- **3c. HTTP 경로**: `POST /api/admin/artworks/{id}/generations`(API 계약 OP-09). `assertSameOrigin`·`readJson`·`handleApi` 재사용, 1d의 대응표로 오류 변환, `steps` 기록은 응답에서 제외. 결과는 저장하지 않는 미승인 후보.
- **3d. 실호출**: 사용자가 `.env.local`에 키를 넣은 뒤 `npm run ai:smoke -- draft`, `-- qa` 순서로 단일 호출. 요청 형식 오류(Liner `response_format`·`store`, 전사 언어 힌트 등)를 여기서 바로잡는다. 이어서 `npm run ai:compare -- --mode=live --cases=grounded --repeats=1 --max-calls=8`과 사람 라벨(`ai:review`).
- **3e. 스킬 변경 절차**: 스킬·지침을 바꾸는 PR은 작은 실호출 평가 세트를 돌리고 결과를 플러그인 지문과 함께 `docs/research/`에 남긴다는 규칙을 `docs/collaboration.md`에 추가.

## 4단계 — 관람 경로 (게시 기능 이후)

- 게시 migration이 만족해야 할 형태를 요구사항으로 명시: 근거별 ID·버전·범위·출처 라벨·본문·해시, 해설 인용 목록, 전시에 승인된 작가·전시 공통 근거. 현재 `publications.evidence`는 형태 검사가 없다.
- `PublicationStore`·`SpeechSourceStore` DB 어댑터, 세션·분당 6회 제한(3b 원장 확장).
- 관람 답변의 말투·근거 충실도는 매 답변 평가 대신 표본 평가로 확인.
- 후보 적용이 section 본문을 덮어쓰는 문제(작가 자료 정리)는 이력 보존 방식을 정한 뒤 검수 화면과 함께 연결.

## 수정 파일 요약 (0~2단계)

- 플러그인 원본: `ai/yeobek/plugin.json`, `ai/yeobek/messages.json`, `ai/yeobek/skills/draft-narration/SKILL.md`, `ai/yeobek/skills/retrieve-wiki/SKILL.md`
- 생성기: `scripts/ai-plugin.mjs` → `src/lib/ai/plugin.generated.ts`(재생성)
- 코드: `src/lib/ai/contracts.ts`, `context.ts`, `harness.ts`, `narration.ts`, `artist-knowledge.ts`, `plugin.ts`, `providers/http.ts`
- 신규: `src/lib/ai/playbook.ts`, `src/lib/ai/outcome.ts`, `src/lib/ai/deadline.ts`
- 테스트: `tests/unit/ai-harness.test.ts`, `ai-narration.test.ts`, `ai-plugin.test.ts`, `ai-providers.test.ts`, `tests/fixtures/ai.ts`, `tests/evaluation/narration-compare.test.ts`
- 문서: 0단계 목록

## Verification

단계마다 실행한다.

- `npm run ai:bundle` 후 `npm run ai:bundle:check`, `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`.
- `npm run ai:compare -- --mode=mock`이 계속 통과.
- 추가할 단위 검사
  - 601~2000자 승인 해설에서 일반 질문이 정상 응답, 2001자는 `invalid_context`.
  - `18`, `18번`, `intent: "narration"`, "이 작품에 대해 알려줘"가 각각 기대 경로(승인 해설 / 모델)로 가는지. 모델 호출 횟수로 확인.
  - "천 번을 봐도 좋네요", "이 번에 본 작품", "2024년에 만들었어?", "3번과 5번"의 번호 해석.
  - 없는 번호는 예외가 아닌 고정 안내.
  - 모든 성공 응답의 `steps`에 `model.generate` 뒤 `publication.recheck.final`이 `done`으로 존재. 단계를 건너뛰는 가짜 흐름은 `finish()`에서 실패.
  - visitor-answer 기능 객체에 작가 저장소 함수가 없음(타입과 런타임).
  - `outcome.ts`가 각 오류·보류 사유를 대응표대로 변환.
- 문서: `python scripts/knowledge.py verify`.
- 0~2단계는 실호출이 없으므로 "모델 품질이 좋아졌다"는 주장은 하지 않는다. 실물 검증은 3단계의 `ai:smoke`·`ai:compare --mode=live`·사람 라벨로만 판단한다.
````
