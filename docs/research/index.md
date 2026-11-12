# 기술 선택 재검토 — 2026-11-12

공식 문서 조사 결과와 이번 MVP에 대한 판단을 구분한다. 실제 음성 청취·API 호출·부하 시험·배포 결과가 아니다.

- [음성 모델과 한국어 TTS](voice-options.md) — GPT-Live·Gemini Live·전용 TTS, 네 입출력 조합, 청취 평가안.
- [Supabase·파일 저장·무료 PostgreSQL 직접 운영](storage-and-postgres.md) — 무료 한도, 원본/파생본, Oracle·Google VM, 운영 부담.
- [Next.js 통합과 호스팅](nextjs-hosting.md) — 프레임워크와 호스트 제약, Render 대회 파트너, 무료 대안.
- [D-009 변경 제안](../decisions/D-009-stack-review.md) — 유지할 것·재선정할 것·검증 순서.

기존 구현 기준은 [D-008](../decisions/D-008-technology-stack.md)이다. D-009는 추가 조사에 따른 제안이며 새 벤더 도입을 완료한 것으로 표시하지 않는다.
