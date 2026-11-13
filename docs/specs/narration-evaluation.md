---
type: Specification
id: SPEC-015
title: 작가 해설 후보 실행과 비교 평가
description: 소유 자료에 근거한 후보 생성·제한된 심사와 단일 방식 비교 계약.
status: draft
updated: '2026-11-13'
tags: [yeobek, ai, evaluation]
rag_include: true
generated:
  by: codex/gpt-6.1-terra
  at: '2026-11-13T19:36:20+09:00'
decision_status: proposed
work_status: in_progress
sources:
- id: playbooks-plan
  resource: /references/user-harness-playbooks-plan.md
  title: 하네스 후속 계약 분리 계획
- id: decision
  resource: /decisions/D-013-narration-candidates.md
  title: 작가 해설 후보 생성과 비교 평가
- id: research
  resource: /research/candidate-selection.md
  title: 다중 후보 평가와 재생성 조사
- id: eval
  resource: https://developers.openai.com/api/docs/guides/evaluation-best-practices
  title: OpenAI 평가 모범 사례
---

# 실행 경계

서버 `createNarrationRuntime`은 검증된 actor와 신뢰된 소유 자료 로더를 통해 작품 범위의 자료만 사용한다. 브라우저가 제출한 소유권이나 근거를 신뢰하지 않는다. 평가기 호출 전, 재생성 전과 최종 반환 전 원본 revision/hash를 재확인한다. 후보는 작가 검토용 초안이며 저장·UI·HTTP·승인 연동, 자동 게시 및 TTS는 범위 밖이다. 실제 DB 연결은 후속이다.

`single`은 생성 1회와 동일 평가기 1회, 재생성 없음이다. `best_of_two`는 후보 2개 병렬 생성과 일괄 평가 1회를 한 라운드로 하며 최대 2라운드, 생성 4회와 평가 2회다. 생성 응답 1,600 토큰, 평가 응답 3,000 토큰, 호출당 30초와 전체 120초는 잠정 구현 제한이며 품질 기준으로 사용자 승인된 수치가 아니다. 출력 토큰 상한과 호출 예약은 실제 청구 금액의 상한이 아니다.

해설 초안은 관람 답변과 분리된 `narrationDraftSchema`·`narrationDraftJsonSchema`를 사용한다. 생성 가능한 상한은 2,000 Unicode 코드 포인트이며 목표는 600자다. 선택된 결과의 `overTarget`이 600자 초과를 알리고 본문은 자르지 않는다. 이 값은 검수 화면에 연결하기 위한 경고 메타데이터이며 화면은 아직 없다. 관람 생성 답은 600자 상한을 유지한다. 출력 토큰 예산·심사 점수 하한은 변하지 않아 길이가 허용된다고 반드시 생성·채택되는 것은 아니다.

유효한 source ID와 스키마가 필요하다. 평가는 각 후보의 근거 충실도·적합성·말투·간결성을 1~5점으로 산정하며 앞 세 항목은 4 이상, 간결성은 3 이상이어야 한다. 근거 없는 의도 및 비공개 노출은 모두 false여야 한다. 일부 후보만 성공해도 같은 절대 하한을 적용한다. 유효하지 않거나 잘못된 평가, 전송 실패는 무작정 재시도하지 않는다. 근거가 없으면 재생성하지 않으며 수정 가능한 품질·형식 실패에만 최대 한 번 재생성한다. 인용 ID 존재와 모델 평가 통과는 사실성 보증이 아니다.

# 비교와 사람 검토

비교 도구의 진입점은 `npm run ai:compare -- --mode=mock` (기본 오프라인) 또는 `npm run ai:compare -- --mode=live --cases=grounded --repeats=1 --max-calls=8 [--pricing=path]`이다. 실호출은 명시적이며 선언된 호출 수로 엄격히 제한한다. `.ai-eval/run-ID`는 Git에서 제외되는 출력 위치다. `report.json`은 답변 본문을 제외한다. `human-review.json`에는 `sources`의 ID·본문과 최종 답 또는 보류 사유만 담고 방식·모델 점수를 숨긴다. `human-labels.json`을 사람이 작성한 뒤 `npm run ai:review -- .ai-eval/run-ID`를 실행하면 `human-summary.json`이 모드·버전·해시·라벨 수·세부 항목 평균과 표본 수·완전한 쌍의 승수를 기록한다. `key.json`은 라벨과 원래 결과의 대응표이므로 블라인드 평가자에게 보여주지 않는다. 모의 결과와 평가기 통과만으로 실제 품질을 주장하지 않는다.

모든 시도에 대한 지연 p50/p95, 호출·토큰·재생성·선택·보류·오류를 기록한다. 사람 라벨 수와 양쪽 결과가 모두 있는 쌍의 승수를 보고한다. 기대 보류의 정답 판정은 단순 `abstained`가 아니라 근거 부족 또는 확인 필요 사유에만 적용한다. 타임아웃을 정답으로 취급하지 않는다. 숨겨진 탈락 후보를 사람 검토하지 않았다면 잘못된 거절률을 보정했다고 주장하지 않는다. 비용은 정확한 제공사/모델별 토큰 단가를 적용한 대략적인 합계다. 사용량이나 단가가 없으면 비용은 0이 아니라 `null`(미상)이며 실제 청구액이 아니다. 캐시 계층은 정규화하지 않는다.

점수 하한, 평가기와 모델 조합, 가격과 적정 예산은 실측과 독립적인 사람 검토로 다시 결정한다. 공식 [평가 지침](https://developers.openai.com/api/docs/guides/evaluation-best-practices)과 [관련 조사](../research/candidate-selection.md)를 참고하되 실서비스 품질을 미리 확정하지 않는다.
