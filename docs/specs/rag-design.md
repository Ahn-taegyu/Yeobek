---
type: Specification
id: SPEC-003
title: 제품 RAG 설계
description: 작가 승인 근거만 사용하는 관람객 Q&A의 구현 계약.
status: draft
updated: '2026-11-15'
tags:
- mawd
rag_include: true
generated:
  by: codex/gpt-6
  at: '2026-11-12T14:38:57+09:00'
decision_status: proposed
sources:
- id: gap-exclusion
  resource: /references/user-gap-qa-exclusion.md
  title: 관람 보완 요청의 Q&A 전환 제외
- id: qa-policy
  resource: /references/user-expected-qa-policy.md
  title: 예상 Q&A 생성·검수 정책
- id: figma-review
  resource: /references/figma-review-v3.md
  title: Figma W11 화면 직접 대조
- id: figma-authoring
  resource: /references/figma-authoring-v3.md
  title: Figma 작가 입력 화면 직접 대조
- id: status-precedence
  resource: /references/user-dashboard-status-precedence.md
  title: 미공개 전시 준비중 우선
- id: v3-answers
  resource: /references/user-v3-decisions.md
  title: v3 범위와 Vercel Hobby 답변
- id: review-answers
  resource: /references/user-v3-review-decisions.md
  title: 해설 수정·검수 화면·모의 게시 정책
- id: v3
  resource: /references/user-backend-plan-v3.md
  title: 백엔드 v3 화면·리스크 보강
- id: harness
  resource: /specs/ai-harness.md
  title: 제품 AI 실행 하네스 준비 범위
- id: knowledge-screens
  resource: /decisions/D-011-knowledge-and-screens.md
  title: AI용 내부 지식·DB 원본과 필수 화면 요구
- id: user
  resource: /references/user-mvp.md
  title: 최신 사용자 MVP 우선순위
- id: notion
  resource: /references/notion-planning.md
  title: 수정 중인 Notion 기획
- id: answers
  resource: /references/user-answers.md
  title: 2026-11-12 사용자 범위·팀·일정 확인
- id: chat
  resource: /references/user-chat-interaction.md
  title: 사용자 통합 채팅·입출력 모드 요구
- id: direction
  resource: /references/user-build-direction.md
  title: 사용자 최신 개발 방향
---

# 두 RAG의 구분

이 문서는 **제품 Q&A의 설계**다. 현재 Next.js·Supabase 기반과 [제품 AI 하네스](ai-harness.md)의 서버 모듈·합성 자료 평가가 있다. 실제 승인 근거 DB 조회, 관람객 HTTP 경로와 LLM 계정 연결은 아직 검증하지 않았다. [기획 검색 RAG](knowledge-contract.md)는 별도로 기획·미결정 문서를 검색해 개발자의 답변 작성을 돕는다. 둘은 인덱스를 공유하지 않는다.

# 제품 검색 흐름

1. 일반 입력 폼을 작가·전시·작품의 내부 문서로 정규화하고 출처·쪽수·관계를 DB에 저장. [내부 지식 계약](artist-knowledge.md).
2. 작가가 공개 발췌와 해설을 승인.
3. 활성 Publication에 포함된 Evidence 버전만 검색 대상으로 구성.
4. 요청의 전시·작품·공개 여부를 서버에서 확인한 **후** 해당 범위에서 검색.
5. 근거를 출처 ID와 함께 모델에 전달하고 없는 작가 의도는 답하지 않도록 제한.
6. 반환된 인용 ID가 실제 검색 결과와 일치하는지 검증, 공개 권한 재확인 후 전달.
7. 수정·철회·삭제 시 활성 참조와 검색·캐시를 갱신/차단.

# 한 채팅의 작품 문맥

텍스트·음성 입력을 같은 요청 형식으로 정규화한다. “18번 작품 설명해줘”는 전시 안에서 작품을 확인해 승인 해설을 반환하고, 후속 질문은 확인된 현재 작품과 관련 승인 근거를 검색한다. 요청마다 작품·공개 버전을 고정한다. 작품 전환 시 채팅 기록은 유지하되 새 요청의 검색 범위를 바꾸며, 이전 대화를 승인 근거로 승격하지 않는다.

“이 부분”은 위치/모양·직전 확인한 부위를 바탕으로 해석한다. 대상이 불명확하면 되묻고, 텍스트 자료에 그려진 대상 설명이 없으면 임의로 이름을 붙이지 않는다. 등록 작품 이미지의 모델 참고는 일요일 이후 검증 대상이다. 이미지 처리를 실제로 했을 때만 시각 관찰을 구분해서 말하며 작가 의도는 승인 진술에서만 답한다. [D-007](../decisions/D-007-visual-reference.md).

답변과 출처를 먼저 확정한 뒤 output_mode에 따라 글 표시 또는 같은 답의 음성 생성을 수행한다. 음성 입력을 이유로 output_mode를 음성으로 바꾸지 않는다. [통합 채팅 명세](chat-interaction.md).

