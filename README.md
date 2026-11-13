# yeoback

작가가 승인한 자료로 해설과 질문 응답을 제공하는 AI 도슨트입니다. 현재는 **Next.js·Supabase 인증/초안 저장 기반**과 기획 문서·로컬 지식 검색 도구가 있습니다. AI 해설·음성·게시·관람 화면은 후속 구현입니다. [실제 개발 범위](docs/specs/development-foundation.md)와 [API 계약](docs/specs/api-contract.md)을 먼저 확인하세요. 기존 문서의 MAWD 명칭은 행사·기획 이력으로 보존합니다.

## 앱 실행

Node 24, npm, Docker Desktop의 Linux 컨테이너 엔진을 사용합니다. 저장소 루트에서 실행합니다. 최초 실행은 Supabase 컨테이너 이미지를 다운로드합니다.

```sh
npm ci
npm run db:start
npm run db:env
npm run db:artist
npm run dev
```

`db:start`는 `yeobek-mvp` 프로젝트를 localhost에 바인딩한 `yeobek-local` 네트워크에서 시작하고 migration을 적용합니다. `db:env`는 Git에서 제외한 `.env.local`을 생성하며 기존 파일은 덮어쓰지 않습니다. `db:artist`는 가짜 로컬 작가 계정을 만들고 로그인 정보를 `.env.artist.local`에 저장합니다. 터미널·Git에 키나 비밀번호를 출력하지 않습니다. [로그인](http://localhost:3000/login)에서 그 계정을 사용합니다. 현재 작가 홈은 이름과 전시 목록 조회까지 제공합니다. 입력/검수 화면은 다음 구현입니다.

클라우드 연결 시에는 `.env.example`의 세 변수만 개발 환경의 비밀값 설정에 넣습니다. 앱은 service-role 키를 쓰지 않습니다. `APP_ORIGIN`은 실제 접속 주소와 정확히 맞춥니다. HTTPS에서는 인증 쿠키에 Secure가 적용됩니다. 클라우드에는 migration과 사전 발급 계정이 필요하며, 이 작업은 클라우드 생성·배포를 수행하지 않았습니다.

## 앱 검사와 DB 변경

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

`App checks` CI는 잠금 버전 설치·린트·타입·단위 테스트·실제 Supabase 테스트·타입 차이·빌드·HTTP 통합 검사를 수행합니다. AI 서비스나 클라우드 DB 키는 필요 없습니다. 배포는 수행하지 않습니다.

## 에이전트와 시작하기

저장소 루트를 작업 폴더로 열면 [AGENTS.md](AGENTS.md)가 검색·수정·검증 순서를 안내합니다. Claude Code, Gemini CLI, Cursor, GitHub Copilot용 진입 파일도 같은 지침을 가리킵니다. 도구의 지침 로딩 설정에 따라 자동 적용 여부가 다르므로 인식되지 않으면 `AGENTS.md를 읽고 작업해 줘`라고 요청하면 됩니다.

Python 3.12 이상을 설치한 뒤 다음 명령을 실행합니다. Windows·macOS·Linux에서 같은 명령을 쓰며 `python`이 없는 환경은 `python3`로 바꿉니다.

```sh
git clone https://github.com/Ahn-taegyu/yeoback.git
cd yeoback
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

수정 시 [기여 안내](CONTRIBUTING.md)를 따릅니다. 출처 → 결정 → 기능·명세 → 목차·변경 이력을 연결하고 `python scripts/knowledge.py verify`를 실행합니다. GitHub Actions도 push와 PR에서 Windows/Linux 검증을 수행합니다.

가상환경, 검색 인덱스, 개인 Obsidian 배치, 비밀키는 커밋하지 않습니다. 새 clone에서 인덱스를 재생성하므로 문서 원문이 유일한 편집 기준입니다. 검색 점수나 `stable` 상태는 사용자 확정·제품 구현 완료를 뜻하지 않습니다.
