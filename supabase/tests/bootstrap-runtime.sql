-- 일회용 PostgreSQL 16 테스트 DB에서만 실행합니다. 실제 Supabase 프로젝트에 적용하지 않습니다.
-- 초기 설치의 실제 SQL 실행, 철회 불변성, 출처 링크 잠금, 권한 보안 회귀를 검증합니다.
BEGIN;

INSERT INTO hanmo_private.data_sources
  (source_id, source_url, rights_status, rights_checked_at)
VALUES
  ('ci-source-a','https://example.org/a','ALLOWED',now()),
  ('ci-source-b','https://example.org/b','ALLOWED',now());

INSERT INTO hanmo_private.source_revisions
  (source_revision_id, source_id, content_sha256, observed_at)
VALUES
  ('ci-rev-a','ci-source-a',repeat('a',64),now()),
  ('ci-rev-b','ci-source-b',repeat('b',64),now());

INSERT INTO hanmo_private.data_snapshots
  (snapshot_id, schema_version, manifest_sha256, source_checked_at,
   valid_until, payload, review_state)
VALUES
  ('ci-published',1,repeat('c',64),now(),now()+interval '1 day',
   '{"notices":[],"offerings":[],"faq":[]}'::jsonb,'DRAFT'),
  ('ci-never-published',1,repeat('d',64),now(),now()+interval '1 day',
   '{"notices":[],"offerings":[],"faq":[]}'::jsonb,'DRAFT');

-- 출처 연결은 검수 상태 READY 이전에 끝내야 합니다.
INSERT INTO hanmo_private.snapshot_sources(snapshot_id,source_revision_id)
VALUES ('ci-published','ci-rev-a'),('ci-never-published','ci-rev-b');

INSERT INTO hanmo_private.source_reviews(snapshot_id,reviewer_id,manifest_sha256,decision)
SELECT snapshot_id,'ci-reviewer',manifest_sha256,'APPROVED'
FROM hanmo_private.data_snapshots;

INSERT INTO hanmo_private.review_approvals
  (snapshot_id,reviewer_id,approver_id,manifest_sha256,decision)
SELECT snapshot_id,'ci-reviewer','ci-approver',manifest_sha256,'APPROVED'
FROM hanmo_private.data_snapshots;

UPDATE hanmo_private.data_snapshots SET review_state='READY'
WHERE snapshot_id IN ('ci-published','ci-never-published');

-- 정상 발행은 가능하되 공개판은 하나만 활성화합니다.
SELECT hanmo_private.publish_snapshot('ci-published','ci-operator');
DO $check$
BEGIN
  IF (SELECT count(*) FROM public.hanmo_public_snapshots
      WHERE snapshot_id='ci-published' AND is_active AND revoked_at IS NULL) <> 1 THEN
    RAISE EXCEPTION '정상 발행이 실패했습니다';
  END IF;
END $check$;

-- 출처 변경은 READY 또는 공개 이후에 허용되면 안 됩니다.
DO $check$
BEGIN
  BEGIN
    INSERT INTO hanmo_private.snapshot_sources(snapshot_id,source_revision_id)
    VALUES ('ci-published','ci-rev-b');
    RAISE EXCEPTION 'TEST FAILURE: published source was attached';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%Source links are immutable%' THEN RAISE; END IF;
  END;
  BEGIN
    DELETE FROM hanmo_private.snapshot_sources
    WHERE snapshot_id='ci-never-published' AND source_revision_id='ci-rev-b';
    RAISE EXCEPTION 'TEST FAILURE: reviewed source was removed';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%Source links are immutable%' THEN RAISE; END IF;
  END;
END $check$;

-- 수동 철회 후 예전 READY 승인으로 재발행을 우회할 수 없어야 합니다.
SELECT hanmo_private.revoke_snapshot('ci-published','ci-operator','검수 오류');
DO $check$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM hanmo_private.data_snapshots
    WHERE snapshot_id='ci-published' AND review_state='REVOKED'
  ) OR NOT EXISTS (
    SELECT 1 FROM hanmo_private.release_audit
    WHERE snapshot_id='ci-published' AND action='REVOKE'
  ) THEN RAISE EXCEPTION '철회 상태나 감사 이력이 누락됐습니다'; END IF;
  IF EXISTS (
    SELECT 1 FROM public.hanmo_public_snapshots
    WHERE snapshot_id='ci-published' AND (is_active OR revoked_at IS NULL)
  ) THEN RAISE EXCEPTION '철회 후 공개 상태가 남았습니다'; END IF;
  BEGIN
    UPDATE hanmo_private.data_snapshots SET review_state='READY'
    WHERE snapshot_id='ci-published';
    RAISE EXCEPTION 'TEST FAILURE: revoked READY restored';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%Revoked snapshot cannot return%' THEN RAISE; END IF;
  END;
  BEGIN
    DELETE FROM hanmo_private.data_snapshots WHERE snapshot_id='ci-published';
    RAISE EXCEPTION 'TEST FAILURE: revoked snapshot deleted';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%Revoked snapshot cannot be deleted%' THEN RAISE; END IF;
  END;
  BEGIN
    UPDATE public.hanmo_public_snapshots SET is_active=true
    WHERE snapshot_id='ci-published';
    RAISE EXCEPTION 'TEST FAILURE: revoked publication reactivated';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%Published snapshot contents and revocations are immutable%'
      AND SQLERRM NOT LIKE '%violates check constraint%' THEN RAISE; END IF;
  END;
END $check$;

-- 한 번도 발행하지 않은 후보도 원본 출처 권리 철회 시 영구 철회되어야 합니다.
UPDATE hanmo_private.data_sources
  SET rights_status='REVOKED', rights_checked_at=NULL
  WHERE source_id='ci-source-b';
DO $check$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM hanmo_private.data_snapshots
    WHERE snapshot_id='ci-never-published' AND review_state='REVOKED'
  ) OR NOT EXISTS (
    SELECT 1 FROM hanmo_private.release_audit
    WHERE snapshot_id='ci-never-published' AND action='REVOKE'
  ) THEN
    RAISE EXCEPTION '미공개 후보 권리 철회 이력이 누락됐습니다';
  END IF;
END $check$;

-- 권리 재허용 후에도 이전 후보와 동일한 ID는 기존 승인만으로 재발행할 수 없습니다.
UPDATE hanmo_private.data_sources
  SET rights_status='ALLOWED', rights_checked_at=now()
  WHERE source_id='ci-source-b';

-- 상태 트리거를 테스트 DB에서만 비활성화하여 독립된 감사 이력 방어를 검증합니다.
ALTER TABLE hanmo_private.data_snapshots DISABLE TRIGGER hanmo_snapshot_revocation_guard;
UPDATE hanmo_private.data_snapshots SET review_state='READY'
WHERE snapshot_id='ci-never-published';
ALTER TABLE hanmo_private.data_snapshots ENABLE TRIGGER hanmo_snapshot_revocation_guard;

DO $check$
BEGIN
  BEGIN
    PERFORM hanmo_private.publish_snapshot('ci-never-published','ci-operator');
    RAISE EXCEPTION 'TEST FAILURE: revoked candidate was republished';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%Revoked snapshot ID cannot be republished%' THEN RAISE; END IF;
  END;
END $check$;

-- 테스트 데이터·권한 변경은 커밋하지 않습니다.
ROLLBACK;
