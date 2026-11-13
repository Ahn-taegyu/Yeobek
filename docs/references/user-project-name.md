---
type: Reference
id: SRC-019
title: 프로젝트 이름을 Yeobek으로 정정
description: 현재 프로젝트 이름의 영문 표기를 Yeobek으로 통일하라는 사용자 요청.
status: stable
updated: '2026-11-13'
tags: [yeobek, naming]
rag_include: false
generated:
  by: codex/gpt-6
  at: '2026-11-13T14:49:32+09:00'
sources: []
---

# 사용자 요청

> yeoback이 아니라 Yeobek으로 바꿔

# 적용 범위

현재 프로젝트·저장소·앱의 영문 표시 이름은 **Yeobek**이다. 문서 제목과 본문, 에이전트 진입점, clone 안내, 앱 헤더에 적용한다. 패키지·태그·파일명처럼 소문자를 사용하는 식별자는 `yeobek`을 쓴다.

과거 사용자 발언과 원문 스냅샷, 당시 변경 이력은 보존한다. 공유된 migration의 내부 `yeoback_private` 스키마는 기존 함수 참조와 적용된 DB의 호환성을 위해 유지하며, 현재 제품 이름을 뜻하지 않는다. 이 요청으로 DB를 초기화하거나 기존 migration을 다시 쓰지 않는다.
