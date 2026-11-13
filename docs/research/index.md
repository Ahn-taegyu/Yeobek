# 기술 선택 재검토

공식 문서 조사 결과와 이번 MVP에 대한 판단을 구분한다. 실제 음성 청취·API 호출·부하 시험·배포 결과가 아니다.

- **최신 11/13:** [Render 제외 후 추천 스택·AI별 모델/API](recommended-stack.md), [D-010](../decisions/D-010-practical-stack.md). 사용자 안내로 Render 제외 반영, 나머지는 권고 단계.

- [음성 모델과 한국어 TTS](voice-options.md) — GPT-Live·Gemini Live·전용 TTS, 네 입출력 조합, 청취 평가안.
- [Supabase·파일 저장·무료 PostgreSQL 직접 운영](storage-and-postgres.md) — 무료 한도, 원본/파생본, Oracle·Google VM, 운영 부담.
- [Next.js 통합과 호스팅](nextjs-hosting.md) — 프레임워크와 호스트 제약, Render 행사 후보 제외, 무료 대안.
- [D-009 변경 제안](../decisions/D-009-stack-review.md) — 유지할 것·재선정할 것·검증 순서.

최초 위임 기준은 [D-008](../decisions/D-008-technology-stack.md)이다. D-009는 11/12 비교, D-010은 11/13 최신 권고이며 새 벤더 도입 완료를 뜻하지 않는다.
