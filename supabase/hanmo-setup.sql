-- 한모 3차: Supabase 신규 프로젝트용 단회 설치 SQL, v1.
-- 운영자가 승인한 새 Free 프로젝트의 SQL Editor에서 한 번만 실행합니다.
-- 실제 학교 자료를 반입하지 않으며 초기 공개 데이터는 비어 있습니다.
-- 재실행은 실패합니다. 이 파일을 마이그레이션/업그레이드에 사용하지 마세요.
BEGIN;

CREATE SCHEMA hanmo_private;
REVOKE ALL ON SCHEMA hanmo_private FROM PUBLIC, anon, authenticated, service_role;

CREATE TABLE hanmo_private.data_sources (
  source_id text PRIMARY KEY,
  source_url text NOT NULL CHECK (source_url ~ '^https://'),
  rights_status text NOT NULL DEFAULT 'UNKNOWN'
    CHECK (rights_status IN ('UNKNOWN','ALLOWED','LIMITED','DENIED','REVOKED')),
  rights_checked_at timestamptz,
  rights_note text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE hanmo_private.source_revisions (
  source_revision_id text PRIMARY KEY,
  source_id text NOT NULL REFERENCES hanmo_private.data_sources(source_id),
  content_sha256 text NOT NULL CHECK (content_sha256 ~ '^[0-9a-f]{64}$'),
  observed_at timestamptz NOT NULL,
  UNIQUE (source_id, content_sha256)
);

CREATE TABLE hanmo_private.courses (
  course_id text PRIMARY KEY,
  course_code text NOT NULL,
  title text NOT NULL,
  credit_units numeric(5,2) CHECK (credit_units >= 0),
  requirement_area text,
  equivalence_group text
);

CREATE TABLE hanmo_private.course_offerings (
  offering_id text PRIMARY KEY,
  course_id text NOT NULL REFERENCES hanmo_private.courses(course_id),
  term_id text NOT NULL,
  campus text NOT NULL CHECK (campus IN ('SEOUL','GLOBAL')),
  offering_status text NOT NULL CHECK (offering_status IN ('OFFERED','NOT_OFFERED','UNKNOWN')),
  observation_complete boolean NOT NULL DEFAULT false,
  -- 자세한 분반/시간표를 정리해도 역사적 관측 개수를 보존합니다.
  -- 완전성 미확인 상태의 관측 분반 수를 전체 분반 수로 단정하지 않습니다.
  observed_section_count integer CHECK (observed_section_count >= 0),
  source_revision_id text NOT NULL REFERENCES hanmo_private.source_revisions(source_revision_id),
  CHECK (offering_status <> 'NOT_OFFERED' OR observation_complete),
  UNIQUE (course_id, term_id, campus, source_revision_id)
);
CREATE INDEX hanmo_offerings_lookup ON hanmo_private.course_offerings (campus, term_id, course_id);

CREATE TABLE hanmo_private.sections (
  section_id text PRIMARY KEY,
  offering_id text NOT NULL REFERENCES hanmo_private.course_offerings(offering_id),
  section_code text NOT NULL,
  day_time jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(day_time) = 'array'),
  location_label text,
  UNIQUE (offering_id, section_code)
);

CREATE TABLE hanmo_private.faculty (
  faculty_id text PRIMARY KEY,
  public_display_name text NOT NULL,
  department text
);

CREATE TABLE hanmo_private.teaching_assignments (
  section_id text NOT NULL REFERENCES hanmo_private.sections(section_id),
  faculty_id text NOT NULL REFERENCES hanmo_private.faculty(faculty_id),
  PRIMARY KEY (section_id, faculty_id)
);

CREATE TABLE hanmo_private.academic_notices (
  notice_id text PRIMARY KEY,
  source_id text NOT NULL REFERENCES hanmo_private.data_sources(source_id),
  canonical_url text NOT NULL CHECK (canonical_url ~ '^https://')
);

