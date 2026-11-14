# Yeobek

작가가 승인한 자료로 해설과 질문 응답을 제공하는 AI 도슨트입니다. Next.js·Supabase 인증과 초안, 해설 작업, 글 승인·게시, 관람 글 채팅 및 비공개 자료 업로드·삭제 API가 있습니다. W3 자료는 PR #8, W4 작가 음성은 PR #9로 병합됐습니다. W5 관람 음성·공개 미디어는 PR #10의 CI를 통과해 병합됐으며 화면은 후속입니다. [실제 개발 범위](docs/specs/development-foundation.md), [AI 준비 범위](docs/specs/ai-harness.md), [API 계약](docs/specs/api-contract.md)을 먼저 확인하세요. 기존 문서의 MAWD 명칭은 행사·기획 이력으로 보존합니다.

## 앱 실행

Node 24, npm, Docker Desktop의 Linux 컨테이너 엔진을 사용합니다. 저장소 루트에서 실행합니다. 최초 실행은 Supabase 컨테이너 이미지를 다운로드합니다.

```sh
npm ci
npm run db:start
npm run db:env
npm run db:artist
npm run dev
```

`db:start`는 `yeobek-mvp` 프로젝트를 localhost에 바인딩한 `yeobek-local` 네트워크에서 시작하고 migration을 적용합니다. `db:env`는 로컬 worker 키를 포함한 Git 제외 `.env.local`을 생성하며 기존 파일은 덮어쓰지 않습니다. 기존 파일이 이 로컬 스택을 가리키고 worker 키가 없다면 `npm run db:env -- --worker`로 그 키만 추가합니다. `db:artist`는 가짜 로컬 작가 계정을 만들고 로그인 정보를 `.env.artist.local`에 저장합니다. 터미널·Git에 키나 비밀번호를 출력하지 않습니다. [로그인](http://localhost:3000/login)에서 그 계정을 사용합니다. 로그인에서 비밀번호를 표시하거나 숨길 수 있습니다. 현재 작가 홈은 계정 이메일과 이름, 전시 기간·장소·작품 수를 포함한 목록 조회를 제공합니다. 입력/검수 화면은 다음 구현입니다.

클라우드의 기존 인증·초안 API에는 `.env.example`의 Supabase 변수 두 개와 `APP_ORIGIN`이 필요합니다. AI 변수는 아래 절차로 별도 설정합니다. W1 해설 작업의 신뢰된 서버 worker에는 서버 전용 `SUPABASE_SERVICE_ROLE_KEY`가 필요합니다. 브라우저에 노출하지 않습니다. `APP_ORIGIN`은 실제 접속 주소와 정확히 맞춥니다. HTTPS에서는 인증 쿠키에 Secure가 적용됩니다. 클라우드에는 migration과 사전 발급 계정이 필요하며, 이 작업은 클라우드 생성·배포를 수행하지 않았습니다.

로컬 계정을 운영자로 지정하려면 `npm run db:operator -- <사용자 UUID>`를 실행합니다. 같은 명령에 `--disable`을 붙이면 해제됩니다. 로컬 Supabase에 이미 있는 비익명 계정만 허용하며 운영자 발송함 HTTP 검토에 사용합니다. 전시 생성·해설 초안 완료·게시의 거래성 안내는 `POST /api/cron/automation`으로 처리합니다. 서버의 `CRON_SECRET`을 Bearer 헤더로 보내며 브라우저에는 전달하지 않습니다. 실제 스케줄러는 아직 배포하지 않았습니다.

자동화도 `AI_PROVIDER_MODE=mock`으로 전체 흐름을 시험할 수 있습니다. 모의 개발 서버의 출처와 시험용 cron 비밀값을 `TEST_APP_ORIGIN`, `TEST_CRON_SECRET`에 지정한 뒤 `npm run test:automation`을 실행합니다. 실환경에는 Liner 키와 스티비 거래성·홍보성 각각의 자동 이메일 URL, API 키, 사용자 정의 문단 필드가 필요합니다(`.env.example`). 스티비 설정이 없으면 승인 발송함을 소비하지 않고 cron 결과의 `dispatchReady=false`로 알립니다. 기본 정책은 운영자 승인 후 발송하는 draft입니다. 채널톡·Alt 전체 실행 연결은 후속입니다.

## AI 연결 준비

`src/lib/ai/`는 해설·자료 정리·평가·Q&A·전사·합성의 서버 어댑터와 하네스를 제공합니다. 기본 경로는 모두 Liner이며 평가 기본 모델은 초안과 다른 Google 계열입니다. 모델 접근과 품질은 실측 전 미확정입니다. 실제 외부 모델 호출은 아직 0회입니다. W1 해설 작업 원장과 생성·조회·재시도·명시적 초안 적용 HTTP는 로컬 검증과 [PR #5 CI](https://github.com/Ahn-taegyu/Yeobek/pull/5)를 통과해 병합됐습니다. 글 승인·게시 API는 PR #6 CI를 통과해 병합됐으며 관람 글 채팅 HTTP도 연결했습니다. 키를 넣어도 관람 화면이 활성화되지는 않습니다.

1. `.env.example`의 AI 항목을 기존 `.env.local`에 추가하고 `LINER_API_KEY`를 서버에 설정합니다. 키에 `NEXT_PUBLIC_`를 붙이지 않습니다.
2. `AI_ROUTE_DRAFT`, `AI_ROUTE_ORGANIZE`, `AI_ROUTE_JUDGE`, `AI_ROUTE_QA`, `AI_ROUTE_STT`, `AI_ROUTE_TTS`는 `제공사:모델` 형식으로 선택합니다. Liner TTS는 계정에서 확인한 고정 모델을 `AI_ROUTE_TTS` 또는 `LINER_TTS_MODEL`에, 음성을 `LINER_TTS_VOICE`에 지정해야 합니다. 평가 모델은 초안과 다른 인식 가능한 계열이어야 합니다.
3. OpenAI·Typecast·EXAONE은 비교 후보입니다. 해당 `AI_ROUTE_*`와 제공사 키, 필요한 음성 설정을 명시해 선택합니다. 자동 장애 전환은 없습니다. `.env.example`에 예시가 있습니다.
4. 키 없는 개발·시험에는 `AI_PROVIDER_MODE=mock`을 사용합니다. `NODE_ENV=development` 또는 `test`에서만 허용되며 production에서는 거부합니다. 모의 결과에는 `mock: true`가 표시됩니다.

```sh
npm run ai:check
npm run ai:eval
# 아래 smoke는 live 설정에서 기능 하나당 최대 한 번 실제 호출하며 비용이 발생할 수 있습니다.
npm run ai:smoke -- qa
npm run ai:smoke -- draft
npm run ai:smoke -- judge
npm run ai:smoke -- organize
npm run ai:smoke -- tts
# 권한 있는 30초/3MiB 이내 시험 녹음
npm run ai:smoke -- stt --audio=path/to/test.webm
```

`ai:check`는 설정을 검사하며 키를 출력하거나 접속하지 않습니다. `ai:smoke`는 `AI_PROVIDER_MODE=live`가 필요하며 `typecast-tts`, `openai-tts`, `exaone`도 선택할 수 있습니다. 시험은 응답 계약을 확인하며 한국어 품질·근거 충실도와 행사 키 권한은 별도 실측이 필요합니다.

기존 인증·작가 CRUD와 공개 조회의 경로는 `src/lib/contracts/`에 계약을 두고 프런트에서 `requestApi`를 `@/lib/client`로 가져와 사용합니다. 글 게시와 관람 채팅·보완 요청 HTTP도 같은 계약과 클라이언트로 호출합니다.

W1 해설 작업은 소유자별 일일 초기 한도 100회, 180초 lease, 30일 작업 만료를 사용합니다. 요청 중 동기 실행하고 중단되면 작업 조회 후 재시도하며, 결과는 작가가 별도로 적용해야 초안이 바뀝니다. 모의 모드는 development/test에서만 허용합니다. 30일 만료 후 접근을 차단하며 실제 삭제는 비밀값으로 보호한 POST /api/cron/purge를 외부 스케줄러가 호출합니다. 이 저장소 작업에서 운영 스케줄러를 배포하지는 않았습니다.

모의 작업 HTTP 검사는 별도 개발 서버에서 실행합니다. PowerShell에서 다음을 실행하고, 서버가 준비되면 다른 터미널에서 테스트합니다. 로컬 DB와 작가 계정이 필요합니다.

```powershell
$env:AI_PROVIDER_MODE="mock"; $env:APP_ORIGIN="http://localhost:3001"
npm run dev -- --hostname 127.0.0.1 --port 3001
# 다른 터미널
$env:TEST_APP_ORIGIN="http://localhost:3001"
npm run test:jobs
# 게시 검사 서버는 FEATURE_VOICE_REQUIRED=false로 실행해야 합니다.
npm run test:publication
```

CI에도 이 개발 모드 모의 작업 검사가 포함됩니다. 실제 외부 호출 검사는 아닙니다.

W4 글 승인·게시 경로는 PR #6, 작가 음성 경로는 PR #9로 병합됐습니다. 승인된 해설 원문으로 MP3를 생성해 비공개 `artist-audio`에 저장하고 공통 작업 조회·재시도를 사용합니다. 음성 설정을 구성하지 않은 상태의 글 전용 게시에는 `FEATURE_VOICE_REQUIRED=false`가 필요합니다. 음성 제공사·모델·목소리·형식·모의 여부를 바꿀 때는 DB 정책 `voice_config_version`도 올려야 합니다. 실환경 재개는 모의 음성을 거부합니다. 로컬 모의 음성 HTTP·실제 Storage 검증은 통과했으며 외부 AI 실호출과 음질 검증은 아직 없습니다.

## 앱 검사와 DB 변경

AI의 업무 절차와 말투는 [제품 플러그인](docs/specs/product-ai-plugin.md)으로 관리합니다. `ai/yeobek/plugin.json`, `instructions.md`, `messages.json`, `skills/*/SKILL.md`를 수정한 뒤 `npm run ai:bundle`을 실행합니다. 생성된 `src/lib/ai/plugin.generated.ts`는 직접 편집하지 않습니다. 테스트와 빌드가 원본/생성물 불일치를 차단하며, 필요한 스킬만 업무별로 조합하고 플러그인 해시를 답변에 기록합니다.

작가 자료 정리는 원문 블록을 분류한 비공개 후보 → 작가 검토 → 버전 재검사 → 적용의 서버 실행 모듈을 제공합니다. 실제 DB 저장소·검수 UI는 아직 연결하지 않았습니다. `createNarrationRuntime`에는 소유 자료로 해설 후보 2개를 병렬 생성하고 평가·최대 한 라운드 재생성하는 경로와 단일 생성 기준선을 연결했습니다. 최종 결과는 미승인 초안입니다. 관람 글 채팅은 연결됐고 대화 문맥 복제는 후속이며 [작가 해설 비교 계약](docs/specs/narration-evaluation.md)을 확인하세요.

관람 하네스 입력은 선택적인 `intent: "narration" | "question"`와 `artworkNumber`를 받습니다. 해설 버튼은 `intent: "narration"`과 작품 ID를, 숫자 입력은 같은 의도와 작품 번호를 보내며 `question`도 함께 전달합니다. 생략 시 제한된 문장 판별을 사용합니다. 승인 해설은 최대 2,000 Unicode 코드 포인트를 그대로 반환·음성 전달하고, 관람 생성 답변은 600자 상한을 유지합니다. 해설 초안은 별도 2,000자 계약을 쓰고 선택 결과의 `overTarget`으로 600자 초과 경고를 전달합니다. 관람 음성 HTTP는 PR #10으로 병합됐으며 UI는 후속입니다. [PR #2 수정 검토서](docs/reviews/ai-harness-fix-review.md)에 재현 근거와 게시 데이터·적용 이력의 후속 요구를 정리했습니다.

## 작가 해설 비교 실험

기본 `npm run ai:compare`는 합성 사례 5개의 **오프라인 시뮬레이션**입니다. 실제 모델의 품질·비용·응답 시간을 측정한 결과가 아닙니다. `single`은 생성 1회+평가 1회, `best_of_two`는 병렬 생성 2회+평가 1회와 수정 가능한 실패의 추가 라운드 한 번(최대 6회 호출)을 사용합니다. 기본 생성과 평가는 Liner 경유이며 평가는 다른 Google 계열 모델을 사용하고 두 방식에 같은 모델·자료·평가 하한을 적용합니다.

```sh
npm run ai:compare -- --mode=mock
# 아래는 합성 grounded 사례를 두 방식으로 비교하는 실제 유료 호출입니다.
# 기본 경로는 LINER_API_KEY가 필요합니다. 최악의 경우 8회 호출을 예약합니다.
npm run ai:compare -- --mode=live --cases=grounded --repeats=1 --max-calls=8
# 사람이 human-review.json을 보고 human-labels.json의 null 값을 채운 뒤 실행
npm run ai:review -- .ai-eval/run-ID
```

실험 결과는 출력된 `.ai-eval/run-ID/`에 저장합니다. `report.json`은 모델 점수·사용량·실패를 포함한 전체 지연 p50/p95·비용 추정·재생성 기록이며 답변 본문을 제외합니다. `human-review.json`에는 자료 ID/본문과 최종 답 또는 보류 사유를 담고 생성 방식·모델 점수는 숨깁니다. `human-labels.json`의 `acceptable`은 적절한 답 또는 적절한 근거 부족 안내인지 평가하고, 본문이 없는 경우 네 세부 점수는 null로 둘 수 있습니다. 평가자에게 `key.json`과 `report.json`을 함께 주지 않습니다. `ai:review`는 라벨 수·항목별 평균/표본 수·양쪽 라벨이 있는 쌍의 승수를 `human-summary.json`에 만듭니다. 미작성 라벨은 통과로 계산하지 않습니다.

사례는 `grounded`, `missing-intent`, `injection`, `conflict`, `insufficient`입니다. `--cases=grounded,injection --repeats=2 --max-calls=32`처럼 선택하며 실호출 상한은 사례 수×반복 수×8 이상, 최대 200입니다. 반복은 1~5회입니다. 순서는 사례·반복마다 교대하며 평가기에 주는 후보 순서는 무작위입니다. 5개 공개 합성 사례는 개발용 점검 세트이며 품질 인증이나 별도 평가 세트를 대체하지 않습니다.

비용 계산은 선택적 `--pricing=path/to/pricing.json`을 사용합니다. `tests/evaluation/pricing.example.json`을 복사하고 `rates`에 `{ "provider": "liner", "model": "실제 응답의 모델 ID", "inputUsdPerMillion": 입력단가, "outputUsdPerMillion": 출력단가 }` 형태로 현재 계정 단가를 기입합니다. 실제 평가 모델도 별도 행으로 넣고 `asOf`를 갱신합니다. 정확한 모델 단가나 사용량이 없으면 총비용은 null이며, 확인된 일부 비용만 따로 표시합니다. 집계 토큰 단가의 추정이므로 캐시·계약별 요율·실제 청구액과 다를 수 있습니다. 재시도·평가를 모두 포함하며 무료라고 가정하지 않습니다.

Tailwind CSS 4·PostCSS를 사용합니다. 현재 Windows에서 재현된 Turbopack PostCSS worker 종료를 피하도록 `dev`·`build`는 Next.js의 `--webpack` 옵션을 사용합니다. 기존 로컬 스택이 실행 중일 때 새 migration 적용은 `npx supabase migration up --local`로 수행하며 DB reset은 필요하지 않습니다.

```sh
npm run lint
npm run typecheck
npm test
npm run db:test
npm run build
npm run start
```

별도 터미널에서 `npm run test:integration`을 실행하면 실제 로컬 Auth·쿠키·API를 검증합니다. 새 가짜 계정과 초안은 로컬 DB에 남습니다. 사용한 앱을 종료하고 `npm run db:stop`으로 스택을 중지합니다. DB를 보존한 채 다음에 다시 시작할 수 있습니다.

자기 소유의 폐기 가능한 로컬 DB를 새로 만들 때만 `npm run db:reset`을 실행합니다. 이 명령은 로컬 자료와 계정을 지우므로 계정 예제 파일도 더 이상 유효하지 않습니다. 필요하면 해당 로컬 파일을 정리한 뒤 계정을 다시 발급합니다. schema 변경 후 `npm run db:types`로 타입을 갱신하고 migration·타입·호출자를 함께 검토합니다. 공유 migration은 새 파일로 정정합니다. 기본 보조 스크립트는 `yeobek-mvp` 스택만 허용하므로 worktree별 병렬 DB는 [격리 규칙](docs/collaboration.md#5-worktree)에 따라 프로젝트/포트/네트워크와 스크립트 검사를 함께 조정해야 합니다.

`App checks` CI는 main push·PR·수동 실행에서 잠금 버전 설치·린트·타입·단위 테스트·실제 Supabase 테스트·타입 차이·빌드·HTTP 통합 검사를 수행합니다. AI 서비스나 클라우드 DB 키는 필요 없습니다. 배포는 수행하지 않습니다.

## 에이전트와 시작하기

저장소 루트를 작업 폴더로 열면 [AGENTS.md](AGENTS.md)가 검색·수정·검증 순서를 안내합니다. Claude Code, Gemini CLI, Cursor, GitHub Copilot용 진입 파일도 같은 지침을 가리킵니다. 도구의 지침 로딩 설정에 따라 자동 적용 여부가 다르므로 인식되지 않으면 `AGENTS.md를 읽고 작업해 줘`라고 요청하면 됩니다.

Python 3.12 이상을 설치한 뒤 다음 명령을 실행합니다. Windows·macOS·Linux에서 같은 명령을 쓰며 `python`이 없는 환경은 `python3`로 바꿉니다.

```sh
git clone https://github.com/Ahn-taegyu/Yeobek.git
cd Yeobek
python scripts/knowledge.py setup
python scripts/knowledge.py search "관람객 음성 입력 출력" --json
python scripts/knowledge.py search "사업안 선택" --accepted-only
python scripts/knowledge.py verify
```

비공개 저장소이므로 초대받은 GitHub 계정으로 인증해야 clone할 수 있습니다. `setup`은 로컬 가상환경과 고정된 의존성을 설치하고 문서를 검사·색인합니다. 이후 검색과 검증에는 API 키·외부 LLM·별도 DB가 필요 없습니다.

## 문서 읽는 순서

- [문서 목차](docs/index.md), [사용법](docs/README.md), [에이전트 작업 절차](docs/agent-workflow.md)
- [MVP 범위](docs/product/mvp-priorities.md), [결정 목록](docs/decisions/index.md)
- [기능 명세](docs/specs/functional-spec.md), [화면 상세](docs/specs/screen-spec.md), [시나리오·예외](docs/specs/user-scenarios.md)
- [OKF·Bases·기획 RAG 계약](docs/specs/knowledge-contract.md)

`docs/`는 YAML frontmatter와 Markdown을 사용하는 OKF 0.2 기반 번들이며, 같은 폴더를 Obsidian 보관함으로 열 수 있습니다. Bases는 문서 속성을 표로 보여주고, 로컬 RAG는 한국어 BM25 검색과 출처 문맥을 생성합니다. 제품용 관람객 RAG와 별개입니다.

## 협업과 검증

수정 시 [기여 안내](CONTRIBUTING.md)를 따릅니다. 출처 → 결정 → 기능·명세 → 목차·변경 이력을 연결하고 `python scripts/knowledge.py verify`를 실행합니다. Knowledge checks는 main push·PR·수동 실행에서 Windows/Linux 검증을 수행합니다.

가상환경, 검색 인덱스, 개인 Obsidian 배치, 비밀키는 커밋하지 않습니다. 새 clone에서 인덱스를 재생성하므로 문서 원문이 유일한 편집 기준입니다. 검색 점수나 `stable` 상태는 사용자 확정·제품 구현 완료를 뜻하지 않습니다.

## 관람 글 API 검사와 만료 정리

모의 서버에 `FEATURE_VOICE_REQUIRED=false`, `FEATURE_GAPS=true`와 테스트용 `CRON_SECRET`(32자 이상)을 설정한 뒤 `npm run test:visitor`를 실행합니다. 서버를 `FEATURE_GAPS=false`로 다시 시작하고 검사 쪽에 `TEST_GAPS_DISABLED_ONLY=true`를 설정하면 보완 요청 경로 404·필드 생략·채팅 유지도 확인합니다. 이 관람 검사는 이미지 메타데이터 fixture를 사용하며 실제 파일 전송은 별도 materials 통합 검사에서 확인합니다.

운영 배포 시 스케줄러가 매시간 `POST /api/cron/purge`를 `Authorization: Bearer <CRON_SECRET>` 헤더로 호출하도록 설정해야 합니다. DB 접근 만료는 즉시 적용되며 물리 삭제는 이 호출로 실행됩니다. 서버 비밀값을 프런트나 URL에 넣지 않습니다. 현재 스케줄러를 배포하거나 실제 외부 AI를 호출하지 않았습니다.


## 파일 업로드 검사

`npm run test:integration`은 인증/초안과 실제 로컬 Storage의 PNG·JPEG·PDF 전송·검증·삭제를 검사합니다. 실행 서버에 32자 이상 `CRON_SECRET`, 검사 프로세스에 같은 `TEST_CRON_SECRET`을 설정하세요. 비밀값은 명령 이력 대신 로컬 환경에 두고 실제 운영 키를 테스트에 쓰지 않습니다. `TEST_APP_ORIGIN` 기본값은 `http://localhost:3000`입니다. 파일만 확인하려면 `node --test tests/integration/materials.test.mjs`를 실행합니다. 외부 AI 호출은 없습니다.

정리 스케줄러는 `/api/cron/purge`를 호출합니다. 한 번에 최대 50개 자료를 정리하므로 물량이 늘면 실행 간격을 줄여야 합니다. 준비된 자료의 임시 파일은 업로드 서명 만료 뒤 재정리하며 final 원본은 유지합니다. 소유자 다운로드 URL은 60초 유효하고 공개 방문자에게 PDF를 제공하지 않습니다.
