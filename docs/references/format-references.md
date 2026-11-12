---
type: Reference
id: SRC-005
title: 저장소 형식 근거
description: OKF 0.2와 Obsidian Bases 공식 문서.
status: draft
updated: '2026-11-12'
tags:
- mawd
rag_include: false
generated:
  by: codex/gpt-6
  at: '2026-11-12T13:31:41+09:00'
sources:
- id: okf
  resource: https://github.com/GoogleCloudPlatform/open-knowledge-format/blob/main/SPEC.md
  title: OKF v0.2
- id: bases
  resource: https://help.obsidian.md/bases/syntax
  title: Bases syntax
evidence: official-documentation
---

# 형식

OKF 0.2 명세를 확인했다. 개념은 YAML frontmatter와 Markdown으로 저장하고 출처·생성 이력을 보존한다. 루트 index.md는 okf_version만 갖는다. 확정 여부는 별도 프로젝트 속성이다.[^okf]

Bases는 Markdown 속성을 표로 보여주는 조회 화면이다. .base 파일에 필터와 뷰를 저장하며 자체 검색·답변 엔진은 아니다.[^bases]

# 공식 링크

- [OKF 명세](https://github.com/GoogleCloudPlatform/open-knowledge-format/blob/main/SPEC.md)
- [Bases 구문](https://help.obsidian.md/bases/syntax)
- [Bases 함수](https://help.obsidian.md/bases/functions)

조회일: 2026-11-12. 추가 규칙은 [지식 구조](../specs/knowledge-contract.md).

[^okf]: Open Knowledge Format v0.2.
[^bases]: Obsidian Bases 공식 도움말.
