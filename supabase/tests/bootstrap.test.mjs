import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const setup = readFileSync(new URL('../hanmo-setup.sql', import.meta.url), 'utf8');
const verify = readFileSync(new URL('../hanmo-verify.sql', import.meta.url), 'utf8');

test('PL/pgSQL function bodies use matched dollar-quote delimiters', () => {
  const functionCount = (setup.match(/CREATE FUNCTION hanmo_private\./g) || []).length;
  const openingCount = (setup.match(/SECURITY INVOKER SET search_path = pg_catalog AS \$\$/g) || []).length;
  const closingCount = (setup.match(/END \$\$;/g) || []).length;
  assert.equal(openingCount, functionCount);
  // 마지막 DO 블록에도 별도의 종료 구분자가 하나 존재합니다.
  assert.equal(closingCount, functionCount + 1);
});

test('single SQL transaction with empty initial data', () => {
  assert.match(setup, /^BEGIN;\s/m);
  assert.match(setup, /\bCOMMIT;\s*$/);
  // 관리용 발행 함수의 INSERT와 달리 초기 설치 SQL에는 최상위 시드 INSERT가 없어야 합니다.
  assert.doesNotMatch(setup, /^INSERT\s+INTO\b/im);
  assert.doesNotMatch(setup, /\bCOPY\s+.+\s+FROM\b/i);
});

test('private schema is not exposed and RLS is applied', () => {
  assert.match(setup, /CREATE SCHEMA hanmo_private/);
  assert.match(setup, /REVOKE ALL ON SCHEMA hanmo_private FROM PUBLIC, anon, authenticated, service_role/);
  assert.match(setup, /ALTER TABLE public\.hanmo_public_snapshots ENABLE ROW LEVEL SECURITY/);
  assert.match(setup, /ALTER TABLE hanmo_private\.%I ENABLE ROW LEVEL SECURITY/);
  assert.match(setup, /REVOKE ALL ON ALL FUNCTIONS IN SCHEMA hanmo_private FROM PUBLIC, anon, authenticated, service_role/);
});

test('browser can only read a valid active snapshot, not write', () => {
  assert.match(setup, /GRANT SELECT ON public\.hanmo_public_snapshots TO anon, authenticated/);
  assert.match(setup, /FOR SELECT TO anon, authenticated/);
  assert.match(setup, /is_active AND revoked_at IS NULL AND expires_at > now\(\)/);
  assert.doesNotMatch(setup, /GRANT (?:INSERT|UPDATE|DELETE|ALL) ON public\.hanmo_public_snapshots TO anon/i);
});

test('release requires source rights and independent human review records', () => {
  assert.match(setup, /ds\.rights_status <> 'ALLOWED' OR ds\.rights_checked_at IS NULL/);
  assert.match(setup, /rv\.reviewer_id <> ap\.approver_id/);
  assert.match(setup, /rv\.manifest_sha256 = v_snapshot\.manifest_sha256/);
  assert.match(setup, /ap\.manifest_sha256 = v_snapshot\.manifest_sha256/);
  assert.match(setup, /CREATE TRIGGER hanmo_source_rights_gate/);
  assert.match(setup, /AFTER UPDATE OF rights_status, rights_checked_at ON hanmo_private\.data_sources/);
  assert.match(setup, /NEW\.rights_status <> 'ALLOWED' OR NEW\.rights_checked_at IS NULL/);
});