CREATE TABLE hanmo_private.notice_revisions (
  revision_id text PRIMARY KEY,
  notice_id text NOT NULL REFERENCES hanmo_private.academic_notices(notice_id),
  source_revision_id text NOT NULL REFERENCES hanmo_private.source_revisions(source_revision_id),
  title text NOT NULL,
  published_at timestamptz,
  student_deadline timestamptz,
  administrative_deadline timestamptz,
  revision_state text NOT NULL CHECK (revision_state IN ('ACTIVE','CORRECTED','CANCELLED','UNKNOWN')),
  -- 원문 상세 보존과 역사적 행사/규정 데이터의 보존 판단을 분리합니다.
  -- 종료일과 분류가 미확정이면 자동 삭제하지 않는 검수 대기 상태입니다.
  retention_class text NOT NULL DEFAULT 'UNCLASSIFIED'
    CHECK (retention_class IN ('UNCLASSIFIED','CURRENT_ONLY','EVENT_HISTORY','RULE_HISTORY')),
  detail_retain_until timestamptz,
  audience jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(audience)='object'),
  UNIQUE (notice_id, source_revision_id)
);
CREATE INDEX hanmo_notice_revision_lookup ON hanmo_private.notice_revisions (notice_id, published_at DESC);

CREATE TABLE hanmo_private.academic_events (
  event_id text PRIMARY KEY,
  revision_id text REFERENCES hanmo_private.notice_revisions(revision_id),
  event_type text NOT NULL,
  campus text CHECK (campus IN ('SEOUL','GLOBAL')),
  event_start timestamptz,
  student_deadline timestamptz,
  source_revision_id text REFERENCES hanmo_private.source_revisions(source_revision_id)
);

CREATE TABLE hanmo_private.graduation_rules (
  rule_pack_id text PRIMARY KEY,
  program_code text NOT NULL,
  campus text NOT NULL CHECK (campus IN ('SEOUL','GLOBAL')),
  cohort_from integer NOT NULL CHECK (cohort_from >= 2010),
  cohort_to integer CHECK (cohort_to IS NULL OR cohort_to >= cohort_from),
  valid_from date NOT NULL,
  valid_to date CHECK (valid_to IS NULL OR valid_to >= valid_from),
  source_revision_id text NOT NULL REFERENCES hanmo_private.source_revisions(source_revision_id)
);

CREATE TABLE hanmo_private.program_requirements (
  requirement_id text PRIMARY KEY,
  rule_pack_id text NOT NULL REFERENCES hanmo_private.graduation_rules(rule_pack_id),
  semantic_key text NOT NULL,
  requirement_data jsonb NOT NULL CHECK (jsonb_typeof(requirement_data)='object'),
  UNIQUE (rule_pack_id, semantic_key)
);

CREATE TABLE hanmo_private.event_series (
  series_id text PRIMARY KEY,
  event_type text NOT NULL,
  campus text CHECK (campus IN ('SEOUL','GLOBAL')),
  summary text
);

CREATE TABLE hanmo_private.event_occurrences (
  occurrence_id text PRIMARY KEY,
  series_id text NOT NULL REFERENCES hanmo_private.event_series(series_id),
  source_revision_id text REFERENCES hanmo_private.source_revisions(source_revision_id),
  occurrence_state text NOT NULL CHECK (occurrence_state IN ('CONFIRMED','CORRECTED','CANCELLED','HISTORICAL_ESTIMATE')),
  starts_at timestamptz,
  ends_at timestamptz,
  -- 반복 행사 원문이 만료되어도 검증된 실제 학생 마감을 유지합니다.
  student_deadline timestamptz,
  administrative_deadline timestamptz,
  CHECK (ends_at IS NULL OR starts_at IS NULL OR ends_at >= starts_at)
);

CREATE TABLE hanmo_private.sync_runs (
  sync_run_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  source_id text REFERENCES hanmo_private.data_sources(source_id),
  stage text NOT NULL CHECK (stage IN ('PERMISSION_CHECK','FETCH','NORMALIZE','QUARANTINE','REVIEW','INDEPENDENT_APPROVAL','PUBLISH','MONITOR','FAILED')),
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  details text
);

