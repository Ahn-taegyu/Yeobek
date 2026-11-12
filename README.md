# yeoback

작가가 승인한 자료로 해설과 질문 응답을 제공하는 AI 도슨트의 기획 저장소입니다. 현재는 **기획 문서와 로컬 지식 검색 도구**가 있으며 제품 앱 구현과 구분합니다. 기존 문서의 MAWD 명칭은 행사·기획 이력으로 보존합니다.

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
