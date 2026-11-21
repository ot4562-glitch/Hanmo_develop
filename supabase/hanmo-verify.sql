-- Hanmo phase-3 bootstrap read-only inspection. Safe to run after setup.
WITH checks AS (
  SELECT 'private_schema_not_exposed_to_anon' AS name,
    NOT has_schema_privilege('anon', 'hanmo_private', 'USAGE') AS passed
  UNION ALL SELECT 'private_schema_not_exposed_to_authenticated',
    NOT has_schema_privilege('authenticated', 'hanmo_private', 'USAGE')
  UNION ALL SELECT 'public_release_rls',
    (SELECT rowsecurity FROM pg_catalog.pg_tables
      WHERE schemaname = 'public' AND tablename = 'hanmo_public_snapshots')
  UNION ALL SELECT 'all_private_tables_rls',
    (SELECT COALESCE(bool_and(rowsecurity), false)
       FROM pg_catalog.pg_tables WHERE schemaname = 'hanmo_private')
  UNION ALL SELECT 'anon_select_only',
    has_table_privilege('anon', 'public.hanmo_public_snapshots', 'SELECT')
    AND NOT has_table_privilege('anon', 'public.hanmo_public_snapshots', 'INSERT')
    AND NOT has_table_privilege('anon', 'public.hanmo_public_snapshots', 'UPDATE')
    AND NOT has_table_privilege('anon', 'public.hanmo_public_snapshots', 'DELETE')
  UNION ALL SELECT 'authenticated_select_only',
    has_table_privilege('authenticated', 'public.hanmo_public_snapshots', 'SELECT')
    AND NOT has_table_privilege('authenticated', 'public.hanmo_public_snapshots', 'INSERT')
    AND NOT has_table_privilege('authenticated', 'public.hanmo_public_snapshots', 'UPDATE')
    AND NOT has_table_privilege('authenticated', 'public.hanmo_public_snapshots', 'DELETE')
  UNION ALL SELECT 'service_role_cannot_write_public_release',
    NOT has_table_privilege('service_role', 'public.hanmo_public_snapshots', 'INSERT')
    AND NOT has_table_privilege('service_role', 'public.hanmo_public_snapshots', 'UPDATE')
    AND NOT has_table_privilege('service_role', 'public.hanmo_public_snapshots', 'DELETE')
  UNION ALL SELECT 'no_anon_private_tables',
    NOT EXISTS (
      SELECT 1 FROM pg_catalog.pg_tables
      WHERE schemaname='hanmo_private'
        AND has_table_privilege('anon', format('%I.%I', schemaname, tablename), 'SELECT')
    )
  UNION ALL SELECT 'active_release_policy',
    EXISTS (SELECT 1 FROM pg_catalog.pg_policies WHERE schemaname='public'
      AND tablename='hanmo_public_snapshots' AND policyname='hanmo_approved_active_read')
  UNION ALL SELECT 'private_publish_not_executable_by_anon',
    NOT has_function_privilege('anon', 'hanmo_private.publish_snapshot(text,text)', 'EXECUTE')
  UNION ALL SELECT 'private_publish_not_executable_by_authenticated',
    NOT has_function_privilege('authenticated', 'hanmo_private.publish_snapshot(text,text)', 'EXECUTE')
  UNION ALL SELECT 'private_publish_not_executable_by_service_role',
    NOT has_function_privilege('service_role', 'hanmo_private.publish_snapshot(text,text)', 'EXECUTE')
)
SELECT name, CASE WHEN passed THEN 'PASS' ELSE 'FAIL' END AS status
FROM checks ORDER BY name;

-- Inspect Free DB use; 300MB review / 400MB halt per architecture §7.6.
SELECT pg_size_pretty(pg_database_size(current_database())) AS current_database_size;

-- No unreviewed academic rows should be visible after a fresh install.
BEGIN;
SET LOCAL ROLE anon;
SELECT count(*) AS anonymous_visible_release_count
FROM public.hanmo_public_snapshots;
ROLLBACK;