CREATE TABLE hanmo_private.data_snapshots (
  snapshot_id text PRIMARY KEY,
  schema_version integer NOT NULL CHECK (schema_version = 1),
  manifest_sha256 text NOT NULL CHECK (manifest_sha256 ~ '^[0-9a-f]{64}$'),
  faq_index_revision text,
  source_checked_at timestamptz NOT NULL,
  valid_until timestamptz NOT NULL,
  payload jsonb NOT NULL
    CHECK (jsonb_typeof(payload)='object'
      AND jsonb_typeof(payload->'notices')='array'
      AND jsonb_typeof(payload->'offerings')='array'
      AND jsonb_typeof(payload->'faq')='array'),
  review_state text NOT NULL DEFAULT 'DRAFT'
    CHECK (review_state IN ('DRAFT','READY','REVOKED')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE hanmo_private.snapshot_sources (
  snapshot_id text NOT NULL REFERENCES hanmo_private.data_snapshots(snapshot_id),
  source_revision_id text NOT NULL REFERENCES hanmo_private.source_revisions(source_revision_id),
  PRIMARY KEY (snapshot_id, source_revision_id)
);

CREATE TABLE hanmo_private.source_reviews (
  snapshot_id text NOT NULL REFERENCES hanmo_private.data_snapshots(snapshot_id),
  reviewer_id text NOT NULL,
  manifest_sha256 text NOT NULL CHECK (manifest_sha256 ~ '^[0-9a-f]{64}$'),
  decision text NOT NULL CHECK (decision IN ('APPROVED','REJECTED')),
  reviewed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (snapshot_id, reviewer_id)
);

CREATE TABLE hanmo_private.review_approvals (
  snapshot_id text NOT NULL,
  reviewer_id text NOT NULL,
  approver_id text NOT NULL,
  manifest_sha256 text NOT NULL CHECK (manifest_sha256 ~ '^[0-9a-f]{64}$'),
  decision text NOT NULL CHECK (decision IN ('APPROVED','REJECTED')),
  approved_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (snapshot_id, reviewer_id, approver_id),
  FOREIGN KEY (snapshot_id, reviewer_id)
    REFERENCES hanmo_private.source_reviews(snapshot_id, reviewer_id),
  CHECK (reviewer_id <> approver_id)
);

CREATE TABLE hanmo_private.release_audit (
  audit_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  snapshot_id text NOT NULL,
  action text NOT NULL CHECK (action IN ('PUBLISH','REACTIVATE','REVOKE')),
  operator_label text NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  detail text
);

-- 학생 브라우저가 읽을 수 있는 한모 데이터 테이블은 이 테이블뿐입니다.
-- 비공개 검수·신원·성적·원문 자료는 초기 설치 과정에서 추가하지 않습니다.
CREATE TABLE public.hanmo_public_snapshots (
  snapshot_id text PRIMARY KEY,
  schema_version integer NOT NULL CHECK (schema_version = 1),
  manifest_sha256 text NOT NULL CHECK (manifest_sha256 ~ '^[0-9a-f]{64}$'),
  faq_index_revision text,
  source_checked_at timestamptz NOT NULL,
  published_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  is_active boolean NOT NULL DEFAULT false,
  payload jsonb NOT NULL CHECK (jsonb_typeof(payload) = 'object'),
  CHECK (expires_at > published_at),
  -- 철회된 판본은 운영자 직접 UPDATE로도 활성화할 수 없습니다.
  CHECK (revoked_at IS NULL OR NOT is_active)
);
CREATE UNIQUE INDEX hanmo_one_active_snapshot
  ON public.hanmo_public_snapshots ((true)) WHERE is_active;

ALTER TABLE public.hanmo_public_snapshots ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.hanmo_public_snapshots FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON public.hanmo_public_snapshots TO anon, authenticated;
CREATE POLICY hanmo_approved_active_read ON public.hanmo_public_snapshots
  FOR SELECT TO anon, authenticated
  USING (is_active AND revoked_at IS NULL AND expires_at > now());

-- REVOKED 상태는 복구할 수 없으며, 같은 ID의 재활성화는 감사 이력으로도 차단합니다.
CREATE FUNCTION hanmo_private.guard_snapshot_revocation()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.review_state = 'REVOKED' THEN
      RAISE EXCEPTION 'Revoked snapshot cannot be deleted or reused';
    END IF;
    RETURN OLD;
  END IF;
  IF OLD.review_state = 'REVOKED' AND NEW.review_state <> 'REVOKED' THEN
    RAISE EXCEPTION 'Revoked snapshot cannot return to READY or DRAFT';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER hanmo_snapshot_revocation_guard
  BEFORE UPDATE OR DELETE ON hanmo_private.data_snapshots
  FOR EACH ROW EXECUTE FUNCTION hanmo_private.guard_snapshot_revocation();

-- 검수 완료 후 출처를 바꾸면 기존 승인에 미검수 출처를 끼워 넣을 수 있습니다.
-- 발행·철회와 같은 잠금을 이용해 DRAFT의 출처 변경만 허용합니다.
CREATE FUNCTION hanmo_private.guard_snapshot_source_links()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog AS $$
DECLARE
  v_snapshot_id text;
  v_review_state text;
BEGIN
  PERFORM pg_catalog.pg_advisory_xact_lock(24031101);
  IF TG_OP = 'DELETE' THEN
    v_snapshot_id := OLD.snapshot_id;
  ELSE
    v_snapshot_id := NEW.snapshot_id;
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.snapshot_id IS DISTINCT FROM OLD.snapshot_id THEN
    RAISE EXCEPTION 'Source links cannot be moved between snapshots';
  END IF;
  -- 부모 스냅샷을 잠가 DRAFT→READY 변경과 출처 연결 변경을 직렬화합니다.
  SELECT review_state INTO v_review_state
    FROM hanmo_private.data_snapshots WHERE snapshot_id = v_snapshot_id FOR UPDATE;
  -- DRAFT라도 검수 기록이 한 건이라도 생기면 출처 연결을 잠급니다.
  -- 검수 후 출처 교체는 기존 manifest 승인 기록을 재사용할 위험이 있으므로 새 스냅샷에서 재검수합니다.
  IF v_review_state IS DISTINCT FROM 'DRAFT' OR EXISTS (
    SELECT 1 FROM public.hanmo_public_snapshots WHERE snapshot_id = v_snapshot_id
  ) OR EXISTS (
    SELECT 1 FROM hanmo_private.source_reviews WHERE snapshot_id = v_snapshot_id
  ) OR EXISTS (
    SELECT 1 FROM hanmo_private.review_approvals WHERE snapshot_id = v_snapshot_id
  ) THEN
    RAISE EXCEPTION 'Source links are immutable after review or publication';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER hanmo_snapshot_sources_guard
  BEFORE INSERT OR UPDATE OR DELETE ON hanmo_private.snapshot_sources
  FOR EACH ROW EXECUTE FUNCTION hanmo_private.guard_snapshot_source_links();

-- 아래 발행·철회 함수는 SQL Editor의 운영자/DB 관리자만 호출합니다.
-- 검수자 표시명은 감사용 문자열이며 인증된 신원의 증명이 아닙니다.
CREATE FUNCTION hanmo_private.publish_snapshot(p_snapshot_id text, p_operator_label text)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog AS $$
DECLARE
  v_snapshot hanmo_private.data_snapshots%ROWTYPE;
  v_existing public.hanmo_public_snapshots%ROWTYPE;
BEGIN
  PERFORM pg_catalog.pg_advisory_xact_lock(24031101);
  SELECT * INTO v_snapshot
    FROM hanmo_private.data_snapshots WHERE snapshot_id = p_snapshot_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Unknown snapshot'; END IF;
  IF EXISTS (
    SELECT 1 FROM hanmo_private.release_audit
    WHERE snapshot_id = p_snapshot_id AND action = 'REVOKE'
  ) THEN RAISE EXCEPTION 'Revoked snapshot ID cannot be republished'; END IF;
  IF v_snapshot.review_state <> 'READY' OR v_snapshot.valid_until <= now() THEN
    RAISE EXCEPTION 'Snapshot is not ready and valid';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM hanmo_private.snapshot_sources WHERE snapshot_id = p_snapshot_id) THEN
    RAISE EXCEPTION 'Snapshot has no verified sources';
  END IF;
  IF EXISTS (
    SELECT 1 FROM hanmo_private.snapshot_sources ss
      JOIN hanmo_private.source_revisions sr ON sr.source_revision_id = ss.source_revision_id
      JOIN hanmo_private.data_sources ds ON ds.source_id = sr.source_id
    WHERE ss.snapshot_id = p_snapshot_id
      AND (ds.rights_status <> 'ALLOWED' OR ds.rights_checked_at IS NULL)
  ) THEN RAISE EXCEPTION 'Source rights are not approved'; END IF;
  IF EXISTS (
    SELECT 1 FROM hanmo_private.source_reviews
    WHERE snapshot_id = p_snapshot_id AND decision = 'REJECTED'
  ) OR EXISTS (
    SELECT 1 FROM hanmo_private.review_approvals
    WHERE snapshot_id = p_snapshot_id AND decision = 'REJECTED'
  ) THEN RAISE EXCEPTION 'A rejection requires a new reviewed snapshot'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM hanmo_private.source_reviews rv
      JOIN hanmo_private.review_approvals ap
        ON ap.snapshot_id = rv.snapshot_id AND ap.reviewer_id = rv.reviewer_id
    WHERE rv.snapshot_id = p_snapshot_id
      AND rv.decision = 'APPROVED' AND ap.decision = 'APPROVED'
      AND rv.manifest_sha256 = v_snapshot.manifest_sha256
      AND ap.manifest_sha256 = v_snapshot.manifest_sha256
      AND rv.reviewer_id <> ap.approver_id
  ) THEN RAISE EXCEPTION 'Independent review/approval not recorded'; END IF;
  SELECT * INTO v_existing FROM public.hanmo_public_snapshots
    WHERE snapshot_id = p_snapshot_id;
  IF FOUND AND (
    v_existing.revoked_at IS NOT NULL OR
    v_existing.manifest_sha256 <> v_snapshot.manifest_sha256 OR
    v_existing.payload <> v_snapshot.payload OR
    v_existing.expires_at <> v_snapshot.valid_until
  ) THEN RAISE EXCEPTION 'Existing release cannot be overwritten/reactivated'; END IF;
  UPDATE public.hanmo_public_snapshots SET is_active = false WHERE is_active;
  INSERT INTO public.hanmo_public_snapshots
    (snapshot_id, schema_version, manifest_sha256, faq_index_revision,
      source_checked_at, published_at, expires_at, is_active, payload)
  VALUES (v_snapshot.snapshot_id, v_snapshot.schema_version,
    v_snapshot.manifest_sha256, v_snapshot.faq_index_revision,
    v_snapshot.source_checked_at, now(), v_snapshot.valid_until, true, v_snapshot.payload)
  ON CONFLICT (snapshot_id) DO UPDATE SET is_active = true;
  INSERT INTO hanmo_private.release_audit (snapshot_id, action, operator_label)
    VALUES (p_snapshot_id, CASE WHEN v_existing.snapshot_id IS NULL THEN 'PUBLISH' ELSE 'REACTIVATE' END,
      p_operator_label);
