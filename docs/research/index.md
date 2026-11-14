# 기술 선택 재검토

- [현재 구조·Numa·Bivia 비교 계획](../product/articul8-comparison-plan.md) — 문서 준비와 검색 효과를 분리하는 실험 설계, API 지원·무료 한도 미확인 항목. 실측·채택 전.

- [작가 참고 파일 읽기](material-reader.md) — 로컬 PDF·Liner 파일 입력·W2 검수와 비용 경계. 실제 호출0회.

- [W9 이메일 가입·직접 로그인 경계](signup-auth-contract.md) — 서버 전용 가입, 최초 요청 연결, OTP/비밀번호 세션 구별과 로컬 검증.

- **W8 준비:** [업무 자동화 제공사 계약](automation-provider-contracts.md) — 스티비 발송 접수, 채널톡 인증 방식 구분, Alt 읽기·서명·삭제 통지. 구현·실호출 전 조사.
- **11/14 후속:** [백엔드 제공사 연결](backend-provider-routing.md), [D-015](../decisions/D-015-partner-priority.md). 파트너 우선 원칙과 잠정 모델, 실제 호출 미검증.
- [다중 후보 평가·재생성과 채택 문맥 계승](candidate-selection.md) — 적용 가능성·평가 하한·비용/지연·서버 대화 상태 설계. 미구현·미측정 제안.

공식 문서 조사 결과와 이번 MVP에 대한 판단을 구분한다. 실제 음성 청취·API 호출·부하 시험·배포 결과가 아니다.

- **최신 11/13:** [Render 제외 후 추천 스택·AI별 모델/API](recommended-stack.md), [D-010](../decisions/D-010-practical-stack.md). 사용자 안내로 Render 제외 반영, 나머지는 권고 단계.

- [음성 모델과 한국어 TTS](voice-options.md) — GPT-Live·Gemini Live·전용 TTS, 네 입출력 조합, 청취 평가안.
- [Supabase·파일 저장·무료 PostgreSQL 직접 운영](storage-and-postgres.md) — 무료 한도, 원본/파생본, Oracle·Google VM, 운영 부담.
- [Next.js 통합과 호스팅](nextjs-hosting.md) — 프레임워크와 호스트 제약, Render 행사 후보 제외, 무료 대안.
- [D-009 변경 제안](../decisions/D-009-stack-review.md) — 유지할 것·재선정할 것·검증 순서.

최초 위임 기준은 [D-008](../decisions/D-008-technology-stack.md)이다. D-009는 11/12 비교, D-010은 11/13 최신 권고이며 새 벤더 도입 완료를 뜻하지 않는다.
