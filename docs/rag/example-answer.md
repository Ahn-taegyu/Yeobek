---
type: Example
id: RAG-001
title: 기획 RAG 검색·답변 예시
description: 실제 로컬 검색 결과로 확정과 미결정을 구분한다.
status: draft
updated: '2026-11-12'
tags:
- mawd
rag_include: false
sources:
- id: recognition
  resource: /decisions/D-002-recognition.md
  title: QR·숫자 우선 사용자 결정
- id: pdf
  resource: /decisions/D-004-input-contract.md
  title: 도록 입력 미결정
generated:
  by: codex/gpt-6
  at: '2026-11-12T13:31:41+09:00'
---

# 실행한 검색

```powershell
docs/.venv/Scripts/python.exe docs/tools/kb.py context "NFC 위치 인식은 첫 MVP에 포함하나요?" --accepted-only --top-k 3 --output docs/.rag/recognition-context.md
```

2026-11-12 실제 실행 결과의 C1은 D-002의 '내용', C2는 D-002의 '남은 사항'이었다. 검색 자료의 decision_status는 accepted였다. 자동 모델 호출 없이 이 대화의 Codex가 해당 문맥을 읽고 아래 답변을 작성했다.

# 근거로 작성한 답변

첫 MVP의 작품 인식은 **QR과 숫자 라벨**이다. NFC와 위치 인식은 후속 검토로 옮기기로 사용자가 결정했다.[C1] NFC는 같은 작품 URL을 여는 방식부터 검토할 수 있고, 위치 인식은 장소·장치·필요 정확도를 정의한 뒤 재평가한다.[C2]

- [C1: 사용자 결정](../decisions/D-002-recognition.md#내용)
- [C2: 후속 검토 조건](../decisions/D-002-recognition.md#남은%20사항)

# 미결정 검색 확인

실행 질의: `도록 자동 추출 OCR 미결정`. 상위 결과는 F-002의 지원 범위 미정과 D-004의 PDF 접수/자동 처리 구분이었다. 따라서 **스캔 OCR이나 작품 자동 연결이 이미 MVP 필수로 확정되었다고 답할 수 없다.** 실제 샘플을 확보해 지원 범위를 결정해야 한다. [입력 명세](../features/F-002-material-input.md), [미결정](../decisions/D-004-input-contract.md).

기획 RAG의 실제 검색·인용 흐름 예시이며 제품 도슨트의 답변 품질 검증 결과는 아니다. 원본 스냅샷은 검색하지 않고 관련 결정 노트를 통해 출처를 따라간다.