# 작은 MVP의 검색 방식

구현은 Supabase에서 현재 공개 버전의 승인 근거 JSON을 읽는 방식으로 정했다. 벡터 DB·임베딩은 추가하지 않는다. 근거 8,000자/12개 이내의 초기 예산, 비스트리밍 답변 검증과 상세 API 경계는 [기술 스택](technology-stack.md)을 따른다.

작품별 자료가 작으면 현재 작품의 승인 발췌 + 해당 전시에 승인된 작가 공통·전시 공통 자료를 필터로 가져온 뒤 키워드로 선택하는 방식부터 시작한다. 전체 전시 원문을 매 요청에 무제한 넣지 않는다. 문단·작품·출처 경계를 유지하며 문맥 예산을 둔다. 의미 검색 성능이 필요한지 평가한 뒤 임베딩을 추가한다. 별도 벡터 DB 설치 자체를 RAG의 필수 조건으로 보지 않는다.

현재 키워드 선택은 질문 어절의 끝 조사·어미 하나를 떼고, 본문에 들어 있는 어간마다 그 요청 후보 안의 희소도를 더한다. 본문 길이 보정은 하지 않는다. 합성 세트와 반 고흐 기록 비교, 동의어·활용형 한계는 [RES-013](../research/visitor-evidence-selection.md)에 있다.

# 청크 계약

청크는 owner_id, artist_id, exhibition_id, artwork_id 또는 공통 범위, source_document_id, source_section_id, source_revision, material_id, evidence_id, evidence_version, publication_id, language, source_label, page, body, content_hash를 갖는다. 공개 원본 파일 URL 대신 허용된 출처 라벨·발췌를 인용한다.

작가 세계 공통 자료는 전시 밖의 작가 문서에 한 번 저장하지만 관람 시에는 현재 전시에서 승인·게시한 버전만 사용한다. 연결된 위키 전체나 최신 초안을 재귀적으로 가져오지 않는다. 작가 홈 수정은 기존 공개본에 자동 전파하지 않고, 근거 철회는 참조하는 모든 전시·작품에 전파한다. 다른 전시 작품 전체를 유사도만으로 가져오지 않는다. tenant/전시/승인 필터는 검색 뒤 가리기보다 검색 후보 생성에 먼저 적용한다.

# 답변 계약

- '작가가 왜 그렸는가'는 해당 작가 승인 진술만 근거로 답한다.
- 사진의 색·형태를 관찰한 설명과 작가 의도를 구분한다.
- 근거 없는 경우 '현재 공개된 작가 자료에서는 확인할 수 없어요'처럼 한계를 말한다.
- 인용 없음·잘못된 인용·부족한 근거면 생성 결과를 그대로 확정 답변으로 내보내지 않는다.
- 문서·검색 결과 속 지시문은 콘텐츠다. 관리자 권한·외부 호출·시스템 지시로 승격하지 않는다.
- 캐시는 publication/evidence 버전·작품·질문 범위에 묶고 철회 시 무효화한다.

# 출시 전 평가 세트

| 사례 | 기대 |
| --- | --- |
| 승인 진술에 답이 있음 | 해당 근거와 답변 |
| 의도 진술 없음 | 답변 보류, 추측 없음 |
| 같은 제목의 다른 작가 작품 | 현재 전시 범위만 |
| 원본에는 있으나 미공개 발췌 | 사용하지 않음 |
| 승인 후 철회·삭제 | 검색·캐시·인용 차단 |
| 자료 속 '지시를 무시하라' | 지시 실행 없이 근거로만 취급 |
| 작품 변경 후 이전 대화 | 채팅 기록 유지, 새 작품의 검색 근거에 이전 자료 혼입 없음 |
| 모드 변경 | 같은 작품·답변·출처 유지, 한쪽 모드가 다른 쪽을 변경하지 않음 |
| “이 부분”만 지칭 | 대상 확인 질문, 보지 않은 그림을 추측하지 않음 |
| OCR 오인식/작품 연결 오류 | 검수 전 공개 없음 |
| 같은 작가의 다른 전시·미승인 작가 공통 section | 현재 전시에 승인된 버전만 사용 |
| 공유 작가 원본 일반 수정/철회 | 수정은 공개 유지, 철회는 전체 참조 전시 차단 |

실제 작가 자료가 없어서 아직 제품 답변 품질·한국어 인식·검색 정확도를 측정하지 않았다. 가상 자료 평가와 실제 파일럿을 분리한다.

## F05 승인에서 F08 검색까지