END $$;

CREATE FUNCTION hanmo_private.revoke_snapshot(
  p_snapshot_id text, p_operator_label text, p_reason text
) RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog AS $$
BEGIN
  IF NULLIF(btrim(p_reason), '') IS NULL THEN
    RAISE EXCEPTION 'Revocation reason is required';
  END IF;
  -- 발행과 수동 철회를 동일한 트랜잭션 잠금으로 직렬화합니다.
  PERFORM pg_catalog.pg_advisory_xact_lock(24031101);
  UPDATE hanmo_private.data_snapshots SET review_state = 'REVOKED'
    WHERE snapshot_id = p_snapshot_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Unknown snapshot';
  END IF;
  UPDATE public.hanmo_public_snapshots SET is_active = false,
    revoked_at = COALESCE(revoked_at, now()) WHERE snapshot_id = p_snapshot_id;
  INSERT INTO hanmo_private.release_audit (snapshot_id, action, operator_label, detail)
    VALUES (p_snapshot_id, 'REVOKE', p_operator_label, p_reason);
END $$;

-- 출처 사용권 회수 또는 권리 확인 시각 제거 시 관련 공개판본을 무효화합니다.
-- 직접 API 조회도 차단하지만 이 트리거만으로 독립 검수가 증명되지는 않습니다.
CREATE FUNCTION hanmo_private.on_rights_change()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog AS $$
BEGIN
  -- 발행이 권리 회수를 앞질러 공개판본을 남기지 않도록 잠금을 공유합니다.
  PERFORM pg_catalog.pg_advisory_xact_lock(24031101);
  IF OLD.rights_status = 'ALLOWED'
    AND (NEW.rights_status <> 'ALLOWED' OR NEW.rights_checked_at IS NULL) THEN
    INSERT INTO hanmo_private.release_audit (snapshot_id, action, operator_label, detail)
    SELECT DISTINCT ss.snapshot_id, 'REVOKE', 'SYSTEM',
      'Rights changed for source ' || NEW.source_id
    FROM hanmo_private.snapshot_sources ss
      JOIN hanmo_private.source_revisions sr
        ON sr.source_revision_id = ss.source_revision_id
    WHERE sr.source_id = NEW.source_id;
    -- 공개 전 후보까지 REVOKE 이력을 남겨 동일 ID의 우회 재발행을 거부합니다.
    UPDATE hanmo_private.data_snapshots SET review_state = 'REVOKED'
      WHERE snapshot_id IN (
        SELECT ss.snapshot_id FROM hanmo_private.snapshot_sources ss
          JOIN hanmo_private.source_revisions sr
            ON sr.source_revision_id = ss.source_revision_id
        WHERE sr.source_id = NEW.source_id
      );
    UPDATE public.hanmo_public_snapshots
      SET is_active = false, revoked_at = COALESCE(revoked_at, now())
    WHERE snapshot_id IN (
      SELECT ss.snapshot_id FROM hanmo_private.snapshot_sources ss
        JOIN hanmo_private.source_revisions sr
          ON sr.source_revision_id = ss.source_revision_id
      WHERE sr.source_id = NEW.source_id
    );
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER hanmo_source_rights_gate
  AFTER UPDATE OF rights_status, rights_checked_at ON hanmo_private.data_sources
  FOR EACH ROW EXECUTE FUNCTION hanmo_private.on_rights_change();

