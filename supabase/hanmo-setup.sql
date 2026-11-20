-- Hanmo Develop, phase 3: ONE-TIME Supabase bootstrap, v1.
-- Execute once in a NEW, operator-approved Free project via SQL Editor.
-- No real academic data is imported and nothing is publicly published.
-- Fails on repeat: do not use this installer as a migration/upgrade tool.
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

-- The ONLY browser-readable Hanmo data table. No raw review, identity,
-- transcripts, grades, or document contents are added by this installer.
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
  CHECK (expires_at > published_at)
);
CREATE UNIQUE INDEX hanmo_one_active_snapshot
  ON public.hanmo_public_snapshots ((true)) WHERE is_active;

ALTER TABLE public.hanmo_public_snapshots ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.hanmo_public_snapshots FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON public.hanmo_public_snapshots TO anon, authenticated;
CREATE POLICY hanmo_approved_active_read ON public.hanmo_public_snapshots
  FOR SELECT TO anon, authenticated
  USING (is_active AND revoked_at IS NULL AND expires_at > now());

-- Only SQL Editor operator/database admin may call the following functions.
-- Reviewer names are audit labels, NOT authenticated identity verification.
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
  UPDATE hanmo_private.data_snapshots SET review_state = 'REVOKED'
    WHERE snapshot_id = p_snapshot_id;
  UPDATE public.hanmo_public_snapshots SET is_active = false,
    revoked_at = COALESCE(revoked_at, now()) WHERE snapshot_id = p_snapshot_id;
  INSERT INTO hanmo_private.release_audit (snapshot_id, action, operator_label, detail)
    VALUES (p_snapshot_id, 'REVOKE', p_operator_label, p_reason);
END $$;

-- Rights withdrawal immediately hides linked releases, including direct API lookups.
CREATE FUNCTION hanmo_private.on_rights_change()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog AS $$
BEGIN
  IF OLD.rights_status = 'ALLOWED' AND NEW.rights_status <> 'ALLOWED' THEN
    INSERT INTO hanmo_private.release_audit (snapshot_id, action, operator_label, detail)
    SELECT DISTINCT ss.snapshot_id, 'REVOKE', 'SYSTEM',
      'Rights changed for source ' || NEW.source_id
    FROM hanmo_private.snapshot_sources ss
      JOIN hanmo_private.source_revisions sr
        ON sr.source_revision_id = ss.source_revision_id
      JOIN public.hanmo_public_snapshots pub ON pub.snapshot_id = ss.snapshot_id
    WHERE sr.source_id = NEW.source_id AND pub.revoked_at IS NULL;
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
  AFTER UPDATE OF rights_status ON hanmo_private.data_sources
  FOR EACH ROW EXECUTE FUNCTION hanmo_private.on_rights_change();

-- Public releases are immutable except activation and irreversible revocation.
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
  THEN RAISE EXCEPTION 'Published snapshot contents and revocations are immutable'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER hanmo_release_immutability
  BEFORE UPDATE ON public.hanmo_public_snapshots
  FOR EACH ROW EXECUTE FUNCTION hanmo_private.guard_public_release();

-- Defense in depth: all non-exposed tables are RLS-enabled, with NO client policies.
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
