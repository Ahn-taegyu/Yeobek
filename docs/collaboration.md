---
type: Guide
id: GUIDE-005
title: Yeobek 개발 협업 규칙
description: MVP 팀의 작업 배정, 커밋, 브랜치, PR, worktree와 병합 기준을 설명한다.
status: stable
updated: '2026-11-14'
tags: [yeobek, collaboration, git]
rag_include: false
generated:
  by: codex/gpt-6
  at: '2026-11-13T13:42:03+09:00'
sources:
- id: agent-reasoning
  resource: /references/user-agent-reasoning-levels.md
  title: 작업에 따른 서브에이전트 추론 강도 조정
- id: ci-first
  resource: /references/user-ci-first-validation.md
  title: CI 검사와 로컬 검증 중복 최소화
- id: lifecycle
  resource: /references/user-git-lifecycle-delegation.md
  title: Git 작업 생명주기와 병합 판단 위임
- id: request
  resource: /references/user-development-start.md
  title: MVP 개발 착수 및 협업 규칙 요청
- id: git-worktree
  resource: https://git-scm.com/docs/git-worktree
  title: Git worktree 공식 문서
- id: github-protection
  resource: https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches
  title: GitHub 보호 브랜치 설정
- id: supabase-config
  resource: https://supabase.com/docs/guides/local-development/cli/config
  title: Supabase 로컬 프로젝트 설정
---

# Yeobek 개발 협업 규칙

이 가이드는 일요일 오전 MVP 통합을 기준으로 한다. 작업을 나눌 때 담당자, 기준 브랜치, 수정할 경로, 검증할 사용자 흐름, 선행 PR을 공유한다. 작업 중 범위가 겹치면 파일을 수정하기 전에 담당자끼리 순서나 경계를 조정한다. 기획 문서의 검색, 출처, 상태 관리에는 [에이전트 작업 절차](agent-workflow.md)를 적용한다.

## 1. 담당자와 변경 범위

| 역할 | 주로 담당하는 변경 | 리뷰에서 확인할 사항 |
| --- | --- | --- |
| 기획 | MVP 범위, 수용 기준, 사용자 흐름, 문구와 콘텐츠 상태 | 변경이 합의된 사용자 흐름과 출처에 맞는지 |
| 디자이너 | 화면 상태, 레이아웃, 디자인 토큰 제안, 디자인 검수 | 모바일, 빈 상태·로딩·오류, 시각·상호작용 일관성 |
| 프론트엔드 보조 | 합의된 계약을 사용하는 화면·컴포넌트, 화면별 검증 | 컴포넌트 동작, 반응형, 키보드·터치 입력 |
| 프론트엔드·백엔드·AI 개발 담당 | 공통 앱 구성, 서버/API, DB·RLS·Storage, 외부 AI 연동 및 통합 | API 소비자 영향, DB 호환성, 권한, 서버 비밀값, 운영 흐름 |

- 한 작업에서 파일별 편집 담당자는 한 명이다. 공통 레이아웃, API 타입, migration, `package.json`과 lockfile은 변경 전에 편집 담당자와 적용 순서를 합의한다. 여러 에이전트가 작업할 때도 같은 원칙을 적용한다.
- 화면과 API를 병렬로 만들 때는 요청·응답·오류 형식, 인증, 테스트 데이터부터 합의한다. 화면 작업은 예시 응답으로 진행할 수 있다. PR에는 예시 응답으로 확인한 부분과 실제 연결 검증 결과를 기록한다.
- 마감 직전에는 필수 흐름을 통과시키는 변경을 먼저 병합한다. 디자인 개선, 코드 정리, 기능 확장은 각각 후속 PR로 넘길 수 있도록 관련 작업과 확인이 필요한 부분을 기록한다.

### 서브에이전트 작업 검토