test('revocation is serialized with publication and invalid IDs are rejected', () => {
  assert.match(setup, /CREATE FUNCTION hanmo_private\.revoke_snapshot\([\s\S]*?PERFORM pg_catalog\.pg_advisory_xact_lock\(24031101\)/);
  assert.match(setup, /UPDATE hanmo_private\.data_snapshots SET review_state = 'REVOKED'[\s\S]*?IF NOT FOUND THEN[\s\S]*?RAISE EXCEPTION 'Unknown snapshot'/);
  assert.match(setup, /CREATE FUNCTION hanmo_private\.on_rights_change\(\)[\s\S]*?PERFORM pg_catalog\.pg_advisory_xact_lock\(24031101\)/);
});

test('verify query checks read privileges, RLS and anonymous visibility', () => {
  assert.match(verify, /has_table_privilege\('anon', 'public\.hanmo_public_snapshots', 'INSERT'\)/);
  assert.match(verify, /has_function_privilege\('anon', 'hanmo_private\.publish_snapshot\(text,text\)', 'EXECUTE'\)/);
  assert.match(verify, /SET LOCAL ROLE anon/);
  assert.match(verify, /authenticated_select_only/);
  assert.match(verify, /service_role_cannot_write_public_release/);
  assert.match(verify, /private_publish_not_executable_by_authenticated/);
  assert.match(verify, /private_publish_not_executable_by_service_role/);
});


test('철회한 후보 스냅샷은 상태 복원·삭제·같은 ID의 재발행이 차단된다', () => {
  assert.match(setup, /CREATE TRIGGER hanmo_snapshot_revocation_guard[\s\S]*?BEFORE UPDATE OR DELETE ON hanmo_private\.data_snapshots/);
  assert.match(setup, /OLD\.review_state = 'REVOKED' AND NEW\.review_state <> 'REVOKED'/);
  assert.match(setup, /OLD\.review_state = 'REVOKED'[\s\S]*?Revoked snapshot cannot be deleted/);
  assert.match(setup, /SELECT 1 FROM hanmo_private\.release_audit[\s\S]*?snapshot_id = p_snapshot_id AND action = 'REVOKE'/);
  assert.match(setup, /RAISE EXCEPTION 'Revoked snapshot ID cannot be republished'/);
});

test('공개 전 권리 철회도 모든 연결 후보의 REVOKE 감사 이력을 남긴다', () => {
  const onRights = setup.match(/CREATE FUNCTION hanmo_private\.on_rights_change\(\)[\s\S]*?END \$\$;/)?.[0]??'';
  assert.match(onRights, /INSERT INTO hanmo_private\.release_audit[\s\S]*?SELECT DISTINCT ss\.snapshot_id/);
  assert.match(onRights, /JOIN hanmo_private\.source_revisions sr[\s\S]*?WHERE sr\.source_id = NEW\.source_id;/);
  assert.doesNotMatch(onRights, /JOIN public\.hanmo_public_snapshots pub/);
  assert.match(onRights, /UPDATE hanmo_private\.data_snapshots SET review_state = 'REVOKED'/);
});

test('검수 전 DRAFT에서만 출처 링크를 편집하며 발행·권리철회와 동시 실행을 직렬화한다', () => {
  const guard = setup.match(/CREATE FUNCTION hanmo_private\.guard_snapshot_source_links\(\)[\s\S]*?END \$\$;/)?.[0]??'';
  assert.match(guard, /pg_advisory_xact_lock\(24031101\)/);
  assert.match(guard, /FROM hanmo_private\.data_snapshots WHERE snapshot_id = v_snapshot_id FOR UPDATE/);
  assert.match(guard, /v_review_state IS DISTINCT FROM 'DRAFT'/);
  assert.match(guard, /FROM public\.hanmo_public_snapshots WHERE snapshot_id = v_snapshot_id/);
  assert.match(setup, /CREATE TRIGGER hanmo_snapshot_sources_guard[\s\S]*?BEFORE INSERT OR UPDATE OR DELETE ON hanmo_private\.snapshot_sources/);
});

test('공개 철회된 판본의 is_active 재설정은 트리거와 CHECK 제약으로 이중 차단한다', () => {
  assert.match(setup, /CHECK \(revoked_at IS NULL OR NOT is_active\)/);
  assert.match(setup, /NEW\.revoked_at IS NOT NULL AND NEW\.is_active/);
});

test('검증 SQL은 비공개 발행·철회 및 모든 관리 함수의 역할별 실행 권한을 검사한다', () => {
  for(const role of ['anon','authenticated','service_role']){
    assert.match(verify, new RegExp('private_revoke_not_executable_by_'+role));
    assert.match(verify, new RegExp(role+'_denied_all_private_functions'));
    assert.match(verify, new RegExp("has_function_privilege\\('"+role+"', p\\.oid, 'EXECUTE'\\)"));
  }
  assert.match(verify,/revoked_snapshot_state_guard_installed/);
  assert.match(verify,/reviewed_source_links_guard_installed/);
});

test('역사적 강의 개설은 분반 상세와 독립적으로 관측 수를 남길 수 있다', () => {
  const offering = setup.match(/CREATE TABLE hanmo_private\.course_offerings \(([\s\S]*?)\n\);/)?.[1];
  const section = setup.match(/CREATE TABLE hanmo_private\.sections \(([\s\S]*?)\n\);/)?.[1];
  assert.ok(offering);
  assert.ok(section);
  assert.match(offering, /observed_section_count integer CHECK \(observed_section_count >= 0\)/);
  assert.match(offering, /observation_complete boolean NOT NULL DEFAULT false/);
  assert.match(offering, /offering_status <> 'NOT_OFFERED' OR observation_complete/);
  assert.doesNotMatch(offering, /day_time|location_label/);
  assert.match(section, /day_time jsonb/);
  assert.match(section, /location_label text/);
});

test('공지 수명주기 분류와 역사적 행사 학생 마감을 구조적으로 분리한다', () => {
  const notices = setup.match(/CREATE TABLE hanmo_private\.notice_revisions \(([\s\S]*?)\n\);/)?.[1];
  const events = setup.match(/CREATE TABLE hanmo_private\.event_occurrences \(([\s\S]*?)\n\);/)?.[1];
  assert.ok(notices);
  assert.ok(events);
  assert.match(notices, /retention_class text NOT NULL DEFAULT 'UNCLASSIFIED'/);
  assert.match(notices, /'CURRENT_ONLY','EVENT_HISTORY','RULE_HISTORY'/);
  assert.match(notices, /detail_retain_until timestamptz/);
  assert.match(events, /student_deadline timestamptz/);
  assert.match(events, /administrative_deadline timestamptz/);
  // 보존 기한 필드가 생겼다고 실데이터를 자동 삭제하지는 않습니다.
  assert.doesNotMatch(setup, /\b(?:pg_cron|cron\.schedule)\b/);
});
