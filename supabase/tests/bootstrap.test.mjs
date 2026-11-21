import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const setup = readFileSync(new URL('../hanmo-setup.sql', import.meta.url), 'utf8');
const verify = readFileSync(new URL('../hanmo-verify.sql', import.meta.url), 'utf8');

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
