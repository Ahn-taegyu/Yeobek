---
type: Reference
id: SRC-006
title: 사용자 확인 — 범위·팀·마감·API
description: 추가 응답으로 확정한 내용과 미확인 사항.
status: draft
updated: '2026-11-12'
tags:
- mawd
rag_include: false
generated:
  by: codex/gpt-6
  at: '2026-11-12T14:38:57+09:00'
sources:
- id: chat
  resource: /references/user-chat-interaction.md
  title: 사용자 통합 채팅·입출력 모드 요구
- id: direction
  resource: /references/user-build-direction.md
  title: 사용자 최신 개발 방향
evidence: user-confirmed
resource: conversation:user-answers/2026-11-12
---

# 확인된 사용자 응답

- 사업안: **아직 미정. 공통 도슨트 기능부터 개발**.
- 첫 인식 범위: **QR + 숫자 라벨**. NFC·위치 인식은 후속 검토.
- 팀: 기획 1명, 프런트 보조 1명, 디자인 1명, 사용자 1명(프런트·백엔드·AI 개발). 총 4명이며 핵심 개발은 한 명에게 집중.
- 마감: 일요일 아침. 현재 날짜와 행사 일정에 따라 **2026-11-15 아침**으로 해석한다. 정확한 제출 시각은 아직 미확인.
- 최초 응답 당시 기술 스택: 미확정. 이후 사용자가 선정을 위임했으며 [현재 결정](../decisions/D-008-technology-stack.md)을 따른다.
- 해커톤: **제공 API 중 최소 한 개 이상 필수**. API는 행사 당일 제공.
- 안내에는 스티비·라이너·Alt·채널톡, 추가 Articul8 AI·LG Aimers·VAPI 정보가 있다. 모든 도구를 쓸 필요는 없다.

# 제공된 안내 링크

- [공식 행사](https://luma.com/ml5gw54p)
- [라이너 행사 가이드](https://app.notion.com/p/Liner-API-MAWD-412395215ea481d79546d1b67ffcae87?source=copy_link)
- [Alt 소개](https://www.altalt.io), [발표자료](https://alt-university-deck.vercel.app)
- [스티비 개발자](https://developers.stibee.com), [llms.txt](https://developers.stibee.com/llms.txt)
- [채널톡 앱스토어](https://docs.channel.io/help/ko/articles/앱스토어란-dcbf543d)
- [Articul8 Bivia](https://docs.articul8.ai/bivia/), [홈페이지](https://articul8.ai/bivia)
- [LG Aimers 안내](https://www.lgresearch.ai/news/view?seq=754), [EXAONE 가이드](https://docs.exaone.ai)
- [VAPI 가입 안내](https://dashboard.vapi.ai/?coupon-code=obavapi26)
- [스티비 로그인](https://stibee.com/login)

사용자 전달 안내의 사전 가입 기한은 11월 11일이다. 가입 완료·크레딧 지급 여부는 확인하지 않았으며 과거 기한을 새 마감으로 제시하지 않는다. 계정 가입·메시지 발송은 수행하지 않았다.

# 아직 미확인

정확한 제출 시각, 실제 키의 모델·한도, 장기 PDF 자동화 수준. 기획 초안 속 권고나 제약을 사용자에게 확인된 사실로 바꾸지 않는다.

# 후속 응답 — 자료와 PDF

사용자는 **시연 작가 자료·협조 작가·전시가 아직 없다**고 답했다. PDF의 작품 이미지와 설명이 함께 있을 때도 추출 방식에 차이가 있는지 질문했으며, 도록 자동화 수준을 선택한 것은 아니다.

설명한 차이: 텍스트 선택 가능한 PDF는 글 추출, 스캔 PDF는 OCR이 필요하다. 사진과 설명의 페이지 내 배치·다음 쪽 연결·복수 작품 여부에 따라 작품 연결 난도가 달라진다. 한 페이지 한 작품은 쉬운 경우이나 실제 샘플 없이는 자동 추출 범위를 확정할 수 없다. 이는 assistant의 기술 설명이며 사용자 결정이 아니다.

# 후속 확정 — 개발 준비

사전 개발이 가능하고 사용 가능한 OpenAI API 키가 있다고 확인했다. 이미지 부분 선택·카메라 후순위와 기술 선택 위임까지 [최신 응답](user-build-direction.md)에 보존한다. 키의 실제 호출·잔액은 확인하지 않았다.

# 후속 확정 — 관람객 채팅

사용자는 이후 해설과 질의응답을 하나의 채팅에서 처리하고 텍스트/음성 입력과 출력을 각각 선택한다고 명시했다. 상세 원문과 이미지·카메라 후속 질문은 [별도 출처](user-chat-interaction.md)에 보존한다.
