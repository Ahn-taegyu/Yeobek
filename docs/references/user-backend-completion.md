---
type: Reference
id: SRC-033
title: 백엔드 완성 계획 요청 원문
description: 화면과 API 키만 남기는 W0~W8 백엔드·파트너·운영 자동화 구현 요청.
status: stable
updated: '2026-11-14'
tags: [yeobek, backend, automation]
rag_include: false
generated:
  by: codex/gpt-6-astra
  at: '2026-11-14T02:27:27+09:00'
sources:
- id: business
  resource: /references/user-business-scope.md
  title: 도슨트 공급 회사 사업안 확정
---

# 사용자 첨부 원문

사용자가 목표로 지정한 goal-objective.md를 아래에 원문 그대로 보존한다. 문서 안의 현재 상태는 요청 당시의 상태이며 구현 완료 기록이 아니다. 기존 0~2단계 제한을 넘어 W0~W8 구현을 요청한 후속 범위다.

````text
\# 백엔드 완성 계획 — 화면과 API 키만 남기기\
\
\## Context\
\
현재 상태(2026-11-14 확인):\
\
\- \`main\`: 인증, 소유자 격리, 프로필·전시·작품·내부 문서 초안 API, 공개 조회(PR #1 병합).\
\- PR #2 \`feat/ai-runtime-harness\`(e20bd2f): 제공사 어댑터, 관람 답변·해설 후보·작가 자료 정리 하네스.\
\- PR #3 \`feat/ai-harness-playbooks\`(dc5c3e6): 하네스 수정 0\~2단계 완료. 해설 전용 계약, 명시 의도, 순서 있는 플레이북과 단계 기록(\`playbook.ts\`), 실제 도구 제한(\`capabilitiesFor\`), 결과 대응표(\`outcome.ts\`), 공통 시간 제한(\`deadline.ts\`). 단위 301개 통과.\
\- 사업안 1번 확정(D-014, \`docs/business-scope-decision\` 브랜치에 미커밋).\
\
아직 없는 것: 하네스를 실제 DB·HTTP에 잇는 모든 부분. 자료 업로드, 근거·승인, 음성 준비, 게시·중지·철회, 관람 채팅·인식·낭독·미디어, 작업 기록, 보완 요청, 운영 집계. 실제 제공사 호출은 0회다.\
\
목표: \*\*화면 프런트 개발과 API 키 입력만 남도록\*\* 서버·DB·AI 연결·검증을 끝낸다. 동시에 기획 세부나 기능이 바뀌어도 한두 곳만 고치면 되도록 구조를 잡는다.\
\
사용자 확정 범위: 보완 요청 루프, 운영 화면용 집계 API, 추가 질문 생성을 \*\*포함\*\*한다. 이어진 지시로 (1) AI는 성능을 희생하지 않는 선에서 파트너 API를 우선하고, (2) 운영 업무를 대신하는 자동화 AI를 범위에 넣는다. 그래서 스티비·채널톡·Alt 연동도 이번 범위다. 작가 직접 가입만 마감 이후로 둔다.\
\
정직한 한계: "키만 넣으면 완성"은 목표다. 제공사 요청 형식은 실호출 전까지 검증할 수 없으므로 키 입력 당일 점검 절차(W7)에서 어댑터 수정이 생길 수 있다. 그 범위를 어댑터 파일 안으로 가둔다.\
\
\## 변경에 강한 설계 원칙\
\
모든 작업 묶음에 공통으로 적용한다. 각 원칙은 "무엇이 바뀌면 어디를 고치는가"로 적는다.\
\
\| 바뀔 수 있는 것 | 고치는 곳(한 곳) | 방법 |\
\| --- | --- | --- |\
\| 필드, 길이, 요청·응답 형태 | \`src/lib/contracts/\` | Zod 스키마가 유일한 원천. 경로 처리기·프런트용 타입 클라이언트·테스트가 모두 여기서 파생. 계약 스냅샷 테스트로 의도치 않은 변경 감지 |\
\| 상한, 임계값, 보존 기간, 호출 제한 | \`src/lib/policy.ts\` + DB \`app_policies\` 테이블 | 업무 수치는 코드 상수 한 파일과 설정 테이블에서 읽는다. SQL check 제약에는 기술적 최대치만 둔다 |\
\| 게시 조건(예: 음성 필수 여부, 근거 최소 개수) | \`publication_rules\` 목록 | 조건을 규칙 배열로 선언. 각 규칙이 차단 사유 코드를 반환. 규칙 추가·제거가 한 줄 |\
\| 상태와 전이(전시, 작품, 근거, 작업, 보완 요청) | 상태 전이 표 | 허용 전이를 표로 선언하고 RPC가 표를 검사. 새 상태는 표와 enum만 추가 |\
\| AI 절차, 지침, 말투 | \`ai/yeobek/\` | 플레이북 단계·도구·스킬 선언. 번들 해시 검사와 단계 기록이 누락을 잡음 |\
\| 기능 켜고 끄기 | \`src/lib/features.ts\` | 보완 요청, 추가 질문, 운영 집계, 음성 필수를 서버 설정 플래그로. 꺼지면 경로는 404, 응답 필드는 생략 |\
\| 제공사, 모델 | \`src/lib/ai/providers/\`, 환경 변수 | 포트 뒤 어댑터 교체. 하네스·경로는 변경 없음 |\
\| 오류 코드와 안내 | \`src/lib/ai/outcome.ts\`, \`src/lib/api/errors.ts\` | 대응표 두 곳. 시나리오 EX 코드 대응은 \`docs/specs/api-contract.md\` |\
\| DB 구조 | 새 migration 파일 | 기존 migration은 고치지 않는다. 열 추가는 nullable·기본값으로, RPC 인자 변경은 새 함수 추가 후 교체. 스냅샷 JSON에는 \`schemaVersion\` 필드 |\
\
추가 규칙:\
\
\- 응답 봉투 \`{ data, requestId }\`는 고정. 필드는 추가만 하고 의미를 바꾸지 않는다.\
\- 플레이북 \`steps\` 기록 같은 내부 메타데이터는 HTTP 응답에서 제거한다.\
\- 키가 없어도 프런트를 개발할 수 있게 \*\*모의 제공사 모드\*\*(\`AI_PROVIDER_MODE=mock\`)를 둔다. \`NODE_ENV=production\`에서는 거부하고, 모의 결과에는 \`mock: true\`를 표시한다(기능명세의 "모의 응답은 명확히 표시").\
\
\## 파트너 API 우선 원칙\
\
사용자 지시: AI는 성능을 희생하지 않는 선에서 대회 파트너사가 제공하는 API를 최대한 사용한다.\
\
현재 구성은 해설 초안만 Liner이고 Q&A·평가·인식은 OpenAI 직접 호출, 낭독은 Typecast(파트너 아님)다. 이를 \*\*기능별로 파트너 경로를 기본값으로 두고, 측정에서 뒤질 때만 비파트너 경로를 쓰는\*\* 구조로 바꾼다.\
\
\| 기능 | 기본값(파트너) | 비교 후보 | 파트너를 유지하는 조건(제안값, 실측 후 조정) |\
\| --- | --- | --- | --- |\
\| 해설 초안·자료 정리 | Liner Chat Completions | — | 현재와 같음 |\
\| 해설 평가 | Liner 경유, \*\*초안과 다른 계열 모델\*\* | EXAONE, OpenAI 직접 | 사람 라벨과의 판정 일치가 비교 후보보다 낮지 않음. 생성과 평가가 같은 모델이면 독립 판정이 아니므로 계열을 나눈다 |\
\| 관람 Q&A | Liner 경유 모델 | EXAONE, OpenAI 직접 | 근거 충실 사람 평가 수용률, 구조화 출력 준수율이 뒤지지 않고 p95 지연이 관람 대기 한도 안 |\
\| 음성 인식 | Liner 전사 엔드포인트 | OpenAI \`gpt-transcribe\` | 한국어 번호·작품명·부정 표현 시험 세트의 인식 오류가 뒤지지 않음 |\
\| 음성 합성 | Liner 음성 엔드포인트 | Typecast, OpenAI 임시 | 한국어 청취 평가와 첫 재생까지의 지연이 뒤지지 않음 |\
\
설계 반영:\
\
\- \`src/lib/ai/routing.ts\`: 기능 → 제공사·모델을 환경 변수 한 줄로 정한다(예: \`AI_ROUTE_QA=liner:모델ID\`). 기본값은 위 표의 파트너 경로. 하네스와 경로 처리기는 기능 이름만 알고 제공사를 모른다.\
\- \*\*요청마다 자동으로 제공사를 바꾸지 않는다\*\*(기존 명세의 규칙 유지: 비용·음색이 조용히 바뀌면 안 됨). 경로 변경은 설정 변경이며 측정 기록이 근거다.\
\- 어댑터 추가: \`providers/liner.ts\`에 전사·음성, \`providers/exaone.ts\`(텍스트). \*\*이 두 API의 요청 형식과 행사 키 권한은 내가 확신할 수 없으므로 구현 전에 공식 문서(Liner 개발자 문서, \`docs.exaone.ai\`)를 읽고, 키 수령 후 단일 호출로 확인한다.\*\* 문서와 다르면 어댑터 파일만 고친다.\
\- 비교 도구 확장: \`ai:compare\`를 기능 단위 제공사 비교로 넓힌다(\`--capability=qa --providers=liner,exaone,openai\`). 품질(사람 라벨), 지연 p50/p95, 추정 비용을 같은 사례로 낸다. 인식·합성용 고정 한국어 시험 세트(번호, 작품명, 부정 표현)를 \`tests/evaluation/\`에 추가.\
\- 선택 기록: 기능별로 채택한 경로와 측정 결과를 플러그인 지문과 함께 \`docs/research/\`에 남긴다. 파트너 경로가 기준에 못 미쳐 비파트너를 쓸 때는 그 근거를 적는다.\
\- 공식 \*\*제공 API는 스티비, 라이너, Alt, 채널톡 네 가지\*\*다(행사 안내). 트랙 2는 이 도구로 1인 자동화 스타트업을 만드는 과제다. EXAONE·Articul8 Bivia·VAPI는 추가 안내 도구이지 제공 API가 아니므로, 위 표의 EXAONE은 "비교 후보"일 뿐 파트너 기본값이 아니다. VAPI는 실시간 통화 계열이라 "녹음 후 인식문 확인" 방식(D-006)과 맞지 않아 쓰지 않는다.\
\- 스티비·Alt·채널톡은 LLM이 아니라 발송·전사·상담 채널이다. 이들을 쓰는 곳이 아래 "업무 자동화 AI"다. 앞선 범위 질문에서 "마감 이후"로 뒀던 전제를 철회하고 이번 범위에 넣는다.\
\
\## 업무 자동화 AI (사업안 1번의 핵심)\
\
질문: "업무 자동화에 사용되는 AI는 필요 없는가?" — 필요하다. 지금까지의 계획은 \*\*제품 AI\*\*(해설 초안, 관람 답변)만 다뤘다. 사업안 1번이 입증해야 하는 것은 "고객이 늘어도 한 명이 제작·지원을 감당한다"이고, 그 부분은 \*\*회사 운영 업무를 대신하는 AI\*\*가 맡아야 한다. 트랙 2의 평가 대상도 이쪽이다.\
\
운영 자동화도 제품 AI와 같은 구조(플레이북 단계, 도구 제한, 결과 대응표, 작업 원장)로 만든다. LLM은 모두 라이너를 쓴다.\
\
\| 자동화 | 대신하는 운영 업무 | 쓰는 제공 API | AI가 하는 일 | 사람에게 남는 일 |\
\| --- | --- | --- | --- | --- |\
\| 고객 문의 응대 | 작가의 사용법·상태 문의 답변 | 채널톡 + 라이너 | 서비스 도움말과 \*\*그 작가의\*\* 전시 진행 상태만 근거로 답변 작성. 근거가 없으면 답하지 않고 넘김 | 넘어온 문의만 처리 |\
\| 진행 안내 발송 | 자료 요청, 승인 독촉, 게시 완료 알림, 재이용 안내 | 스티비 + 라이너 | 상태 변화에 맞는 안내를 고르고 그 작가의 진행 상황에 맞춘 문단 작성. 뼈대는 고정 문안 | 없음(수신 동의 범위 안에서 자동) |\
\| 음성 설명 가져오기 | 작가 인터뷰 전사·정리 | Alt + 라이너 | Alt 전사문을 원자료로 가져와 기존 \`artist-organize\`로 section 분류 후보 생성 | 작가가 후보 확인 |\
\| 보완 요청 요약 | 미응답 질문 취합·전달 | 라이너 (+스티비) | 비슷한 질문을 묶고 작가에게 보낼 요약 작성 | 작가가 설명 보완 |\
\| 실패 작업 분류 | 오류 원인 파악 | 라이너 | 결과 코드와 플레이북 단계 기록만 보고 원인 분류와 권고 조치 작성. 작가 원문은 보지 않음 | \`operator\` 건 확인 |\
\| 운영 브리핑 | 현황 수작업 확인 | 라이너 | 집계 수치를 하루 한 번 요약 | 읽기 |\
\
설계:\
\
\- \*\*자동화 수준을 설정으로\*\*: \`automation_policies\` 테이블에 자동화별 모드 \`off / draft / auto\`. \`draft\`는 AI가 초안을 만들고 운영자가 승인해야 나간다. \`auto\`는 정책이 허용한 분류(사용법, 상태 조회, 거래성 안내)만 자동 발송한다. 기획이 바뀌면 이 표만 고친다. 기본값은 \`draft\`로 시작하고 측정 후 올린다.\
\- \*\*이벤트와 실행기\*\*: 상태 전이(전시 생성, 초안 완료, 승인 대기 N일, 게시, 보완 요청 발생, 작업 실패, 전시 종료)가 \`automation_events\`에 쌓이고, 실행기(\`/api/cron/automation\`, 비밀값 보호)가 꺼내 플레이북을 돌린다. 중복 실행 방지와 재시도는 작업 원장(\`ai_jobs\`)을 그대로 쓴다. 새 자동화는 이벤트 종류와 플레이북 선언 추가로 끝난다.\
\- \*\*포트와 어댑터\*\*: \`MailPort\`(스티비), \`SupportPort\`(채널톡), \`TranscriptPort\`(Alt). 하네스는 포트만 안다. 모의 어댑터로 키 없이 전 구간을 검증한다.\
\- \*\*나는 이 세 API의 세부 형식을 확신하지 못한다.\*\* 구현 전에 공식 문서(\`developers.stibee.com/llms.txt\`, 채널톡 앱·커맨드 문서, Alt 문서와 행사 가이드)를 읽고 어댑터를 쓴다. 요금제·행사 키 권한에 따라 가능한 기능이 다를 수 있어 키 수령 후 확인한다. 라이너 행사 가이드(Notion)는 이전에 열리지 않았다.\
\- \*\*데이터 경계\*\*: 외부로 나가는 내용은 최소화한다. 스티비에는 수신 동의한 작가의 주소와 안내 문안만, 채널톡에는 문의 답변만 보낸다. 작가의 비공개 원자료·관람 질문 문장은 보내지 않는다. 안내 메일은 거래성(서비스 진행)과 홍보성(재이용)을 구분하고 홍보성은 별도 동의가 있을 때만 보낸다.\
\- \*\*1인 운영의 증거\*\*: 운영 집계 API(W6)에 자동화별 처리 건수, 자동 처리 비율, 운영자 개입 건수를 추가한다. 시연에서 "새 작가 한 명을 받는 동안 운영자가 한 일"을 숫자로 보여 준다.\
\
\## 진행 방식\
\
\## 진행 방식\
\
\- 브랜치: PR #3 head에서 \`feat/backend-completion\`을 만들고 작업 묶음(W0\~W7)마다 커밋한다. \`docs/business-scope-decision\`의 문서 변경을 먼저 커밋해 합친다.\
\- 각 묶음은 migration → RPC·pgTAP → 저장소 어댑터 → 플레이북 선언 → HTTP 경로 → 통합 테스트 순서로 끝낸다.\
\- 새 문서 ID는 실행 시점에 \`rg '^id:' docs\`로 확인한다. 묶음마다 \`docs/specs/api-contract.md\`, \`development-foundation.md\`, \`docs/log.md\`를 갱신한다.\
\
\## 작업 묶음\
\
\### W0 — 변경 대비 기반\
\- \`src/lib/contracts/\`: 기존 \`src/lib/api/schemas.ts\`와 \`src/lib/ai/contracts.ts\`의 HTTP 관련 스키마를 옮기고 재수출로 호환 유지.\
\- \`src/lib/policy.ts\`, \`src/lib/features.ts\`, migration \`app_policies\`(키-값, 서비스 역할만 쓰기, RPC가 읽기).\
\- \`src/lib/ai/routing.ts\`(기능별 제공사 설정, 파트너 기본값)와 \`runtime.ts\` 연결. \`.env.example\`의 기본값을 파트너 경로로 변경.\
\- 어댑터: Liner 전사·음성, EXAONE 텍스트(공식 문서 확인 후 작성). 기존 OpenAI·Typecast 어댑터는 비교 후보로 유지.\
\- \`src/lib/ai/providers/mock.ts\`. 운영 환경 차단 검사 포함.\
\- \`src/lib/client/\`: 계약에서 파생한 타입 클라이언트(fetch 래퍼, 오류 타입). 프런트는 이것만 호출.\
\- \`tests/unit/contract-snapshot.test.ts\`: 모든 경로의 요청·응답 JSON Schema 스냅샷.\
\- 문서: 이번 요청과 범위 응답을 \`docs/references/\`에 기록, D-014·D-005 갱신(보완 요청의 최소 질문 저장과 30일 보존, 운영 집계, 추가 질문 채택). "파트너 API 우선, 성능 유지" 지시를 새 결정 문서로 남기고 D-010·\`partner-integration.md\`·\`technology-stack.md\`의 제공사 표를 기능별 기본값과 비교 후보로 고친다. 실측 전이므로 모델 선택은 proposed로 둔다.\
\
\### W1 — 작업 원장과 해설 초안 (자동화 ③)\
\- migration: \`ai_jobs\`(소유자, 종류, 대상, 입력 revision, 요청 ID, 시도, 상태, 결과 코드, \`routing\`(author/operator/none), 사용량, 소요 시간, 단계 요약, 만료). RPC \`reserve_ai_job\`(요청 ID 중복·일일 상한을 원자적으로 검사), \`complete_ai_job\`, \`get_ai_job\`. RPC \`get_narration_context(p_artwork_id)\`(기존 \`require_owner\`·\`subject_scope\` 재사용, source ID는 문서·section·revision에서 결정적으로 생성). RPC \`save_narration_draft\`(revision 검사, \`artworks.narration_draft\`).\
\- \`src/lib/ai/stores/author.ts\`, \`jobs.ts\`: \`rpc\`·\`authenticatedContext\`(\`src/lib/api/db.ts\`) 재사용.\
\- \`ai/yeobek/plugin.json\`: \`narration-draft\`·\`artist-organize\`에 \`job.reserve\`·\`job.complete\` 단계와 도구 추가. \`outcome.ts\`에 \`routing\` 추가.\
\- 추가 질문 생성(플래그): 해설 초안 계약에 \`followUpQuestions\`(최대 3개), \`draft-narration\` 스킬 보강.\
\- 경로: \`POST /api/admin/artworks/{id}/generations\`, \`GET /api/admin/jobs/{id}\`, \`POST /api/admin/jobs/{id}/retry\`, \`PATCH /api/admin/artworks/{id}/narration\`.\
\
\### W2 — 작가 자료 정리 후보와 이력\
\- migration: \`knowledge_proposals\`, \`knowledge_document_history\`(적용 전 본문·출처 보존. 후보 적용이 기존 본문을 덮어쓰는 문제 해결). RPC \`store_proposal\`, \`load_proposal\`, \`commit_proposal\`(소유자·기한·문서 CAS·출처 고정값을 한 트랜잭션에서 재검사, 한 번만 적용).\
\- \`src/lib/ai/stores/proposals.ts\`로 \`ArtistKnowledgeStore\` 구현.\
\- 경로: \`POST /api/admin/knowledge/{id}/proposals\`, \`GET /api/admin/proposals/{id}\`(기존 본문과의 차이 포함), \`POST /api/admin/proposals/{id}/apply\`.\
\
\### W3 — 자료 업로드 (OP-05\~07)\
\- Storage: 비공개 버킷과 소유자 경로 정책. 업로드 허가(서명 URL) → 전송 → 완료 검증(크기, 실제 파일 형식) → \`materials\` ready.\
\- RPC: \`request_upload\`, \`complete_upload\`, \`list_materials\`, \`delete_material\`·\`delete_artwork\`(논리 삭제, 활성 참조 검사), \`set_artwork_image\`.\
\- 삭제에 맞춰 \`artworks\` 번호 유일 제약을 \`deleted_at is null\` 부분 인덱스로 교체(검토서 12.3의 후속 항목). \`src/lib/api/errors.ts\`의 제약 이름 판별도 함께 수정.\
\- 경로: \`POST /api/admin/uploads\`, \`POST /api/admin/uploads/{id}/complete\`, \`GET/DELETE /api/admin/materials…\`, \`POST /api/admin/artworks/{id}/delete\`.\
\
\### W4 — 근거·승인·음성·게시 (자동화 ④⑤, OP-08·10\~14)\
\- migration: \`evidence_items\`(전시 단위, 범위 artist/exhibition/artwork, 출처 라벨, 본문, 원본 문서·section·revision 또는 자료·쪽수, 버전, 상태 draft/approved/withdrawn, 해시). 해설 승인 필드(글 해시, 인용 근거 ID·버전). \`audio_assets\`(글 해시, 음성 설정 버전, 파일 경로, 상태). \`publications.evidence\`는 승인 근거 스냅샷 JSON(\`schemaVersion\` 포함)으로 채우고 형태 검증 추가.\
\- RPC: \`upsert_evidence\`, \`approve_evidence\`, \`approve_narration\`, \`get_review_bundle\`(초안·근거·승인·음성·공개 버전·차단 사유), \`publish\`(규칙 목록 검사 후 원자적 전환, 요청 ID로 중복 방지), \`pause\`·\`resume\`, \`get_revoke_impact\`·\`revoke_evidence\`(같은 소유자의 모든 전시 참조 차단), \`list_labels\`.\
\- 게시 규칙(\`publication_rules\`): 제목, 번호 유일(공개 번호 충돌 포함), 완료 이미지, 승인 근거 1개 이상, 승인 해설, 같은 글의 음성. 음성 규칙은 \`features.voiceRequired\` 플래그.\
\- 음성 준비: \`ai_jobs\` 종류에 \`audio\` 추가. 승인 해설만 합성, 결과를 Storage에 저장, 글 해시 대조.\
\- 경로: \`GET /api/admin/artworks/{id}/review\`, \`…/evidence\`, \`…/approvals\`, \`…/audio\`, \`POST /api/admin/exhibitions/{id}/publication\`, \`…/evidence/{id}/impact\`·\`revoke\`, \`GET …/labels\`(고정 주소·번호·제목. QR 그림은 프런트).\
\
\### W5 — 관람 경로와 보완 요청 (자동화 ⑥⑦, OP-15\~19)\
\- 저장소 어댑터: \`PublicationStore\`(전시 공개 상태·작품 상태·활성 공개본·철회 검사 후 근거 반환), \`SpeechSourceStore\`(세션 소유·만료 검사). RPC \`load_publication_context\`, \`is_publication_current\`.\
\- 세션과 한도: \`api_requests\`에 답변 메타데이터 열 추가, RPC \`reserve_visitor_request\`(세션 해시별 분당 상한, 전시 일일 상한, 요청 ID 중복을 원자적으로). 수치는 \`app_policies\`.\
\- 플레이북: \`visitor-answer\`에 \`request.reserve\`, \`answer.store\`, \`gap.record\`(플래그) 단계와 도구. 새 플레이북 \`visitor-speech\`, \`visitor-transcribe\`.\
\- 보완 요청(플래그): migration \`qa_gaps\`(전시, 작품, 공개 버전, 질문 문장, 횟수, 상태 open/answered/dismissed, 만료 30일). \`insufficient_evidence\`일 때만 기록. RPC \`record_gap\`, \`list_gaps\`, \`dismiss_gap\`, 게시 시 해당 작품의 open 요청을 answered로 전환, \`purge_expired\`.\
\- 고정 문구 추가(\`ai/yeobek/messages.json\`): 자료 부족 시 "추가 설명이 필요한 질문으로 남겼습니다", 시스템 오류.\
\- 경로: \`POST /api/chat\`, \`POST /api/transcribe\`, \`POST /api/speech\`, \`GET /api/media/{id}\`(공개 검사 후 \`no-store\`), \`POST /api/public/exhibitions/{id}/versions/check\`, \`GET /api/admin/exhibitions/{id}/gaps\`, \`POST /api/admin/gaps/{id}/dismiss\`. 기존 공개 조회에 이미지·음성 참조 추가.\
\
\### W6 — 운영 집계 API (자동화 ⑦ 회사 쪽, 플래그)\
\- migration: \`operators\`(계정 목록, 서비스 역할만 쓰기). RPC \`ops_overview()\`(security definer, \`operators\` 소속 검사). 반환: 전시별 진행 상태, 작업 성공·실패·재시도와 실패 단계 분포, \`operator\`로 분류된 미처리 건, 질문 수·자료 부족 수·시스템 오류 수, 제공사별 사용량. 질문 문장과 작가 비공개 원문은 반환하지 않는다.\
\- 경로: \`GET /api/ops/overview\`. \`scripts/local-operator.mjs\`로 로컬 운영자 지정.\
\
\### W8 — 업무 자동화 (스티비·채널톡·Alt + 라이너)\
\- migration: \`automation_policies\`(자동화별 모드·허용 분류), \`automation_events\`(종류, 대상, 상태, 중복 방지 키), \`outbound_messages\`(초안·승인·발송 상태, 채널, 수신 동의 확인), \`contact_consents\`(작가의 거래성·홍보성 수신 동의), \`help_articles\`(문의 응대의 근거가 되는 서비스 도움말). 상태 전이 RPC들이 이벤트를 남기도록 트리거 또는 RPC 내 기록.\
\- 플러그인: 스킬 \`support-reply\`, \`ops-notify\`, \`ops-triage\`와 플레이북 \`ops-support-reply\`, \`ops-notify\`, \`ops-gap-digest\`, \`ops-triage\`, \`ops-briefing\`, \`author-intake-transcript\`. 도구는 \`support.read/reply/escalate\`, \`mail.send\`, \`transcript.read\`, \`status.read\`, \`help.read\`, \`job.reserve/complete\`.\
\- 포트와 어댑터: \`src/lib/automation/ports.ts\`, \`adapters/stibee.ts\`, \`channeltalk.ts\`, \`alt.ts\`, \`mock.ts\`. 공식 문서 확인 후 작성.\
\- 실행기와 경로: \`POST /api/cron/automation\`, 채널톡·Alt 수신용 \`POST /api/webhooks/channeltalk\`, \`/api/webhooks/alt\`(서명 검증), 운영자용 \`GET /api/ops/outbox\`, \`POST /api/ops/outbox/{id}/approve|reject\`, 작가용 \`POST /api/admin/transcripts/import\`, \`PATCH /api/admin/profile/consents\`.\
\- 문의 응대 규칙: 답변은 \`help_articles\`와 그 작가의 상태 조회 결과만 근거로 한다. 근거가 없거나 결제·권리·삭제 요청이면 \`escalate\`. 제품 AI와 같은 인용 검사를 적용한다.\
\- 집계: W6의 \`ops_overview\`에 자동화별 처리·자동 비율·개입 건수 추가.\
\
\### W7 — 검증과 인계\
\- 전 구간 통합 테스트(모의 제공사): 자료 입력 → 초안 → 검수·승인 → 음성 → 게시 → 채팅(답 있음/없음) → 보완 요청 → 보완·재게시 → 같은 주소에서 답. \`tests/integration/flow\.test.mjs\`.\
\- 시연 데이터: \`npm run db:seed:demo\`(가짜 작가, 전시 1, 작품 3, 승인·게시 상태, 모의 음성). 프런트가 바로 화면을 붙일 수 있다.\
\- 프런트 인계 문서 \`docs/specs/frontend-handoff.md\`: 화면(SC-A01\~A07, SC-V01\~V06)별 호출 API, 타입 클라이언트 사용법, 상태·오류 코드, 플래그별 필드, 모의 모드 실행법.\
\- 키 입력 당일 점검 \`docs/specs/key-day-checklist.md\`: 환경 변수 → \`npm run ai:check\` → \*\*파트너 경로부터\*\* \`ai:smoke\`(Liner 초안·Q&A·평가·전사·음성, EXAONE) → 기능별 \`ai:compare --mode=live\`로 파트너와 비교 후보 측정 → 기준에 따라 경로 확정·기록 → 실패 시 고칠 파일(어댑터)과 확인 항목. 행사 키가 특정 기능을 허용하지 않으면 그 기능만 비교 후보로 전환하고 사유를 남긴다.\
\- 기능별 제공사 비교 도구와 인식·합성 시험 세트(위 "파트너 API 우선 원칙").\
\- CI에 새 통합 테스트와 계약 스냅샷 포함.\
\
\## 순서와 줄일 수 있는 범위\
\
마감(2026-11-15 아침)에 전부 들어가지 않을 수 있다. 의존 순서와 시연 가치 기준이다.\
\
1\. W0 → W1 (초안 경로. 키가 오면 가장 먼저 실물 검증 가능)\
2\. W4 (승인·게시. 음성 규칙은 플래그로 끄고 시작 가능)\
3\. W5의 글 채팅과 보완 요청\
4\. W3 (업로드) → W4의 음성 준비 → W5의 인식·낭독·미디어\
5\. W8의 기반(정책, 이벤트, 실행기, 발송함) → 진행 안내(스티비) → 문의 응대(채널톡) → 전사 가져오기(Alt) → 분류·브리핑\
6\. W6, W2\
7\. W7은 각 묶음과 함께 누적하고 마지막에 정리\
\
트랙 2의 평가는 운영 자동화에 있으므로, 시간이 모자라면 3번의 보완 요청과 5번의 진행 안내·문의 응대를 4번(업로드·음성)보다 먼저 한다. 음성은 플래그로 끈 상태에서 글 흐름으로 시연할 수 있다.\
\
줄일 때는 플래그로 끈 상태로 남기고, 인계 문서에 "미구현"으로 적는다. 구현하지 않은 기능을 완료로 표시하지 않는다.\
\
\## 재사용하는 기존 코드\
\
\- HTTP: \`handleApi\`, \`readJson\`, \`assertSameOrigin\`, \`PRIVATE_HEADERS\`(\`src/lib/api/http.ts\`), \`ApiError\`·\`databaseError\`(\`src/lib/api/errors.ts\`), \`authenticatedContext\`·\`rpc\`(\`src/lib/api/db.ts\`), \`rpcArgs\`(\`src/lib/api/schemas.ts\`).\
\- SQL: \`yeoback_private.require_owner\`, \`subject_scope\`, \`validate_document\`, 생성 ID+입력 해시 재시도 방식(\`create_exhibition\`), 공개 게이트(\`public_artworks\`).\
\- AI: \`startPlaybook\`(\`playbook.ts\`), \`capabilitiesFor\`(\`plugin.ts\`), \`normalizeAiOutcome\`(\`outcome.ts\`), \`deadline.ts\`, 하네스 3종과 \`runtime.ts\`의 조립 지점, \`scripts/ai-plugin.mjs\` 번들 검사.\
\- 검증: pgTAP 패턴(\`supabase/tests/mvp_foundation_test.sql\`), 쿠키 jar 통합 테스트(\`tests/integration/api.test.mjs\`), \`scripts/local-supabase.mjs\`.\
\
\## Verification\
\
\- 묶음마다: \`npm run ai:bundle:check\`, \`npm run lint\`, \`npm run typecheck\`, \`npm test\`, \`npm run db:test\`, \`npm run db:types\` 후 타입 차이 없음, \`npm run build\`, 로컬 앱을 띄워 \`npm run test:integration\`.\
\- 계약: 스냅샷 테스트가 통과하고, 스키마를 바꾸면 스냅샷·타입 클라이언트·인계 문서가 함께 바뀌는지 확인.\
\- 제공사 전환 점검: \`AI_ROUTE_QA\`를 파트너에서 비교 후보로 바꿔도 하네스·경로 코드 수정 없이 모의 통합 테스트가 통과하는지. 각 어댑터는 모의 응답 단위 검사를 갖는다.\
\- 변경 용이성 점검(각 1회 실제로 해 본다): 게시 규칙에서 음성 조건을 끄고 게시가 되는지, \`app_policies\`의 분당 상한을 바꿔 한도가 바뀌는지, 플래그로 보완 요청을 끄면 경로가 404이고 채팅은 정상인지.\
\- 권한: 다른 계정의 자료·작업·후보·보완 요청·미디어가 404인지, 운영 집계가 운영자 외 404인지, 승인 전 내용이 공개 경로에 나오지 않는지(pgTAP과 통합).\
\- 전 구간: \`tests/integration/flow\.test.mjs\`를 모의 제공사로 통과.\
\- 업무 자동화: 모의 어댑터로 이벤트 → 초안 → (정책에 따라 승인 또는 자동) → 발송 기록까지 통합 테스트. \`automation_policies\`를 \`off/draft/auto\`로 바꿔 동작이 달라지는지, 수신 동의가 없으면 홍보성 안내가 나가지 않는지, 근거 없는 문의가 \`escalate\`되는지, 같은 이벤트가 두 번 처리되지 않는지 확인. 외부로 나가는 본문에 비공개 원자료·관람 질문이 없는지 검사.\
\- 문서: \`python scripts/knowledge.py verify\`.\
\- 실물: 키가 생기면 W7의 점검 절차를 실행한다. 그 전에는 모델 품질, 음성 품질, 제공사 요청 형식을 검증했다고 적지 않는다.
````
