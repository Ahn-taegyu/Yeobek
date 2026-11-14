---
type: Research
id: RES-009
title: 작가 참고 파일 읽기 제공사와 실행 경계
description: 텍스트 PDF 로컬 추출·스캔 PDF와 참고 이미지 모델 입력의 공식 규격 및 모의 검증 범위.
status: draft
updated: '2026-11-14'
tags: [yeobek, materials, ai]
rag_include: true
generated:
  by: codex/gpt-6
  at: '2026-11-14T16:20:00+09:00'
sources:
- id: request
  resource: /references/user-backend-author-parallel-plan.md
  title: 작가 흐름 병렬 계획과 파일 읽기 요청
- id: liner
  resource: https://liner.com/developers/docs/liner-model-api-chat-completions
  title: Liner Chat completions의 이미지·PDF 입력
- id: pdfjs
  resource: https://github.com/mozilla/pdf.js/blob/master/examples/node/getinfo.mjs
  title: PDF.js Node 문서 읽기 예제
- id: openai
  resource: https://developers.openai.com/api/docs/guides/file-inputs
  title: OpenAI Responses 파일 입력
---

# 선택과 근거

2026-11-14 공식 규격 확인 기준이다. 텍스트 PDF는 정확히 고정한 `pdfjs-dist@6.5.438`의 legacy Node 모듈로 글자를 추출한다. 프로젝트의 Node 24.15.0과 맞추며 OCR 라이브러리는 추가하지 않는다. 그림이 있지만 글자가 없는 페이지가 있으면 전체 파일을 모델 읽기로 보낸다. 완전히 빈 PDF는 빈 결과이며 모델을 부르지 않는다. 일부 글자가 있는 페이지 안에 스캔 글이 함께 섞인 경우 모든 시각적 글을 복원한다고 보장하지 않는다.

Liner 공식 Chat completions는 inline base64 이미지와 PDF를 지원한다. PDF는 catalog 모델에 보내야 하므로 기본 `AI_ROUTE_MATERIAL=liner:google/gemini-3.8-flash`로 선택했다. 이미지 content part는 `image_url`, PDF는 `file.file_data`·고정 filename을 쓰며 `store:false`다. 원격 URL이나 제공사 file ID는 받지 않는다. OpenAI Responses의 `input_image`·`input_file` 형식도 어댑터에 준비했으며 명시적 설정으로만 전환한다. Exaone의 미확인 파일 입력은 거부한다.

# 비용·신뢰 경계

- `materialExtraction` 기본 off. 작가가 학습 버튼에서 명시적으로 동의한 POST만 읽는다. 업로드·GET은 외부 호출하지 않는다.
- 업로드가 검증한 비공개 Storage 파일을 다시 다운로드하고 바이트 수·SHA256을 비교한다. 기존 이미지3MiB/PDF6MiB를 유지한다.
- `material_extraction_max_pages` 기본20, 기술 상한20쪽. 텍스트 추출15초, 모델 기본 호출30초, 읽기50초, HTTP 전체130초 취소 신호/150초 호스트 제한. 한 모델 응답은8192 output tokens로 제한한다. 긴 문서의 잘린 응답은 성공으로 저장하지 않는다.
- owner+파일 해시+모의 여부별 1회 예약이다. 같은 해시 요청은 결과를 공유하며 다른 작가와 공유하지 않는다. 실패·시간 초과도 자동 재시도하지 않는다. 모의 캐시는 실제 읽기를 대신하지 않는다.
- 추출1회와 후속 W2 정리1회는 각각 작가 일일 작업 한도에 포함한다. 텍스트 추출 자체는 모델0회이나 W2 분류는 별도 모델 호출이다.
- 추출 원문은 비공개 캐시에만 보관한다. 작업 요약·로그·공개 응답에 원문을 기록하지 않는다. 유효한 동일 해시 원본이 모두 사라지면 정리 작업이 본문을 비우고 해시 tombstone을 보존한다. 이후 같은 바이트를 재업로드해도 자동 재추출하지 않는다.
- 파일 읽기는 문서 revision과 독립된 결과다. 문서가 바뀌면 W2 생성·적용의 revision/지문 검사가 충돌을 거부한다. 기본 off는 새 읽기 실행을 막으며 이미 요청해 저장한 자료 연결을 삭제하지 않는다.

# 후보·검수

추출은 자동 승인·게시가 아니다. 파일 ID와 PDF 쪽 범위를 W2 sourceRef로 전달하고 작가가 후보를 검토해 명시적으로 적용한다. 이미지에는 기존 문서 계약상 PDF 쪽 필드를 넣지 않는다. 작품 사진·프로필 사진·전시 포스터는 읽기 대상에서 제외한다. 그림과 작품의 자동 매칭도 하지 않는다.

추출 결과는 최대200,000자이지만 한 W2 후보 문맥은 기존12개/8,000자 한도를 유지한다. 모든 쪽의 내용이 후보에 포함됐다고 표시하면 안 된다. 실제 파일 읽기·분류 정확도는 미검증이며 스캔 모의 결과는 실제 파일 내용이 아니라는 표기를 포함한다. 승인된 글로 공개하고 관람 답변 때 TTS를 만드는 정책은 이 기능과 별개다.

# 확인한 것과 남은 것

부모가 실제 생성한 텍스트·빈·혼합 PDF, 모의 이미지/스캔, 파일·페이지 상한과 잘못된 모델 출력 거부를 검사했다. 제공사 HTTP는 가짜 fetch 응답으로 payload 형태를 확인했다. 기존 DB 전진 적용과 pgTAP29개, RPC 권한 목록1개를 소유 컨테이너에서 확인했다. 별도 Sol SQL 검토의 캐시 모드/동일 해시 alias/typed scope/NULL 검증/이미지 쪽 범위 지적을 적용 전에 수정했다.

전체 HTTP·빌드·타입·새 DB 회귀는 최신 PR CI 확인 전이다. 실제 외부 AI 호출0회, 실물 한국어 읽기 품질·비용·지연·프런트 후보 화면은 완료 범위가 아니다. [API 계약](../specs/api-contract.md#파일-읽기와-w2-후보)과 [프런트 인계](../specs/frontend-handoff.md#파일-읽기--a-담당)를 함께 본다.
