---
type: Reference
id: SRC-043
title: 작가 기본 작품 세계 세부 질문지
description: 사용자가 W10 입력 항목으로 전달한 Notion 작가 질문지와 적용 경계.
status: stable
updated: '2026-11-14'
tags: [yeobek, requirements, authoring]
rag_include: false
generated:
  by: codex/gpt-6-astra
  at: '2026-11-14T12:31:00+09:00'
sources:
- id: questionnaire
  resource: https://app.notion.com/p/417edb78a3fd80a0a461ff2fafc5513c
  title: Notion 작가 질문지
- id: p0
  resource: /references/user-p0-feature-spec.md
  title: 최신 P0 명세와 사용자 보완
evidence: user-stated
---

# 전달 맥락

W10의 작가 기본 작품 세계 항목에 대해 사용자는 “정해 둔 세부 질문 목록을 전달”을 선택한 뒤 위 Notion 링크를 보냈다. Notion 연결 도구로 제목과 아래 본문을 읽었다. 응답의 마지막 편집 시각은 `2026-11-13T09:34:02.324Z`, verification은 unverified다. 이 표시는 제품 검증 여부와 다르다.

작가 공통 질문 7개를 개별 답변으로 저장한다. 두 “표현 방식” 행은 질문 내용이 달라 같은 필드로 합치지 않는다. 기존 bio/practice 데이터는 보존한다. 새 필수 정책을 이 전달로 추정하지 않으며, 전시/작품 선택·부분 저장은 더 최신인 D-017 및 사용자 보완을 유지한다. 화면·API 구현 완료 기록이 아니다.

# 받은 본문 스냅샷

