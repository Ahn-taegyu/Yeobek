---
type: Review
id: RES-002
title: Supabase·대용량 파일·무료 PostgreSQL 직접 운영
description: DB와 파일의 규모를 분리하고 Supabase 한도 및 무료 VM 자체 운영의 비용·운영 부담을 비교한다.
status: draft
updated: '2026-11-12'
tags: [mawd, storage, postgres, research]
rag_include: true
generated:
  by: codex/gpt-6
  at: '2026-11-12T06:02:54+00:00'
sources:
- id: request
  resource: /references/user-stack-review.md
  title: 사용자 저장소·무료 서버 조사 요청
- id: supabase-pricing
  resource: https://supabase.com/pricing
  title: Supabase 가격·한도
- id: oci
  resource: https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier_topic-Always_Free_Resources.htm
  title: OCI Always Free
- id: gcp
  resource: https://docs.cloud.google.com/free/docs/free-cloud-features
  title: Google Cloud 무료 사용량
- id: r2
  resource: https://developers.cloudflare.com/r2/pricing/
  title: Cloudflare R2 가격
decision_status: proposed
---

# 판단

**Supabase의 Postgres를 대용량 파일 때문에 제외할 이유는 없다.** 작가·작품·권한·승인 근거는 DB에, 이미지/PDF/음성 파일은 Object Storage에 둔다. 파일 용량이 커지면 Storage만 바꾸거나 유료화할 수 있다. 반대로 무료 Supabase에 큰 원본을 계속 쌓는 계획은 적합하지 않다.

사용자가 제안한 **무료 VM + PostgreSQL 직접 운영도 가능**하다. 관리형 DB의 작은 무료 용량을 벗어날 수 있지만, 데이터 보존·백업·보안·업데이트를 팀이 운영한다. 이미 VM이 준비되어 있고 운영 경험이 있다면 실용적인 후보이며, 새 계정 발급부터 시작하는 일요일 마감의 기본값으로는 권고하지 않는다. 이는 개발 일정에 대한 판단이다.

# Supabase 무료 등급의 실제 경계

| 항목 | Free | 영향 |
| --- | --- | --- |
| DB | 프로젝트당 500MB | 작품 행 수만이 아니라 승인 이력·인덱스·검색 데이터까지 측정 |
| 파일 저장 | 1GB | 고해상도 원본·도록을 조금만 모아도 먼저 도달 가능 |
| 파일당 크기 | 최대 50MB | 100MB 도록은 Free 버킷 설정만으로 수용 불가 |
| 전송 | uncached 5GB, cached 5GB | 서로 별도 할당. 어떤 트래픽이든 쓸 수 있는 합산 10GB로 계산하지 않음 |
| 운영 | 비활성 프로젝트 1주 후 일시 정지 대상, 자동 백업 미포함 | 행사 전 상태 확인과 별도 백업 필요 |