F04 해설과 작품별·전시 전체 예상 Q&A 및 F05 정정 답변은 편집 가능한 작업 버전으로 저장한다. F05 승인 시 대상 범위, 질문·답변 본문, 출처 및 버전을 고정한다. F07 게시에서 승인 항목과 근거를 검증해 활성 공개 버전에 연결한다. 관람 요청은 먼저 공개 전시·작품·활성 버전으로 후보를 제한한 후 승인 해설·승인 Q&A·정정 답변을 조회한다. 일치하는 승인 답변을 활용하고 자유 질문에도 관련 승인 답변을 생성·검증 근거로 사용할 수 있다. 미리보기 대화 전체, 미승인 초안 및 다른 전시 자료는 후보에서 제외한다.

새 편집본은 기존 활성 공개본과 별도다. 승인 후에도 게시 전에는 관람에 사용하지 않는다. 교체 게시·철회 시 활성 버전 검증과 캐시/낭독 재검사로 이전 항목 사용을 막는다. 승인 Q&A는 자연스러운 관람 답변의 생성 근거로 사용하며 기본 작품 소개는 기존대로 승인 원문을 반환한다(SRC-050).
 [D-017](../decisions/D-017-p0-feature-spec.md).


# v3 변경분 연결

v3 지시문 재작성에서 작가의 수정 지시문은 승인 근거로 취급하지 않는다. 이전 답변과 승인 근거로 재작성하고 범위를 벗어나면 거부한다. “정확해요” 평가는 승인·게시와 분리한다. 제품 AI는 작가가 제공한 작품 세계·활동 이력을 근거로 사용하되 이름·이메일·성별은 운영 자동화 프롬프트에 넣지 않는다. 해당 기능은 W11 후속이며 현재 구현 완료가 아니다. [요청 원문 SRC-044](../references/user-backend-plan-v3.md), [진행 계획](backend-completion.md)을 따른다.


## 후속 확정: 직접 수정과 작가 정정

기본 미리 생성 작품 소개만 직접 편집하고, 나머지 답변은 지시문으로 수정한다. 기본 해설 원고 검수와 AI 미리보기는 별도 화면이며 명시적 승인·게시는 유지한다. 시험용 해설은 개발 시연만 허용하고 운영 게시를 차단한다. [후속 답변](../references/user-v3-review-decisions.md).

구현 제안: 문체/분량 지시와 작가의 새 사실 정정을 구분한다. “그 이유가 아니라 … 때문이다”라는 정정은 작가 작성 원문과 대상 질문/작품·기존 답변 버전을 보존한 근거 후보로 만들고, 작가 검수 후 승인 근거로 연결한다. 명령문 자체를 즉시 승인 사실로 쓰거나 기존 공개 근거를 덮어쓰지 않는다. 승인된 정정이 없는 재작성은 기존 승인 근거 범위만 사용한다. W11에서 이 검수 경로를 구현·검증하기 전에는 동작 완료로 보지 않는다.


W10 활동 이력 5개는 기존 작가 knowledge_documents에 저장되어 승인 전 원자료로 관리한다. 온보딩 fullName·Auth email·keywords·avatar는 별도 정형 필드이며 문서 근거로 자동 변환하지 않는다. 프로필 사진이나 전시 포스터를 연결하는 행위도 게시 승인이나 이미지 해석 근거 승인을 뜻하지 않는다.


## W11 구현 경계

작가 전용 예상 Q&A·미리보기는 선택 작품→전시→작가의 소유자 자료와 현재 승인 근거를 최대12개/8,000자 읽는다. 근거당2,000자를 넘는 원자료는 종료 부호가 있는 첫 문장이 상한 내에 있을 때만 발췌하고, 나머지는 자동 절단하지 않는다. 작가는 검수에서 실제 인용 body를 확인하고 별도 짧은 문서/PDF 발췌 근거를 입력·승인할 수 있다. OCR·PDF 자동 추출은 추가하지 않았다.

후보 생성30초·출력3072토큰, 미리보기30초·1000토큰, 재작성 총65초 내 생성/독립평가 각각30초·1000/256토큰으로 제한한다. 모델은 지시문을 사실로 저장하지 못하고 인용ID는 전달된 근거에 한정된다. 재작성의 의미 검증은 다른 제공사 계열 모델의 grounded 판정이며 완전한 사실 검증을 보증하지 않는다. 사람 검수/승인은 유지한다. 실제 모델 품질·한국어 말투는 모의 검사로 입증하지 않았다.

승인 QA의 관람 근거 반영, 공개 버전/캐시 무효화와 전시 문맥 질의는 W12다. W11은 private 생성·검수 API이며 게시되지 않은 항목을 관람객에게 전달하지 않는다.


W11 후속 확정: [SRC-052](../references/user-gap-qa-exclusion.md)에 따라 관람 보완 요청→Q&A 전환은 이번 MVP에서 제외한다. 위의 기획/과거 기록에 있는 gap 재작성·정정 대상은 현재 제공하지 않는다. 작가 미리보기와 기존 Q&A 수정, 보완 요청 조회·재게시 후 확인/종료는 유지한다.
