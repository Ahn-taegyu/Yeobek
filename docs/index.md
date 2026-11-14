---
okf_version: "0.2"
---

# MAWD AI 도슨트 기획

- [사용법](README.md) — Obsidian 열기·검색 명령·갱신 방법.
- [에이전트 작업 절차](agent-workflow.md) — 새 환경 준비·OKF/Bases/RAG·출처를 보존하는 수정·자동 검증.
- [개발 협업 규칙](collaboration.md) — Commit·Branch·PR·worktree·위임 검토·인계 사례.
- [대시보드](dashboard.md) — 기능·결정·출처 Bases.

# MVP부터 읽기

- [백엔드 완성 작업 추적](specs/backend-completion.md) — W0~W8 상태와 의존 순서.

- [AI 하네스 PR3 재검토 요청](references/user-pr3-rereview.md) — 3~4단계 미적용 이유와 PR 재검토 요청 원문.

- [AI 하네스 플레이북 발전 검토](reviews/ai-harness-review-2026-11-13.md) — 기존 수정, 재현 원자료와 후속 계획의 범위.

- [AI 하네스 PR2 수정 검토](reviews/ai-harness-fix-review.md) — 재현 결함·검증 상태·후속 통합 조건.

- [제품 AI 플러그인과 품질 기준](specs/product-ai-plugin.md) — 스킬·도구·지침 조합, 작가 정리 후보·검수, 실제 품질 검증 경계.
- [다중 후보와 문맥 계승 검토](research/candidate-selection.md) — 병렬 생성·평가 하한·제한된 재생성·채택 대화 동기화 제안.

- [제품 AI 실행 하네스](specs/ai-harness.md) — 제공사 연결 준비·공개 문맥·출력 검증·재시도·평가와 실제 통합 경계.

- [검토 반영 확인서](reviews/mvp-foundation-fix-review-2026-11-13.md) — 수정 커밋을 직접 실행해 확인한 결과와 사용자 확인이 필요한 판단 3건.
- [개발 기반 작업 검토서](reviews/mvp-foundation-2026-11-13.md) — 12절에 검토 반영 결과·재검증·후속 범위, 1~11절에 초기 구현 증거와 재검토 이력.

- [개발 기반 현황](specs/development-foundation.md) — 실제 Next.js·Supabase 코드, 검증 범위와 다음 작업.
- [API 계약](specs/api-contract.md) — 초기 구현 경로와 후속 경로·입출력·오류.

- [우선순위](product/mvp-priorities.md) — 사용자 원안과 이번 단계.
- [기능명세 v1.0](specs/functional-spec.md) — 범위·권한·입력·상태·API 업무 계약.
- [화면 상세](specs/screen-spec.md) — 와이어프레임 기준이 되는 13개 논리 화면·버튼·표시 상태.
- [사용자 시나리오와 예외](specs/user-scenarios.md) — 19개 흐름·26개 예외·수용 기준.
- [통합 도슨트 채팅](specs/chat-interaction.md) — 해설·질문·작품 문맥과 독립적인 네 입출력 조합.
- [AI용 작가 지식](specs/artist-knowledge.md) — 내부 문서·출처·연결·승인 검색, 사용자용 위키와 구분.
- [기술 스택](specs/technology-stack.md) — Next.js·Supabase와 최신 AI 역할 권고, 입력/저장/API 경계.
- [기술 재검토](research/index.md) — Live/한국어 TTS·Supabase와 큰 파일·무료 PostgreSQL 서버·배포 대안.
- [최신 추천 스택과 AI 역할](research/recommended-stack.md) — Render 제외, 부드러운 관람 경험, 각 모델/API·비용·검증 순서.
- [개발 계획](product/delivery-plan.md) — 사전 개발·팀 역할·11/15 04:30 내부 목표.
- [검토 결과](product/review-findings.md) — 충돌·불필요한 복잡성·누락.
- [제품 방향](product/overview.md) — 사업안 비교·가설.
- [검증 계획](product/validation-plan.md) — 실측 방법·검증 한계.

# 개념 목록

- [기능 23개](features/index.md) — 기능별 우선순위·수용 기준·의존성.
- [결정](decisions/index.md) — 확정과 미결정.
- [설계](specs/index.md) — 데이터·제품 RAG·파트너·저장소.
- [출처](references/index.md) — 원문과 사용자 추가 응답.
- [RAG 예시](rag/example-answer.md) — 실제 검색 결과를 이용한 답변.
- [변경 이력](log.md) — 출처와 결정 변경 기록.

- [작가 해설 후보와 비교 평가](specs/narration-evaluation.md) — 사용자 확정 범위와 잠정 실행·평가 계약.

- [Notion P0 범위와 승인본 사용 결정](decisions/D-017-p0-feature-spec.md).