1. 위임할 때 수정 가능 경로, 요구·계약, 완료 기준, 돌려받을 검증 근거를 명시한다. 이번 Codex 채팅에서는 일반 작업에 Sol, 단순 작업에 Terra를 선호한다. 위임 시작 시 단순 작업은 낮음, 일반 구현은 중간, 복합 설계·권한·동시성 검토는 높음을 기준으로 추론 강도를 선택한다. 실제 diff 교차 검토와 필요한 직접 검증은 그대로 수행한다. 다른 팀원은 작업에 맞는 도구를 선택한다. [추론 강도 조정 지시](references/user-agent-reasoning-levels.md).
2. 위임자는 실제 diff를 원래 요구·선행 계약과 직접 대조하고 기존 변경 보존 여부와 보고된 검사 근거를 확인한다. 필요한 좁은 회귀·통합 검증은 위임자가 직접 확인한다. 전체 검사는 최신 CI 결과를 확인하며 서브에이전트·부모·CI가 같은 전체 검사를 일률적으로 반복하지 않는다. 사람이 맡은 PR 리뷰도 정해진 절차대로 진행한다.
3. 누락이나 문제를 찾으면 변경 위치와 기대 동작을 근거로 피드백한다. 수정된 diff와 영향받는 검사를 다시 확인한 뒤 반영한다. 통합 때 해결하지 못한 항목은 PR이나 인계 기록에 재현 조건과 함께 남긴다.

## 2. Commit

한 커밋에는 설명하고 검토하고 되돌릴 수 있는 목적 하나를 담고 관련 검사를 통과한 뒤 커밋한다. 같은 동작을 위해 필요한 코드, 테스트, API 계약, migration은 함께 커밋할 수 있다. 무관한 수정, 포맷 변경, 의존성 추가는 따로 분리한다.

커밋 제목은 `<type>(<scope>): <변경 내용>` 형식을 기본으로 하고, 범위가 명확하면 `(scope)`를 생략한다. 팀원이 제목만 읽고 동작이나 의도를 알 수 있게 쓴다. 배경이나 호환성 변화는 본문에 남기고 관련 작업·결정·기능 ID가 있으면 적는다.

| 종류 | 예시 |
| --- | --- |
| 사용자 기능 | `feat(visitor): 작품 QR 진입 화면 추가` |
| 오류 수정 | `fix(auth): 세션 만료 시 로그인으로 이동` |
| 문서 | `docs(api): 관람 질문 응답 형식 기록` |
| 설정·의존성 | `chore(deps): Supabase 클라이언트 버전 고정` |
| 테스트 | `test(rag): 게시 철회 작품 제외 회귀 사례 추가` |
| 동작을 유지하는 내부 정리 | `refactor(storage): 파일 경로 생성 로직 통합` |
| 운영 긴급 수정 | `fix(visitor): 게시 철회 작품 노출 차단` |

```sh
git status --short
git diff -- path/to/file
git add -- path/to/file
git diff --cached --check
git diff --cached
git commit -m "fix(visitor): 작품 없음 상태 표시"
```

| 상황 | 처리 |
| --- | --- |
| 다른 작업의 미커밋 파일이 있다 | 작업 전 상태를 기록하고 필요한 경로만 stage한다. 개인 편집기 설정 등 기존 미커밋 변경을 포함해야 하면 소유자와 범위를 먼저 확인한다. checkout 전체를 stage하거나 다른 사람의 변경을 stash·reset·restore하지 않는다. |
| 같은 파일에 서로 다른 작업이 섞였다 | 각 변경을 식별할 수 있으면 `git add -p -- path/to/file`로 필요한 부분만 stage한 뒤 staged diff를 읽는다. 같은 hunk에서 의도가 얽히면 두 담당자가 먼저 정리한다. |
| 직전 커밋에서 누락을 발견했다 | 자신만 쓰는 미공개 브랜치에서는 `git commit --amend`로 묶을 수 있다. 공유된 커밋에는 누락을 고치는 새 커밋을 추가하고, 검증 결과가 달라지면 PR에도 반영한다. |
| 실험이나 미완성 코드가 필요하다 | 자신의 브랜치에 목적이 드러나는 커밋을 만들고 Draft PR로 공유할 수 있다. 실제 실행한 검사, 실패한 검사, 아직 연결하지 못한 흐름을 기록하고 병합 기준을 충족한 뒤 리뷰를 요청한다. |
| 패키지 버전이 바뀌었다 | 저장소가 선택한 패키지 매니저로 manifest와 lockfile을 함께 갱신하고 같은 커밋에 포함한다. 잠금 파일 충돌은 승인된 의존성 변경을 먼저 합친 뒤 같은 도구로 생성하고 새 checkout에서 설치를 확인한다. |
| 생성물·비밀값이 보인다 | `.next`, `node_modules`, `docs/.rag`, `docs/.venv`, 개인 편집기 상태, 키, 개인 데이터, 실제 작가 원본을 stage하지 않는다. lockfile과 검토한 migration은 버전 관리한다. 예제 환경 파일에는 변수 이름과 가짜 값만 쓴다. 키가 공유 이력이나 PR에 포함됐다면 팀에 노출 위치를 알리고 키를 폐기·교체한다. |
| 이미 공유한 migration을 고쳐야 한다 | 원격 브랜치/PR에 올렸거나 팀 DB에서 적용한 migration은 그대로 두고 새 migration으로 정정한다. 공유 전이라도 다른 사람이 적용한 migration이면 같은 기준을 적용한다. migration 번호·파일명이 겹치면 DB 담당자가 적용 순서와 새 파일명을 정한다. |

