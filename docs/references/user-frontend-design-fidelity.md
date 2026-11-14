---
type: Reference
id: SRC-056
title: 프런트 디자인 준수와 변경 가능한 모션·스타일
description: 사용자에게 필요한 화면 문구, 디자인에 없는 기능의 기록, 모션과 스타일 변경 기준.
status: stable
updated: '2026-11-14'
rag_include: false
generated:
  by: codex/gpt-6.1-sol
  at: '2026-11-14T15:35:00+09:00'
sources:
- id: artist-design
  resource: https://www.figma.com/design/IGPBnqMn7cLG2TTeYjXS1z/MAWD-6%ED%8C%80?node-id=176-331
  title: 작가 디자인
- id: visitor-design
  resource: https://www.figma.com/design/IGPBnqMn7cLG2TTeYjXS1z/MAWD-6%ED%8C%80?node-id=165-616
  title: 관람 디자인
evidence: user-stated
---

# 사용자 요청

> 프런트 개발할 때는 디자인 작업본에 없고 일반 유저가 알 필요없는 기술적, 절차적 내용은 UI에 포함하지마. 그리고 디자인 작업본의 구성을 최대한 따라가고 디자인에 누락되는 기능이 있다면 마음대로 넣지 말고 문서로 정리해. 그리고 전환되거나 움직이는 화면이나 요소는 페이드인 페이드 아웃이나 모핑으로 저연스럽게 모션이 있어야 하니 알아서 적용하면서 추후에 내가 추가, 수정, 삭제를 원하는 대로 할 수 있도록 유연성을 고려하여 작업해. 그리고 색, r값, 로고같은 것도 아직 바뀔 수 있으니 유연하게 개발해.
