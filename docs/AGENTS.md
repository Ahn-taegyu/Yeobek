---
type: Guide
id: GUIDE-003
title: docs 에이전트 진입 지침
description: 문서 작업 전에 적용할 검색·수정·검증 지침의 진입점.
status: stable
updated: '2026-11-13'
tags: [mawd, yeoback, agents]
rag_include: false
generated:
  by: codex/gpt-6
  at: '2026-11-13T02:07:34+09:00'
sources:
- id: request
  resource: /references/user-repository-handoff.md
  title: GitHub 공유와 에이전트 협업 요청
---

# 적용 범위

이 지침은 `docs/` 전체에 적용한다. 저장소 루트 `AGENTS.md`와 함께 [에이전트 작업 절차](agent-workflow.md)를 읽고 검색·수정·검증을 수행한다. 이 파일은 지침이며 제품 기능 근거로 검색되지 않는다.

# 반드시 지킬 것

1. 관련 문서를 검색하고 원문/출처를 확인한다. 확정 질문은 `--accepted-only`로 먼저 조회하되 제안/미결정 문서도 추가 확인한다.
2. 새 사용자 요구는 references에 기록하고 결정·기능·상세 명세·우선순위·목차·로그의 영향 범위를 반영한다. 오탈자 수정은 불필요한 새 결정을 만들지 않는다.
3. `status`, `decision_status`, `work_status`, `source_priority`, `proposed_phase`를 구별한다. 원안 우선순위를 현재 계획으로 덮어쓰지 않는다.
4. OKF 출처의 `/`는 이 docs 번들의 루트다. 본문은 Markdown 상대 링크를 쓴다. `index.md`/`log.md` 예외와 템플릿 사용법은 작업 절차를 따른다.
5. 수정 후 검증을 실행하고 검색 인덱스를 재생성한다. 원문 스냅샷·개인 데이터·키·생성물은 적절한 경계를 유지한다.

# 실행

저장소 루트에서는 `python scripts/knowledge.py setup`, `python scripts/knowledge.py search "검색어" --json`, `python scripts/knowledge.py verify`를 사용한다. 현재 폴더가 docs라면 `python ../scripts/knowledge.py ...`로 실행한다. 래퍼가 실제 실행 경로를 저장소 루트로 맞춘다. Python 이름이 `python3`이면 그 이름을 쓴다.