-- 공개판본은 활성 상태와 비가역적 철회 이외의 내용을 변경할 수 없습니다.
CREATE FUNCTION hanmo_private.guard_public_release()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog AS $$
BEGIN
  IF NEW.snapshot_id IS DISTINCT FROM OLD.snapshot_id
    OR NEW.schema_version IS DISTINCT FROM OLD.schema_version
    OR NEW.manifest_sha256 IS DISTINCT FROM OLD.manifest_sha256
    OR NEW.faq_index_revision IS DISTINCT FROM OLD.faq_index_revision
    OR NEW.source_checked_at IS DISTINCT FROM OLD.source_checked_at
    OR NEW.published_at IS DISTINCT FROM OLD.published_at
    OR NEW.expires_at IS DISTINCT FROM OLD.expires_at
    OR NEW.payload IS DISTINCT FROM OLD.payload
    OR (OLD.revoked_at IS NOT NULL AND NEW.revoked_at IS DISTINCT FROM OLD.revoked_at)
    OR (NEW.revoked_at IS NOT NULL AND NEW.is_active)
  THEN RAISE EXCEPTION 'Published snapshot contents and revocations are immutable'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER hanmo_release_immutability
  BEFORE UPDATE ON public.hanmo_public_snapshots
  FOR EACH ROW EXECUTE FUNCTION hanmo_private.guard_public_release();

-- 방어 계층: 비공개 테이블 모두 RLS를 활성화하고 클라이언트 정책은 추가하지 않습니다.
DO $$
DECLARE row_name text;
BEGIN
  FOR row_name IN
    SELECT tablename FROM pg_catalog.pg_tables WHERE schemaname = 'hanmo_private'
  LOOP
    EXECUTE pg_catalog.format('ALTER TABLE hanmo_private.%I ENABLE ROW LEVEL SECURITY', row_name);
  END LOOP;
END $$;
REVOKE ALL ON ALL TABLES IN SCHEMA hanmo_private FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA hanmo_private FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA hanmo_private FROM PUBLIC, anon, authenticated, service_role;
COMMIT;
