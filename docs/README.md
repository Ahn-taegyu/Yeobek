---
type: Guide
id: GUIDE-001
title: yeoback 기획 저장소 사용법
description: Obsidian으로 여는 방법과 기획 RAG 명령을 안내한다.
status: stable
updated: '2026-11-13'
tags:
- mawd
rag_include: false
generated:
  by: codex/gpt-6
  at: '2026-11-13T02:07:34+09:00'
sources:
- id: handoff
  resource: /references/user-repository-handoff.md
  title: GitHub 공유와 에이전트 협업 요청
- id: chat
  resource: /references/user-chat-interaction.md
  title: 사용자 통합 채팅·입출력 모드 요구
- id: direction
  resource: /references/user-build-direction.md
  title: 사용자 최신 개발 방향
---

# 먼저 볼 문서

에이전트는 [작업 지침](AGENTS.md)과 [검색·수정·검증 절차](agent-workflow.md)를 먼저 읽는다. 저장소 이름은 yeoback이며 기존 MAWD 문서는 기획 이력으로 유지한다.

1. [MVP 우선순위](product/mvp-priorities.md) — 원래 우선순위와 현재 범위.
2. [기능명세 v1.0](specs/functional-spec.md) — 범위·권한·입력·상태·API 업무 계약. [화면 상세](specs/screen-spec.md), [시나리오·예외](specs/user-scenarios.md)를 함께 읽는다.
3. [기술 스택](specs/technology-stack.md) — Next.js·Supabase·Liner·OpenAI 음성.
4. [개발 순서와 역할](product/delivery-plan.md) — 사전 개발부터 11/15 04:30 내부 완료까지.
5. [결정 목록](decisions/index.md) — 확정·제안·미결정.
6. [전체 목차](index.md), [기획 검토](product/review-findings.md).

**최신 기술 조사:** [음성·DB·호스팅 비교](research/index.md), [D-009 변경 제안](decisions/D-009-stack-review.md). GPT-Live/Gemini Live·한국어 TTS, 큰 이미지/PDF, 무료 VM PostgreSQL 직접 운영, Render 행사 파트너와 무료 호스팅을 비교했다. 새 모델/호스트는 아직 선정·검증하지 않았다.

**확정:** 사업안은 미정으로 두고 공통 도슨트부터, 인식은 QR·숫자, 제공 API 최소 한 개 필수.
**관람객 경험:** 해설·질문은 [하나의 채팅](specs/chat-interaction.md), 텍스트/음성 입력과 출력은 독립 선택이다. 음성→텍스트, 텍스트→음성도 MVP에 포함한다.
**추가 확정:** 사전 개발 가능, OpenAI 키 보유, 이미지 부분 선택·카메라는 후속. [선정 스택](specs/technology-stack.md)으로 진행하며 PDF는 보관·수동 발췌 연결부터 구현한다.
**검증 대기:** 실제 API 접근·한국어 음성/답변 품질·계정 한도·정확한 공식 제출 시각. 실제 작가 자료/파일럿은 아직 없다. 장기 PDF 자동화 수준도 미결정이다.

# 후속 설계에 사용하기

와이어프레임은 화면 ID `SC-*`, API 명세는 업무 작업 `OP-*`, 검증은 시나리오 `UC-*`와 수용 기준 `AC-*`를 이어 사용한다. 신규 상세 설계는 proposed이며 사용자 확정 범위·기술 검증 완료와 구분한다.

# Obsidian

Obsidian에서 **폴더를 보관함으로 열기(Open folder as vault)**로 clone한 저장소의 `docs` 폴더를 선택한다. Bases 지원 버전에서 코어 플러그인 Bases를 활성화한다. 공유 기본 설정은 저장소에 포함하며 개인 workspace 배치는 제외한다. 커뮤니티 플러그인은 필요 없다.

- [대시보드](dashboard.md)를 열거나 `bases/Features.base`를 연다.
- 기능 표에서 원안 `source_priority`와 현재 제안 `proposed_phase`를 따로 본다.
- `decision_status`는 의사결정 상태, `work_status`는 구현 상태, `status`는 OKF 문서 생명주기다.
- 문서를 수정하면 Bases는 같은 frontmatter를 읽는다. 표에 중복 데이터를 입력하지 않는다.
- `sources`·`generated` 같은 중첩 출처 메타데이터는 소스 모드에서 편집한다.

.base 문법과 속성 참조는 검증했지만 실제 Obsidian 앱에서의 화면 확인은 수행하지 않았다.

# 로컬 기획 RAG

Python 3.12 이상을 사용한다. 저장소 루트에서 Windows·macOS·Linux 공통 명령으로 실행한다. `python` 명령이 없는 환경은 `python3`를 사용한다.

```sh
python scripts/knowledge.py setup
python scripts/knowledge.py search "NFC 위치 인식 첫 MVP" --json
python scripts/knowledge.py search "사업안 선택" --accepted-only
python scripts/knowledge.py search "음성" --type Feature --phase MVP
python scripts/knowledge.py context "도록 자동 추출은 확정됐나?" --output docs/.rag/context.md
python scripts/knowledge.py verify
```

새 clone에는 가상환경과 인덱스가 없으며 setup이 로컬에 생성한다. 검색·검증에는 활성화 명령이나 API 키가 필요 없다. 생성한 `.rag/context.md`를 현재 사용하는 에이전트가 읽어 출처 있는 답변을 만든다. **검색·문맥 생성까지 로컬 실행하며 자동 LLM 호출·임베딩은 포함하지 않는다.** 외부 모델에 문맥을 보내는 것은 별도 사용 단계다. [RAG 예시](rag/example-answer.md).

Markdown 제목/문단을 청크로 나누고 한국어 2글자 조각과 단어를 이용한 BM25 검색을 쓴다. 의미 검색이 아니므로 유사 표현을 놓칠 수 있다. 기본 검색은 제안·미결정도 표시하며, 확정 결정만 찾을 때 --accepted-only를 쓴다.

# 갱신

1. 원문 변경/사용자 응답을 references에 기록.
2. decisions의 관련 결정을 갱신.
3. 기능별 phase·상세 명세와 우선순위 요약을 함께 수정.
4. log.md에 변경 이유를 남기고 `python scripts/knowledge.py verify` 실행.
5. diff를 검토하고 공유. verify는 check·회귀 테스트·build를 순서대로 실행하며 GitHub Actions도 PR/push에서 검사한다. search/context는 파일 변경을 감지하면 인덱스를 자동 재생성한다.

원문 스냅샷·템플릿·대시보드·생성 인덱스는 기본 RAG에서 제외한다. 프로젝트 기획과 실제 작가/관람객 데이터는 섞지 않는다. 제품용 RAG는 [별도 설계](specs/rag-design.md)다.

# 작성 템플릿

[기능 템플릿](templates/feature-template.md), [결정 템플릿](templates/decision-template.md), [일반 개념 템플릿](templates/concept-template.md)을 복사하고 고유 id·type·출처를 수정한다. accepted는 사용자 확정 또는 명시적으로 위임받아 채택한 결정에만 사용한다. 위임한 기술 선택에는 decision_basis를 기록한다. verified는 실제 검증을 수행했을 때만 부여한다. GitHub 공유 시 생성 인덱스·가상환경·개인 설정·키는 제외한다.
