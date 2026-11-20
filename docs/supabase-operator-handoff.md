# 한모 3차 · Supabase 한 번 설치 패키지

> **담당:** Supabase Free($0) 프로젝트 소유·관리 — **임창용 님**. 개발팀은 설계·검증·장애 복구 공동 지원. 기존 한모 운영 도메인과 원본 모의수강신청에는 영향을 주지 않습니다.

## 운영자 설치 (신규·승인된 빈 프로젝트에서만)

1. 임창용 님이 [Supabase Dashboard](https://supabase.com/dashboard)에서 **Free 프로젝트**를 직접 생성하고 프로젝트/조직 소유권·리전·관리자 접근을 확인합니다. **Pro 및 유료 애드온을 선택하지 않습니다.** SQL 파일로 계정, 조직, 프로젝트는 만들 수 없습니다.
2. 새 프로젝트 **SQL Editor → New query**에서 [hanmo-setup.sql](../supabase/hanmo-setup.sql)의 **전체 내용을 붙여넣어 한 번만 실행**합니다. 이 파일은 내부 스키마와 빈 데이터 테이블, 승인/철회용 관리 함수, 익명 읽기 RLS를 단일 트랜잭션으로 만듭니다. **기존 스키마에 재실행하거나 업그레이드용으로 사용하지 않습니다.**
3. [hanmo-verify.sql](../supabase/hanmo-verify.sql)을 실행합니다. 모든 권한 검사의 **PASS**와 새 프로젝트의 익명 가시 데이터 **0건**을 확인합니다. 오류/FAIL이면 학생 사이트 연결을 중단합니다.
4. 공개 Data API에서 **public 스키마만** 노출하고 \`hanmo_private\`는 절대 노출하지 않습니다. \`public.hanmo_public_snapshots\`만 학생 브라우저의 읽기 대상이며, \`anon\`은 그 테이블의 SELECT만 허용됩니다. 프로젝트 URL과 **publishable key**는 추후 클라이언트 읽기 어댑터 PR에서만 연결합니다.
5. 관리용 SQL Editor/DB 관리자 접근은 임창용 님이 보유합니다. \`service_role\`/secret 키, DB 암호, 민감한 사용자/학교 자료를 저장소·GitHub Pages·정적 번들·이슈·PR에 첨부하지 않습니다.

**설치 후에도 학생용 실데이터는 0건입니다.** 공개 준비를 위해서는 학교의 접근/재배포 승인, 출처별 검수, **서로 다른 실제 검수자와 승인자**의 서명된 기록, 승인된 스냅샷의 해시/유효기한과 정정·취소 시험이 필요합니다. 파일의 \`reviewer_id\`/\`approver_id\`는 문서화용 문자열이므로 **신원 인증의 대체물이 아닙니다**. 운영자 역할을 기술적으로 검증하는 별도 권한 설계 전에는 실운영 공개를 승인하지 마세요.

## 만들어지는 것

| 범위 | 자동 구성 |
|---|---|
| **비공개 데이터 구조** | 출처·사용권·원문 판본, 과목/개설/분반, 교수·담당, 공지/정정·취소, 학사행사/요건, 수집 작업, 후보 스냅샷/근거 연결, 독립 검수/승인, 감사 로그 |
| **공개 API 테이블** | \`public.hanmo_public_snapshots\` — 하나의 활성·유효·비철회 스냅샷만 조회 가능 |
| **보안** | 내부 \`hanmo_private\` 스키마 비노출, RLS, 익명 쓰기 거부, 비공개 관리 함수, 권리 상태 철회 시 공개 스냅샷 자동 무효화 |
| **배포** | 하지 않음 — 프로젝트 생성, 학사자료 업로드, 실제 연결, 권한 검증 및 운영 승인 별도 |

공개 페이로드는 \`schemaVersion=1\`에 대응하며 내부 후보 \`payload\`에 \`notices\`, \`offerings\`, \`faq\` 배열이 있어야 합니다. 게시/개설/FAQ는 반드시 **동일 \`snapshot_id\`·\`manifest_sha256\`** 아래 배포합니다. 가상자료나 [기존 참고용 공지 제목](../data/academic-notices-reference.json)을 별도 검수 없이 승인 자료로 승격하지 마세요.

## 최초 승인 데이터 및 갱신 (운영 승인 후 별도 작업)

- 권한 확인된 출처만 \`hanmo_private.data_sources\`에 등록하고 \`rights_status = 'ALLOWED'\` 및 확인일을 남깁니다. 학교 회신 전에는 자동 수집·실제 공지/강좌 반입을 실행하지 않습니다.
- \`source_revisions\`와 \`snapshot_sources\`로 원문 판본을 연결합니다. \`data_snapshots\`에는 실제 데이터에서 생성한 **정확한 SHA-256**, \`schema_version=1\`, \`review_state='READY'\`, 유효기한 및 정규화된 페이로드를 기록합니다.
- 독립 검수/승인 **별도 기록**을 \`source_reviews\` / \`review_approvals\`에 등록합니다. 서로 다른 ID만 적는 것으로 실제 권한 분리와 신원이 입증되지는 않습니다. 이를 실제 인수 시험으로 검증해야 합니다.
- 위 조건을 충족한 경우에만 **DB 관리자 세션**에서 \`SELECT hanmo_private.publish_snapshot('승인된_snapshot_id','실제_운영자_식별자');\`를 실행합니다. 이미 공개된 다른 안전한 판본으로 돌아갈 때도 같은 함수로 권리/검수/철회 여부를 다시 확인합니다.
- 출처 권리 철회 시 관련 공개 판본은 자동 무효화됩니다. 필요시 관리자 세션에서 \`SELECT hanmo_private.revoke_snapshot('snapshot_id','운영자','철회 이유');\`를 실행합니다. 철회 판본은 다시 활성화할 수 없습니다.

## Free($0) 운영·복구

- 프로젝트 하나로 시작합니다. 데이터베이스/인덱스/시스템 포함 **300 MB**부터 최적화를 검토하고, **400 MB**부터 신규 대량 반입을 보류합니다. 이는 **팀의 예방적 기준**이며 Supabase Free 공식 제한과 다릅니다.
- 파일 원본 HTML/PDF·개인 성적·학생 입력 원장을 업로드하지 않습니다. 복구는 임창용 님이 관리하는 **수동 암호화 백업 + 승인된 정적 스냅샷**으로 연습합니다. 유료 백업은 사용하지 않습니다.
- API 오류·만료·철회·스냅샷 불일치 시 안전한 정적 검수본이 없으면 학생에게 **‘확인 필요’**를 표시하고 자동으로 옛 정보를 확정 사실로 재사용하지 않습니다.
- 가격·제한 변경 시에도 **사용자 승인 없이 유료 전환하지 않습니다.** [Supabase 요금](https://supabase.com/pricing)과 실제 Dashboard 사용량을 점검합니다.

## 설치 검증과 이후 작업

\`\`\`bash
node --test supabase/tests/bootstrap.test.mjs
\`\`\`

이 Node 검사는 SQL 패키지의 **정적 보안 게이트**만 점검합니다. 실제 PostgreSQL 적용/쿼리, 익명 REST 요청 거부, 데이터 접근 권한, 인덱스/용량, 수동 백업 복원은 **운영자 환경에서 반드시 추가 검증**해야 합니다. 3차는 파일 설치만으로 완료가 아닙니다.

- [#64](https://github.com/ot4562-glitch/Hanmo_develop/issues/64): SQL 상세 스키마·RLS/물리 검증 — 담당 김채윤
- [#65](https://github.com/ot4562-glitch/Hanmo_develop/issues/65): GitHub Pages 읽기 어댑터·안전한 정적 대체
- [#66](https://github.com/ot4562-glitch/Hanmo_develop/issues/66): 권리 승인 후 수집·정규화·검수 연동
- [#67](https://github.com/ot4562-glitch/Hanmo_develop/issues/67): 실환경·정정/철회·장애 복구·제품 회귀 인수

**기준 문서:** [docs/architecture.md §7](../docs/architecture.md#7-3차--supabase-설계인계-및-실제-제품-연계). 1차 TypeScript 및 2차 JavaScript는 계속 유지하며, 원본 \`html/practice.html\`, \`html/selectZone.html\`은 수정하지 않습니다.
