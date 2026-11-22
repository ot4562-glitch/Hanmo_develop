# 한모 3차 · Supabase 한 번 설치 패키지

> **담당:** Supabase Free($0) 프로젝트 소유·관리 — **임창용 님**. 개발팀은 설계·검증·장애 복구 공동 지원. 기존 한모 운영 도메인과 원본 모의수강신청에는 영향을 주지 않습니다.

## 운영자 설치 (신규·승인된 빈 프로젝트에서만)

1. 임창용 님이 [Supabase Dashboard](https://supabase.com/dashboard)에서 **Free 프로젝트**를 직접 생성하고 프로젝트/조직 소유권·리전·관리자 접근을 확인합니다. **Pro 및 유료 애드온을 선택하지 않습니다.** SQL 파일로 계정, 조직, 프로젝트는 만들 수 없습니다.
2. 새 프로젝트 **SQL Editor → New query**에서 [hanmo-setup.sql](../supabase/hanmo-setup.sql)의 **전체 내용을 붙여넣어 한 번만 실행**합니다. 이 파일은 내부 스키마와 빈 데이터 테이블, 승인/철회용 관리 함수, 익명 읽기 RLS를 단일 트랜잭션으로 만듭니다. **기존 스키마에 재실행하거나 업그레이드용으로 사용하지 않습니다.**
3. [hanmo-verify.sql](../supabase/hanmo-verify.sql)을 실행합니다. `anon`·`authenticated` 공개 SELECT 전용, `service_role` 공개 테이블 쓰기 차단, 비공개 함수 실행 금지, RLS에 관한 모든 검사가 **PASS**인지 확인합니다. 신규 설치의 익명 가시 데이터는 **0건**이어야 합니다. 이 SQL 검사는 실제 REST 요청·관리자 권한 경계를 대신하지 않으며, 오류/FAIL이면 학생 사이트 연결을 중단합니다.
4. 공개 Data API에서 **public 스키마만** 노출하고 `hanmo_private`는 절대 노출하지 않습니다. `public.hanmo_public_snapshots`만 학생 브라우저의 읽기 대상이며, `anon`은 그 테이블의 SELECT만 허용됩니다. 프로젝트 URL과 **publishable key**는 추후 클라이언트 읽기 어댑터 PR에서만 연결합니다.
5. 관리용 SQL Editor/DB 관리자 접근은 임창용 님이 보유합니다. `service_role`/secret 키, DB 암호, 민감한 사용자/학교 자료를 저장소·GitHub Pages·정적 번들·이슈·PR에 첨부하지 않습니다.

**설치 후에도 학생용 실데이터는 0건입니다.** 공개 준비를 위해서는 학교의 접근/재배포 승인, 출처별 검수, **서로 다른 실제 검수자와 승인자**의 검증 가능한 승인 기록, 승인된 스냅샷의 해시/유효기한과 정정·취소 시험이 필요합니다. 파일의 `reviewer_id`/`approver_id`는 문서화용 문자열이므로 **신원 인증의 대체물이 아닙니다**. 운영자 역할을 기술적으로 검증하는 별도 권한 설계 전에는 실운영 공개를 승인하지 마세요.

## 만들어지는 것

| 범위 | 자동 구성 |
|---|---|
| **비공개 데이터 구조** | 출처·사용권·원문 판본, 과목/개설/분반 및 관측 분반 수, 교수·담당, **공지 보존 분류/상세 확인 기한**, 반복행사의 **학생/행정 마감**, 학사요건, 수집 작업, 후보 스냅샷/근거 연결, 독립 검수/승인, 감사 로그 |
| **공개 API 테이블** | `public.hanmo_public_snapshots` — 하나의 활성·유효·비철회 스냅샷만 조회 가능 |
| **보안** | 내부 `hanmo_private` 스키마 비노출, RLS, 익명 쓰기 거부, 비공개 관리 함수, 권리 철회 시 미공개 후보·공개 스냅샷 영구 철회, READY 이후 출처 링크 수정 차단, 비공개 함수 실행 권한 제한 |
| **배포** | 하지 않음 — 프로젝트 생성, 학사자료 업로드, 실제 연결, 권한 검증 및 운영 승인 별도 |

공개 페이로드는 `schemaVersion=1`에 대응하며 내부 후보 `payload`에 `notices`, `offerings`, `faq` 배열이 있어야 합니다. 게시/개설/FAQ는 반드시 **동일 `snapshot_id`·`manifest_sha256`** 아래 배포합니다. 가상자료나 이미 #95에서 삭제한 과거 참고 공지 JSON을 별도 검수 없이 승인 자료로 승격하지 마세요.

## 한모 학사자료 가공·보존 경계 (설계 확정, 자동 정리 미구현)

**현행 정책 정본:** [아키텍처 §7.1.1](https://github.com/ot4562-glitch/Hanmo_develop/blob/main/docs/architecture.md) · [운영 체크리스트](https://github.com/ot4562-glitch/Hanmo_develop/blob/main/docs/academic-data-lifecycle-operations.md). **대상은 서울·글로벌 전체 전공의 2010학년도 입학생 이후**이나, 이 범위에 속한 모든 학기·전공의 자료가 확보되었다는 뜻은 아닙니다.

| 자료 종류 | 상세 보존 경계 | 장기 정보 |
|---|---|---|
| 강의 개설·분반 | 현재·예정 및 **최근 3개 학년도**의 요일/시간·강의실·담당 정보 | **권리·검수가 확인된 2010년 이후** 과목×학기×캠퍼스의 개설 여부/관측된 분반 수/완전성/출처 |
| 일반·일회성 공지 | **현재 유효한 최신판**, 종료·정정·취소 후 **90일**의 확인용 상세 | 감사·정정/철회에 필요한 최소 ID·해시·상태·시각 (보존 근거가 있을 때) |
| 반복 학사행사 | 공지의 장문/상세는 수명 종료 후 정리 | 연도별 검증된 개최일·**학생 마감**·정정/취소·대상 및 근거 |
| 졸업요건·학칙 | **2010학년도 이후 입학생에게 적용 가능**한 모든 승인 판본·소급·예외 | 캠퍼스·입학년도·전공/트랙·시행기간·필수요건·동일/대체 관계 |
| FAQ·검색 문단 | 현재 유효한 승인판 중심 | 규정 적용·중대한 정정·감사에 필요한 이전 근거만 |
| 개인정보·원문 파일 | **DB에 업로드하지 않음** | 학생 이수·성적은 브라우저 로컬; 공식 URL·SHA-256·필수 검수 메타데이터만 허용 범위에서 |

**분류 우선순위:** 규정/자격 변경 → 반복 학사행사 → 일반 공지. 같은 공지가 여러 목적이라면 공지 장문은 시한에 따라 정리하더라도 **추출한 행사의 실제 일자 또는 규정의 적용판본**은 별도 관계로 유지합니다. 90일은 검증된 마지막 종료·대체·취소일 기준이며, 불확실하면 자동 정리하지 않고 검수 보류합니다. 게시일을 행사일/학생 마감일로 대체하거나 과거 미관측을 미개설로 확정하지 않습니다.

**승인된 데이터의 가공 흐름:** 사용권과 수집 범위 검사 → 원문 ID/URL/내용 해시 및 관측 시각 확보 → 과목/학기/캠퍼스·공지/개정·학생/행정 마감·행사·RulePack으로 정규화 → 수명주기 분류·중복/충돌 보류 → 독립 검수·승인 → 현재 상세 데이터와 역사 관측/규정 판본으로 분리 발행. 요일·시간·강의실은 과거 3개 학년도 밖의 조회에 사용하지 않습니다.

**이 설치 SQL에서 새로 마련한 필드:** course_offerings.observed_section_count(관측된 분반 수; NULL은 미확정), notice_revisions.retention_class(기본 UNCLASSIFIED)/detail_retain_until(검수된 보존기한 후보), event_occurrences.student_deadline/administrative_deadline. **이 필드가 있다고 자동 보존 기한 계산·DELETE·분반 압축이 실행되는 것은 아닙니다.** 내용이 누락된 경우 운영자가 추측값으로 채우지 않습니다.

**구현 전 병합/인수 차단점:** PR #93의 data_snapshots 및 public.hanmo_public_snapshots는 아직 **전체 JSONB payload를 판본별로 복제**합니다. 공개 RLS로 이전판이 안 보이더라도 DB 용량은 사용합니다. 현행판 외 payload의 안전한 정리, API 부분 조회/페이지네이션과 3개 학년도 이후의 상세 자료 압축은 **#64(스키마/제거 안전성), #65(읽기 API), #66(분류/정규화)**에서 구현·검수해야 합니다. 원문 권리 철회·정정·취소를 피해 구판을 재활성화하지 마세요.

## 최초 승인 데이터 및 갱신 (운영 승인 후 별도 작업)

- 권한 확인된 출처만 `hanmo_private.data_sources`에 등록하고 `rights_status = 'ALLOWED'` 및 확인일을 남깁니다. 학교 회신 전에는 자동 수집·실제 공지/강좌 반입을 실행하지 않습니다.
- `data_snapshots`는 **먼저 `review_state='DRAFT'`로 생성**하고, 그 상태에서만 `source_revisions`/`snapshot_sources`로 출처 판본을 연결·수정합니다. 실제 원문에서 계산한 정확한 SHA-256, `schema_version=1`, 유효기한과 검수할 정규화 페이로드를 등록합니다.
- **출처 연결을 끝낸 다음** 독립 검수/승인 별도 기록을 `source_reviews` / `review_approvals`에 등록하고, 검수 완료 후에만 스냅샷 상태를 `READY`로 전환합니다. **READY 이후 출처 연결 추가·수정·삭제는 거부**되므로 수정이 필요하면 새 스냅샷 ID로 처음부터 다시 검수합니다. 서로 다른 ID만 적는 것으로 실제 신원/권한 분리가 입증되지는 않습니다.
- 위 조건을 충족한 경우에만 **DB 관리자 세션**에서 `SELECT hanmo_private.publish_snapshot('승인된_snapshot_id','실제_운영자_식별자');`를 실행합니다. 이미 공개된 다른 안전한 판본으로 돌아갈 때도 같은 함수로 권리/검수/철회 여부를 다시 확인합니다.
- 출처 권리 철회 또는 권리 확인일이 제거(`NULL`)되면 **공개된 판본뿐 아니라 해당 출처에 연결된 미공개 후보도 `REVOKED`로 영구 철회**되며, `release_audit`에 REVOKE 이력을 기록합니다. 재허용되더라도 이전 스냅샷 ID는 `READY`로 복원·삭제 후 재사용·재발행할 수 없습니다. 새로운 스냅샷 ID로 출처·페이로드·검수·승인을 다시 준비해야 합니다. 필요시 관리자 세션에서 `SELECT hanmo_private.revoke_snapshot('snapshot_id','운영자','철회 이유');`를 실행합니다. **직접 SQL로 철회판본의 `is_active`를 다시 켜는 것도 금지**됩니다.

## Free($0) 운영·복구

- 프로젝트 하나로 시작합니다. 데이터베이스/인덱스/시스템 포함 **250 MB 이하**를 정상 운영 목표로 삼고, **300 MB**부터 최적화를 검토하며, **400 MB**부터 신규 대량 반입을 보류합니다. 이는 **팀의 예방적 기준**이며 Supabase Free 공식 제한과 다릅니다.
- 파일 원본 HTML/PDF·개인 성적·학생 입력 원장을 업로드하지 않습니다. 복구는 임창용 님이 관리하는 **수동 암호화 백업 + 승인된 정적 스냅샷**으로 연습합니다. 유료 백업은 사용하지 않습니다.
- API 오류·만료·철회·스냅샷 불일치 시 안전한 정적 검수본이 없으면 학생에게 **‘확인 필요’**를 표시하고 자동으로 옛 정보를 확정 사실로 재사용하지 않습니다.
- 가격·제한 변경 시에도 **사용자 승인 없이 유료 전환하지 않습니다.** [Supabase 요금](https://supabase.com/pricing)과 실제 Dashboard 사용량을 점검합니다.

## 무료 운영 용량·전송량 실측 (읽기 전용 SQL)

승인된 운영자의 SQL Editor에서 **빈 설치 확인 후** 주기적으로 아래 조회를 실행하여 검수 자료와 함께 기록합니다. 금액이 발생하는 업그레이드/애드온을 켜지 않습니다.

```sql
-- 인덱스 및 Postgres 기본 점유를 포함한 전체 데이터베이스 크기
SELECT pg_size_pretty(pg_database_size(current_database())) AS database_used;

-- 공개·비공개 사용자 테이블별 데이터/인덱스 합계
SELECT n.nspname AS schema_name, c.relname AS table_name,
       pg_size_pretty(pg_total_relation_size(c.oid)) AS table_and_indexes
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname IN ('hanmo_private','public')
  AND c.relkind IN ('r','p')
ORDER BY pg_total_relation_size(c.oid) DESC;

-- 판본 복제로 인한 JSON 공개/후보 payload 크기 (실데이터 승인 후)
SELECT snapshot_id, octet_length(payload::text) AS payload_bytes
FROM hanmo_private.data_snapshots ORDER BY payload_bytes DESC;
```

- **기록:** 표본 학기/캠퍼스·출처 완전성, 보존 등급별 건수·평균 행 크기, 테이블/인덱스 크기, 초기 시스템 점유, 2년 예상 증가, 공개 응답의 실제 바이트 수 및 월간 비캐시/캐시 전송량을 구분합니다. 현재 데이터 0건으로 Free 전체 수용성을 입증했다고 표시하지 않습니다.
- **전송 원칙:** 학생에게 학교 전체 학기를 매 요청마다 보내지 않습니다. 현행 하나의 전체 payload 구조를 사용하는 동안은 배포/연동 전에 응답 크기·사용자 수를 실측하고, 반복 조회로 무료 전송량을 초과할 것으로 예상되면 **#65 경량 어댑터가 승인될 때까지 공개 연결을 보류**합니다.
- **용량 경계:** 250 MB 운영 목표, 300 MB 최적화 검토, 400 MB 대량 반입 보류, 500 MB Free DB 공식 한도. 월 5GB 비캐시/5GB 캐시 전송량은 **서로 다른** 사용량입니다. 실제 Dashboard 수치와 DB/전송 측정치를 월 1회 이상 비교합니다.
- **정리 순서:** 후보 목록·영향행/참조관계·권리·승인 상태 확인 → 현재/역사 데이터 보존 증빙 → 운영자 승인/암호화 백업·복원 → 검수된 별도 마이그레이션/정리 PR 테스트 → 적용 후 회귀·용량 확인. **이 패키지에 자동 삭제 스케줄·운영 데이터 마이그레이션·복원 기능은 포함되지 않습니다.**

## 설치 검증과 이후 작업

```bash
node --test supabase/tests/bootstrap.test.mjs
```

위 Node 검사는 SQL의 **정적 보안·수명주기 필드 게이트**를 확인합니다. [Supabase bootstrap CI](../.github/workflows/supabase-bootstrap-ci.yml)는 별도의 **일회용 PostgreSQL 16 서비스**에서 SQL 전체 설치·권한 검사와 [철회/출처 링크 회귀](../supabase/tests/bootstrap-runtime.sql)를 실제 실행합니다. 이는 실제 Supabase Dashboard 프로젝트의 RLS·Data API·운영 접근 검증을 대신하지 않습니다. 현재 설치 SQL은 행별 자동 TTL·정리/압축·부분 조회, 실제 인적 독립 승인, 실운영 용량 적합성을 검증하지 못합니다. 익명 REST 거부, 실제 운영자 권한, 인덱스/용량, 수동 백업 복원과 **발행·권리회수·수동철회의 동시 실행**은 운영자 승인 환경에서 별도로 검증해야 합니다. 3차는 파일 설치만으로 완료가 아닙니다.

- [#64](https://github.com/ot4562-glitch/Hanmo_develop/issues/64): SQL 상세 스키마·RLS/물리 검증 — 담당 김채윤
- [#65](https://github.com/ot4562-glitch/Hanmo_develop/issues/65): GitHub Pages 읽기 어댑터·안전한 정적 대체
- [#66](https://github.com/ot4562-glitch/Hanmo_develop/issues/66): 권리 승인 후 수집·정규화·검수 연동
- [#67](https://github.com/ot4562-glitch/Hanmo_develop/issues/67): 실환경·정정/철회·장애 복구·제품 회귀 인수

**기준 문서:** [docs/architecture.md §7](../docs/architecture.md#7-3차--supabase-설계인계-및-실제-제품-연계). 1차 학업 코어와 2차 시뮬레이터의 JavaScript/JSDoc 계약을 유지하며, 원본 `html/practice.html`, `html/selectZone.html`은 수정하지 않습니다.