## 3. Branch

`main`을 통합 기준으로 사용하고 작업 브랜치를 PR로 병합한다. 브랜치명은 `<종류>/<작업>`으로 짓는다. 작업 부분은 소문자와 하이픈을 쓰고, 담당자 이름·도구명 대신 작업 결과를 드러낸다. 이슈 번호가 있으면 `feat/42-visitor-qr`처럼 붙일 수 있다.

| 접두사 | 예시 | 쓰는 경우 |
| --- | --- | --- |
| `feat/` | `feat/visitor-qr-entry` | 사용자 기능 추가 또는 확장 |
| `fix/` | `fix/artist-session-expiry` | 일반 버그 수정 |
| `docs/` | `docs/visitor-acceptance` | 요구·설계·안내서 변경 |
| `chore/` | `chore/dependency-updates` | 도구·CI·의존성·구성 관리 |
| `test/` | `test/publish-policy` | 테스트 추가·수정 |
| `refactor/` | `refactor/storage-paths` | 동작을 유지하는 코드 정리 |
| `hotfix/` | `hotfix/unpublished-work-access` | 운영·시연 차단 문제의 긴급 수정 |

깨끗한 단일 checkout에서 시작하는 예시다. 다른 사람이 편집 중이거나 미커밋 작업이 있으면 [worktree 절차](#5-worktree)를 적용한다.

```sh
git status --short
git fetch origin
git switch -c feat/visitor-qr-entry origin/main
```

| 상황 | 처리 |
| --- | --- |
| 공통 기반 PR이 아직 열려 있다 | 독립 부분은 `origin/main`에서 시작한다. 선행 변경이 있어야 테스트할 수 있다면 선행 브랜치의 공유된 커밋에서 파생하고 Draft PR의 base를 선행 브랜치로 둔다. 선행 PR 병합 뒤 `main`으로 base를 바꾸고, 선행 변경이 diff에 다시 나오면 자기 작업 커밋만 새 브랜치로 옮겨 diff를 확인한다. |
| `main`이 앞서갔다 | 자신만 쓰는 미공개 브랜치는 `git fetch origin` 후 `git rebase origin/main`으로 정리할 수 있다. 다른 사람이 사용하는 브랜치나 원격에 올린 브랜치는 `git merge origin/main`이 기본이다. |
| 공유한 브랜치 이력을 다시 써야 한다 | 모든 영향받는 담당자가 시점과 기준 원격 SHA를 명시적으로 맞춘 경우에 한해 해당 작업 브랜치에 `--force-with-lease=<원격 브랜치 ref>:<합의한 SHA>`를 사용한다. 예상 SHA가 다르면 멈추고 차이를 확인한다. `main`에 강제 push하지 않는다. |
| 동일 기능을 두 사람이 작업한다 | PR 하나의 편집 담당자를 정하거나 화면·계약·서버 등으로 경로와 병합 순서를 나눈다. 같은 브랜치의 수정은 맡은 사람에게 인계하고, 병렬 작업은 별도 브랜치에서 한다. |
| 충돌이 났다 | PR 작성자가 병합을 진행하고 충돌 파일의 담당자와 양쪽 변경 의도를 확인한다. 계약·migration·lockfile은 해당 담당자와 결과를 확인한다. 해결 후 관련 흐름을 다시 실행한다. 의도를 확인할 수 없으면 진행 중인 merge/rebase를 중단하고 담당자와 조율한다. |
| 다른 브랜치의 일부 수정만 필요하다 | 출처를 보존하는 `git cherry-pick -x <commit>`을 사용한다. 선행 커밋에 의존하는지 확인하고 두 PR에 적용한 경우 링크와 향후 병합 순서를 남긴다. |
| 운영 긴급 수정이 필요하다 | 장애가 난 버전과 현재 `main`의 차이를 확인하고 실제 수정 대상에서 `hotfix/…`를 만든다. 좁은 PR로 수정한 뒤 `main`이 다른 계열이면 같은 수정도 별도 PR로 반영한다. 긴급 PR에도 검증 결과와 복구 경로를 기록한다. |
| 브랜치가 중단되거나 담당자가 바뀐다 | Draft PR 또는 작업 기록에 마지막 검증 커밋, 남은 변경, 의존 관계, 실패 재현 절차를 적는다. 이어갈 담당자가 있으면 새 경로와 기준 SHA를 전달한다. 폐기한 경우 PR에 사유를 남기고 참조하는 작업이 정리된 뒤 브랜치를 삭제한다. |

## 4. Pull Request

[사용자 위임](references/user-git-lifecycle-delegation.md)에 따라 다음 조건을 평가하고 충족하면 별도 재승인 없이 병합 판단과 수행까지 진행한다. 시간이나 변경 줄 수만으로 경계를 정하지 않는다.

1. 검토·되돌리기 가능한 목적 하나와 관련 검사를 갖춘 단위로 커밋한다. push는 모든 커밋마다 하지 않고 검토 가능한 묶음 완료, 협업 인계 또는 중요한 복구 지점에 수행한다. PR은 자잘한 커밋마다 만들지 않고 독립적으로 수용 가능한 흐름의 첫 검토 단위에서 Draft로 연다. 사용자가 묶음별 커밋을 요청하면 그 주기는 지킨다. PR에 목적, 범위, 선행 관계, 실행·미실행 검사와 미결정을 기록한다.
2. 작성자는 실제 base와 전체 diff를 원 요구·수용 기준과 대조하고 직접 검사한다. 위임 결과는 실제 diff를 교차 검토하고 발견한 문제를 수정·재검증한다. 요구되는 사람 승인은 AI 검토로 대체하지 않는다.
3. 수용 기준, 직접 검증, 교차 검토와 최신 head의 적용되는 CI가 완료되고 차단 리뷰가 해소되면 ready로 전환하고 병합 여부를 판단한다. PR에 정확한 head와 base SHA, 검사 결과, 미결정과 병합 판단을 남긴다. 차단 리뷰와 브랜치 보호 정책은 우회하지 않으며 요구된 승인이나 검사가 없으면 기다린다.
4. **Squash and merge**가 기본이다. stacked PR은 선행 PR부터 병합하며 후속 PR의 조상 관계 보존이 필요하면 merge commit을 선택할 수 있다. base 전환 후 전체 diff와 최신 head CI를 다시 확인한다. 의미 있는 변경 후에는 영향 부분을 재검토한다.
5. 미구현·비활성 모듈은 PR의 명시적 범위를 기반 코드로 한정하고 그 수용 기준을 충족할 때만 병합할 수 있다. 전체 기능 완료로 표현하지 않는다. 모의 검증과 실제 외부 호출 횟수(0회 포함)를 구분한다. 병합과 운영 적용은 별개이며 운영 적용은 별도 범위다.

검사는 결과의 SHA·범위·환경을 기록하여 재사용한다. [최신 사용자 지시](references/user-ci-first-validation.md)에 따라 **전체 lint·타입 검사·단위/DB/HTTP 회귀·프로덕션 빌드·문서 회귀는 CI에서 실행**한다. 로컬은 변경 부분의 빠른 검사·오류 재현과, 기존 DB 업그레이드·실제 화면 등 CI가 대신하지 못하는 검증만 수행한다. 이전 계획에 매 묶음 전체 로컬 검사가 적혀 있어도 이 규칙을 우선한다. 전체 로컬 검사가 실제로 필요한 예외에는 CI로 확인할 수 없는 이유를 작업 기록에 짧게 남긴다.

코드 변경 없이 push, ready 전환 또는 PR 본문 수정만 한 경우 로컬 검사를 재실행하지 않는다. CI 실패 시 실패 단계와 영향받는 범위만 로컬에서 재현한다. 실행 한도·결제 등 인프라 문제를 전체 로컬 검사로 대체하거나 CI 우회 병합의 근거로 삼지 않는다. 같은 workflow를 수동으로 중복 실행하지 않고, 장애 해소 확인 때는 실패 job만 재실행한다. CI 상태 확인과 PR 상태 변경은 가능한 단위로 묶는다. 문서만 수정할 때 로컬은 필요에 따라 `knowledge.py check`를 사용하고 검색 회귀·전체 인덱스 검증은 Knowledge CI에 맡긴다.

| 작업 유형 | 검토 가능한 단위와 병합 기준 |
| --- | --- |
| 문서 | 출처와 영향 문서가 일치하는 변경, 문서 검증과 의미 검토 완료 |
| DB | migration·계약·관련 권한 및 업그레이드 검증을 함께 검토하고 호환·복구 경로 확인 |
| API | 계약·구현·소비자 영향과 허용/거부 흐름을 함께 검증 |
| 핫픽스 | 재현·좁은 수정·영향 검사와 복구 경로를 기록하고 동일한 보호·승인 기준 적용 |
| 부분 W 묶음 | 독립적인 기반 범위와 미구현 부분을 PR에 명시하고 그 범위의 수용 기준과 검사 완료 |

| 변경 범위 | 병합 전에 남길 검증 근거 |
| --- | --- |
| 문서·검색 도구 | `python scripts/knowledge.py verify` 결과, 근거/영향 문서, 기존 ID 유지 여부 |
| 앱 코드 | 저장소의 실행 안내와 `package.json`에 정의된 관련 lint·타입 검사·테스트·빌드 결과, 영향받는 사용자 흐름의 확인 결과 |
| 화면 | 대상 화면 및 상태, 모바일/데스크톱 확인 결과, UI가 바뀌면 스크린샷이나 짧은 영상. 실제 방문객·작가 식별 정보는 예시 자료로 대체한다. |
| API·서버·AI | 계약 문서와 맞는 요청·응답·상태 코드·오류 예시, 권한 있는 요청과 거부되는 요청, 배포 중 공존할 구버전·신버전 클라이언트와 서버의 호환 여부. 모의 응답과 실제 외부 서비스 호출 결과를 명시한다. |
| DB·Auth·RLS·Storage | 새 로컬 DB에서 migration과 시드 적용, 기존 스키마·예시 데이터에서 업그레이드, 권한 허용/거부, 파일 공개 범위, 배포 순서와 되돌림·후속 수정 계획. 컬럼 삭제·이름 변경처럼 호환성이 깨지는 작업은 스키마 확장 → 데이터 이전·코드 전환 → 기존 구조 정리 순서로 검토한다. |
| 의존성·설정·CI | 깨끗한 환경에서 잠금 버전 설치, 변경된 실행 명령이나 CI 통과, 필요한 환경 변수 이름과 설정 위치 |

- 각 검사의 실행 범위와 결과를 PR에 기록한다. 수행하지 않은 검사에는 이유를 적고, 병합에 필요한 검증이면 완료한 뒤 병합한다. 중간 상태는 Draft에서 공유한다.
- `main` 보호는 PR 경유, 일반 변경 승인 1명, 실제 등록된 CI 상태 검사, force push·삭제 차단을 권장한다. GitHub에서 적용 여부는 저장소 설정에서 확인한다. 공개 범위, 협업자 권한, 브랜치 보호 같은 원격 설정 변경은 별도 승인 범위로 다룬다.
- 병합 뒤 문제가 발견되면 PR로 revert하거나 후속 수정한다. 코드만 이전 버전으로 돌려도 이미 적용된 DB 변경은 남으므로 스키마와 코드의 호환성을 먼저 확인한다. 공유·운영 DB에서는 이전 migration을 삭제하거나 DB를 초기화하지 않는다. 데이터 보존이 필요한 스키마 변경은 신규 migration으로 복구한다. DB 변경과 코드 복구 순서를 PR에 기록한다.

## 5. Worktree

한 사람이 한 작업을 순서대로 진행하고 checkout이 깨끗하면 기존 경로를 사용한다. 작업을 병렬로 하거나, 미커밋 작업을 두고 긴급 수정·리뷰를 할 때는 별도 worktree를 사용한다. 공유 checkout에서는 브랜치를 전환하거나 일괄 설치·포맷·마이그레이션을 실행하기 전에 경로와 편집 담당자를 확인한다.

### 생성 및 실행

- Codex는 먼저 연결된 worktree를 확인해 적합한 경로를 재사용한다. 새 worktree 생성과 보관은 각각 `create_worktree`, `archive_worktree`를 사용한다. 보관한 worktree를 다시 사용해야 하면 `restore_worktree`를 사용한다. 에이전트에게 이미 작업 경로와 브랜치를 배정했다면 그곳에서 작업한다.
- 한 브랜치는 한 worktree에서만 체크아웃한다. 리뷰용으로 다른 위치에서 같은 커밋을 읽어야 하면 읽기 전용 의도의 detached worktree나 별도 브랜치를 사용한다. 이미 사용 중인 브랜치를 `--force`로 두 곳에서 체크아웃하지 않는다.
- `git worktree list`와 `git status --short`로 현재 경로, 배정 브랜치, 수정 파일을 확인한다. 로컬 경로에는 작업을 식별할 수 있는 이름을 쓴다. 아래 명령은 경로 권한이 있는 팀원이 Windows PowerShell 또는 macOS/Linux 셸의 저장소 루트에서 실행하는 예시다.

```sh
git status --short
git worktree list
git fetch origin
git worktree add -b feat/visitor-qr-entry "../yeobek-visitor-qr" origin/main
git -C "../yeobek-visitor-qr" status --short --branch
```

| 영역 | worktree 간 분리 방법 |
| --- | --- |
| 의존성·빌드 | checkout별로 잠금 버전 의존성을 설치하고 `node_modules`, `.next`, `docs/.venv`, `docs/.rag`를 각 경로에 생성한다. 공용 다운로드 캐시는 도구가 지원하는 범위에서 재사용할 수 있다. |
| 앱 실행 | 동시에 실행할 앱은 서로 다른 포트를 할당한다. 예를 들어 한 앱은 `3000`, 다른 앱은 `3001`을 쓰고 해당 앱의 미리보기 주소와 인증 리디렉션 주소도 일치시킨다. |
| Supabase | 동시에 실행하는 DB·Auth·Storage는 각 worktree에서 고유한 로컬 프로젝트 ID, 겹치지 않는 서비스 포트, 별도의 Docker 볼륨과 로컬 시드를 사용한다. 적용 중인 CLI 구성에서 실제 로컬 상태와 앱 연결 주소를 확인한다. 개인용 ID나 포트가 tracked config에 임시로 들어갔다면 stage에서 제외한다. 분리 구성이 준비되지 않았다면 각 팀원이 담당 스택을 중지한 뒤 순서대로 실행한다. |
| 키·데이터 | worktree별로 승인된 환경값을 Git 제외 파일 또는 팀의 비밀값 관리 경로에서 주입한다. 이슈·PR·로그에 키를 복사하지 않는다. 개발과 테스트에는 가짜 데이터와 로컬/개발 키를 쓰고, DB reset은 자신이 소유한 폐기 가능한 로컬 프로젝트인지 확인한 경우에만 실행한다. 공유·운영 DB에서 reset을 실행하지 않는다. |

### 인계 및 정리

1. 인계할 때 PR 링크 또는 작업 기록에 브랜치, 작업 경로, 기준·최종 커밋, 변경 파일, 실행한 검사와 결과, 미커밋 변경, 다음 작업과 관련 PR을 적는다. 환경 변수 이름과 포트는 필요할 때 공유하고 비밀값은 관리 경로를 통해 전달한다.
2. 정리 전 자신이 실행한 앱·Supabase 서비스를 중지하고 필요한 로컬 데이터를 보존한다. `git status --short --branch`로 tracked/untracked 상태를 확인하고, PR이나 공유 브랜치의 마지막 커밋을 기준으로 로컬에만 남은 커밋도 확인한다. 환경 파일·DB 데이터처럼 Git이 무시하는 파일은 별도로 확인한다. 팀원이 쓰는 worktree나 공용 서비스는 담당자가 정리한다.
3. Codex는 깨끗하고 인계가 끝난 worktree를 보관한다. 팀원이 직접 정리하는 경우 남길 변경을 커밋·인계한 뒤 다른 checkout에서 아래 명령을 실행한다. 경로가 확인된 깨끗한 worktree만 `git worktree remove`로 제거한다. 삭제가 거부되면 변경을 확인하고 보존한다. Windows에서도 재귀 폴더 삭제 없이 Git 명령으로 처리한다.

```sh
git worktree list
git -C "../yeobek-visitor-qr" status --short --branch
git worktree remove "../yeobek-visitor-qr"
```

4. worktree 정리와 브랜치 정리는 별도 작업이다. 병합된 PR, 해당 커밋을 쓰는 작업, 남은 변경을 확인한 후 브랜치를 정리한다. squash 병합 뒤 `git branch -d`가 거절되면 GitHub의 PR 병합 결과와 독립 커밋 보존 여부부터 확인한다.