```text
Here is the result of "fetch" for the Page with URL https://app.notion.com/p/417edb78a3fd80a0a461ff2fafc5513c as of 2026-11-13T09:34:38.519Z:
<page url="https://app.notion.com/p/417edb78a3fd80a0a461ff2fafc5513c">
<ancestor-path></ancestor-path>
<properties>
{"title":"작가 질문지"}
</properties>
<iconMetadata>null</iconMetadata>
<content>
---

<p />

<toggle heading="h2">
기본 작가 정보

회원가입 후 등록 가능

(선택) 구분

<table>
<colgroup>
<col width="161" />
<col width="351" />
</colgroup>
<tr>
<td>
항목(진한 글씨)
</td>
<td>
질문(회색이)
</td>
</tr>
<tr>
<td>
작업 계기
</td>
<td>
작품 활동을 시작하게 된 계기는 무엇인가요?
</td>
</tr>
<tr>
<td>
핵심 관심사
</td>
<td>
작품 활동을 통해 지속적으로 탐구하는 주제나 관심사는 무엇인가요?
</td>
</tr>
<tr>
<td>
예술관 및 철학
</td>
<td>
작품을 만들 때 가장 중요하게 생각하는 가치나 철학은 무엇인가요?
</td>
</tr>
<tr>
<td>
표현 방식
</td>
<td>
주로 사용하는 재료, 기법 또는 표현 방식은 무엇인가요?
</td>
</tr>
<tr>
<td>
표현 방식
</td>
<td>
위 표현 방식을 선택한 이유는 무엇인가요?
</td>
</tr>
<tr>
<td>
영감의 원천
</td>
<td>
작품의 아이디어나 영감은 주로 어디에서 얻으시나요?
</td>
</tr>
<tr>
<td>
소통
</td>
<td>
관람객이 작가의 작품을 통해 어떤 경험을 하거나 질문을 떠올리기를 바라시나요?
</td>
</tr>
</table>
</toggle>

<toggle heading="h2">
전시 정보

기존 전시 정보 질문에 추가

<table>
<colgroup>
<col width="161" />
<col width="279" />
</colgroup>
<tr>
<td>
항목(진한 글씨)
</td>
<td>
질문(회색이)
</td>
</tr>
<tr>
<td>
전시 기획 배경
</td>
<td>
이번 전시를 기획하게 된 계기나 배경은 무엇인가요?
</td>
</tr>
<tr>
<td>
전시 구성(선택)
</td>
<td>
전시 공간이나 작품의 배치에 특별한 의도가 있나요? 
</td>
</tr>
<tr>
<td>
관람 안내(선택)
</td>
<td>
관람객이 알아야 할 특별한 안내 사항이 있나요? 
</td>
</tr>
</table>
</toggle>

<toggle heading="h2">
전시별 작품세계

선택 입력

<table>
<colgroup>
<col width="161" />
<col width="279" />
</colgroup>
<tr>
<td>
항목(진한 글씨)
</td>
<td>
질문(회색이)
</td>
</tr>
<tr>
<td>
핵심주제
</td>
<td>
이번 전시에서 특별히 집중하거나 탐구하는 주제는 무엇인가요?
</td>
</tr>
<tr>
<td>
기존 작품세계와의 연결
</td>
<td>
이번 전시는 작가님의 기존 작품세계와 어떤 관계가 있나요?
</td>
</tr>
<tr>
<td>
전달 메시지
</td>
<td>
이번 전시를 통해 관람객에게 가장 전달하고 싶은 메시지는 무엇인가요
</td>
</tr>
<tr>
<td>
전시의 차별점
</td>
<td>
이전 작업이나 전시와 비교했을 때 이번 전시만의 특징은 무엇인가요?
</td>
</tr>
<tr>
<td>
감상 관점
</td>
<td>
관람객이 이번 전시를 감상할 때 특별히 주목했으면 하는 부분이 있나요?
</td>
</tr>
<tr>
<td>
감정 및 경험
</td>
<td>
관람객이 전시를 관람하면서 어떤 경험을 하기를 바라시나요?
</td>
</tr>
</table>
</toggle>

<toggle heading="h2">
작품 정보

기본 정보

<table>
<colgroup>
<col width="161" />
<col width="279" />
</colgroup>
<tr>
<td>
항목(진한 글씨)
</td>
<td>
질문(회색이)
</td>
</tr>
<tr>
<td>
작품명
</td>
<td>
작품의 제목을 입력해 주세요.
</td>
</tr>
<tr>
<td>
작품 이미지(선택)
</td>
<td>
작품 이미지를 등록해 주세요.
</td>
</tr>
<tr>
<td>
제작 연도
</td>
<td>
작품의 제작 연도를 입력해 주세요.
</td>
</tr>
<tr>
<td>
재료 및 기법
</td>
<td>
작품에 사용된 재료와 기법을 입력해 주세요.
</td>
</tr>
<tr>
<td>
작품 크기
</td>
<td>
작품의 크기를 입력해 주세요.
</td>
</tr>
<tr>
<td>
작품 소개
</td>
<td>
이 작품을 소개해 주세요.
</td>
</tr>
</table>

작품에 담긴 이야기

<table>
<colgroup>
<col width="161" />
<col width="279" />
</colgroup>
<tr>
<td>
항목(진한 글씨)
</td>
<td>
질문(회색이)
</td>
</tr>
<tr>
<td>
제작 계기
</td>
<td>
이 작품을 제작하게 된 계기나 영감은 무엇인가요?
</td>
</tr>
<tr>
<td>
작품의 의미
</td>
<td>
이 작품을 통해 표현하거나 탐구하고자 한 것은 무엇인가요?
</td>
</tr>
<tr>
<td>
표현 요소
</td>
<td>
색채, 형태, 소재, 구도 등에서 특별한 의미를 담은 요소가 있나요?
</td>
</tr>
<tr>
<td>
제작 과정
</td>
<td>
작품을 제작하면서 특별히 기억에 남는 과정이나 어려움이 있었나요?
</td>
</tr>
<tr>
<td>
감상 포인트
</td>
<td>
관람객이 이 작품을 감상할 때 주목했으면 하는 부분은 무엇인가요?
</td>
</tr>
<tr>
<td>
전시와의 연결
</td>
<td>
이 작품은 이번 전시의 전체 주제와 어떻게 연결되나요?
</td>
</tr>
</table>
</toggle>

<p />
</content>
</page>
```