Pro는 월 $25부터, 기본 포함량은 DB disk 8GB·파일 100GB다. 추가 저장·컴퓨트·전송은 사용량과 선택에 따라 비용이 생긴다. 유료 변경만으로 모든 규모의 성능을 보장하지 않는다. [가격](https://supabase.com/pricing), [파일 크기 제한](https://supabase.com/docs/guides/storage/uploads/file-limits), [전송량 분류](https://supabase.com/docs/guides/storage/serving/bandwidth)

6MB는 Supabase 파일 최대 크기가 아니라 **업로드 방식 선택 기준**이다. 공식 문서는 6MB가 넘으면 TUS resumable upload를 권장한다. 인증된 브라우저에서 Storage로 직접 업로드하고 실패한 부분부터 재개한다. [재개 가능한 업로드](https://supabase.com/docs/guides/storage/uploads/resumable-uploads)

기존 [SPEC-007](../specs/technology-stack.md)의 이미지 3MB·PDF 6MB는 마감용 설계값이다. 고해상도 원본 보관 요구까지 충족하는 제품 상한이 아니다. 큰 자료가 확보되면 원본 저장 경로와 플랜을 먼저 정하고 상한을 변경한다. 원본을 버리고 압축본만 남기는 방향으로 장기 요구를 해결하지 않는다.

# 원본·웹 표시·검색의 분리

| 저장 대상 | 위치와 사용 |
| --- | --- |
| 고화질 작품 원본·원본 PDF | 비공개 Object Storage에 원본 유지. DB에는 provider/bucket/key·크기·형식·권리·버전 정보 |
| 관람 이미지 | 웹용 파생본. 초기 목표 예: 긴 변 800~1600px·200~500KB. 작품 특성에 따른 품질 확인 후 조정 |
| 설명·승인 근거·출처/쪽수 | Postgres. 전시/작품/공개 버전으로 제한해 RAG에 전달 |
| 음성 | 글 해시·음성 버전에 묶인 파일. DB에는 경로와 상태 |

위 이미지 크기는 제안값이다. 세밀한 감상이 필요한 작품을 획일적으로 낮은 화질로 제한하지 않는다. 확대 기능이 필요해지면 추가 해상도/타일 방식을 별도 검토한다. 카탈로그 전체 PDF를 질문마다 모델로 보내지 않는다.

자체 산정 예시이며 실제 데이터 실측은 아니다. 10만 작품 × 20KB 텍스트/메타데이터는 약 **2GB**, 같은 10만 작품 × 20MB 원본은 약 **2TB**다. 전자는 DB 크기, 후자는 파일 저장량이다. 인덱스·버전·복제·백업은 별도다. 관람객 1만 명 × 작품 20개 × 표시 이미지 300KB는 약 **60GB 전달량**이며, 브라우저/CDN 캐시에 따라 원본 저장소 전송량은 달라진다.

Postgres 확장에는 쿼리·인덱스·컴퓨트·연결 관리가 필요하다. 전시+작품 번호의 고유 인덱스, 소유자/공개 버전 조회 인덱스, 페이지네이션부터 적용하고 지연·연결 수·DB 크기로 증설을 결정한다. RLS 자체의 복잡한 정책도 조회 비용에 영향을 준다. [컴퓨트·디스크](https://supabase.com/docs/guides/platform/compute-and-disk), [RLS 성능](https://supabase.com/docs/guides/database/postgres/row-level-security)

기본 Postgres 테이블·SQL은 다른 Postgres로 옮길 수 있지만, Supabase Auth·Storage API·소유권 규칙까지 자동으로 옮겨지지는 않는다. DB 백업에는 Storage의 실제 파일이 포함되지 않으므로 파일 백업도 따로 관리한다. [백업 범위](https://supabase.com/docs/guides/platform/backups)

# 파일만 Cloudflare R2로 옮기는 안

R2 Standard 무료 포함량은 월 10GB-month 저장, Class A 100만·Class B 1,000만 요청이다. 인터넷 egress는 무료지만 저장/요청 초과와 다른 연결 서비스 비용은 별개다. 무제한 무료 파일 서버는 아니다. [R2 가격](https://developers.cloudflare.com/r2/pricing/)

`Supabase DB/Auth + R2 파일` 구성이 가능하다. 다만 Supabase Storage의 RLS를 R2가 자동 집행하지 않으므로 서버가 소유권/공개 상태를 검사하고 제한된 업로드·다운로드 권한을 발급해야 한다. CORS·파일 검증·삭제/백업도 별도로 연결한다. 무료 저장량 9GB를 더 얻으려고 첫날부터 두 파일 제공사를 함께 구현하지는 않는다. 실제 큰 파일 요구나 전송 비용이 선택 근거다.

관람 파일을 모두 Next.js의 `no-store` 프록시로 보내는 기존 MVP 방식은 공개 중지 검사에 유리하지만 앱 서버와 전송량 부담이 커진다. 확장 시 버전별 파생본과 짧은 서명 URL/CDN을 검토한다. **서명 URL은 만료 전 접근이 남을 수 있으므로 즉시 차단과 같지 않다.** 현재 공개 중지 계약을 유지하려면 요청마다 검사하는 프록시/엣지 경로를 유지하거나 허용 지연을 명세에 합의해야 한다. 이 연구만으로 접근 정책을 바꾸지 않는다.

# 무료 서버에 PostgreSQL을 설치하는 후보

직접 운영이 목적이 아니라 **무료 관리형 PostgreSQL 대안**을 찾는 것이라면 Neon도 있다. 2026-11-12 현재 가격표는 프로젝트당 DB 1GB·월 100 CU-hours·전송 5GB, Object Storage 5GB와 Managed Better Auth를 안내한다. Free 컴퓨트는 비활성 5분 뒤 scale-to-zero한다. 예전 0.5GB 안내를 현재 한도로 쓰지 않는다. Supabase 연동을 그대로 대체하는 것은 아니어서 인증/파일 API와 권한 검증은 다시 연결해야 한다. 무료 한도가 큰 정도만으로 대용량 장기 운영이 해결되는 것도 아니다. [현재 가격](https://neon.com/pricing), [2026-10 확대 안내](https://neon.com/blog/neon-free-plan-1-gb-per-project)

| 후보 | 확인한 무료 자원/조건 | 이번 판단 |
| --- | --- | --- |
| Oracle OCI Always Free ARM | 현재 공식 문서: 총 2 OCPU·12GB RAM에 해당하는 월 할당, 부팅/블록 디스크 합계 200GB. 홈 리전·용량 확보·유휴 회수 조건 | 준비된 인스턴스가 있다면 DB 자체 운영 후보. 과거의 4 OCPU·24GB 안내를 새 계정의 확정 한도로 사용하지 않음 |
| Google Compute Engine | 미국 지정 3개 리전 e2-micro 1대 상당 시간, standard disk 30GB-month, 외부 전송 1GB/월 | 작은 실험용 DB 후보. 한국 사용자 지연·작은 자원·네트워크 비용 때문에 본 서비스 우선안은 아님 |
| Render Free Web Service 안에 직접 설치 | 영구 디스크 연결 불가, 재시작/재배포/휴면 시 로컬 변경 손실 | 영구 PostgreSQL 데이터 디렉터리로 사용하지 않음. 별도 Free Render Postgres도 30일 만료 |

근거: [Oracle 무료 자원](https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier_topic-Always_Free_Resources.htm), [Google 무료 범위](https://docs.cloud.google.com/free/docs/free-cloud-features#compute), [Render 무료 제약](https://render.com/docs/free). Oracle은 인스턴스 생성 시 자원 부족이 있을 수 있고 유휴 회수를 명시한다. 사용 중인 계정의 실제 할당은 확인하지 않았다.

Google의 일반 VM 외부 IPv4는 시간당 $0.005이며 무료 적용은 월 1시간으로 안내된다. VM 무료 조건만 보고 전체 서비스가 월 0원이라고 계산하면 안 된다. 다른 방식의 접속도 비용/복잡도를 따져야 한다. [네트워크 가격](https://cloud.google.com/vpc/network-pricing#ipaddress)

# 자체 운영을 선택할 때 필요한 최소 범위

PostgreSQL만 설치하는 것과 Supabase 전체를 자체 운영하는 것은 다르다. 전체 Supabase Docker 구성은 공식 최소 RAM 4GB·CPU 2코어·SSD 40GB, 권장 RAM 8GB 이상이다. 관리형 플랫폼과 기능/운영 범위도 동일하지 않다. 이번 대안은 우선 **일반 PostgreSQL** 기준으로 비교한다. [Supabase self-hosting](https://supabase.com/docs/guides/self-hosting/docker)

직접 운영안은 Next.js Node 앱 + PostgreSQL + 별도 Object Storage로 구성할 수 있다. 한 VM에 앱/DB를 함께 두면 구성이 단순해지지만 배포·CPU/메모리 경쟁·장애 영향도 함께 묶인다. ORM 채택이나 앱/DB 분리는 실제 구현 전 별도 선택이다.

일요일까지 자체 운영을 택하려면 적어도 다음 완료 기준이 필요하다. 단순 컨테이너 실행 성공만으로 완료하지 않는다.

- 재시작해도 데이터가 남는 영구 디스크/마운트와 PostgreSQL 버전 고정.
- DB는 사설/로컬 접속 우선. 외부 접속은 필요한 경로만 허용하고 인증·전송 보호 적용. 브라우저가 DB에 직접 접속하지 않음.
- 자동 논리 백업과 다른 저장소 사본, 실제 복원 1회. 단일 디스크를 백업으로 부르지 않음.
- 작가 로그인·세션·작품 소유권 검사 구현. Supabase Auth/Storage를 뺀 빈자리가 사라지는 것은 아님.
- 용량·메모리·연결 수·백업 실패 관찰, 패치 및 장애 복구 담당 지정.

**추천:** 이번 일정은 관리형 Supabase DB/Auth를 유지한다. 이미 확보한 무료 VM과 운영 경험이 있다면 위 검증을 통과하는 조건으로 PostgreSQL 직접 운영을 대체안으로 둘 수 있다. 장기에는 실제 DB 규모·파일 전송량·운영 인건비를 측정한 뒤 비교한다. 고화질 원본 저장 문제만으로 DB까지 동시에 바꾸지는 않는다.
