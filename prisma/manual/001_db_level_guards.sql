-- =============================================================================
--  e-SAPS — database-level guards that Prisma's schema DSL cannot express.
--
--  Prisma does not support CHECK constraints or append-only triggers in
--  schema.prisma, so apply these AFTER the generated migration creates the
--  tables. Recommended flow (you run these yourself):
--
--    1) npx prisma migrate dev --name init --create-only
--    2) paste the statements below at the END of the generated file
--         prisma/migrations/<timestamp>_init/migration.sql
--    3) npx prisma migrate dev          # applies tables + guards together
--
--  Alternatively, after `prisma migrate deploy`, run this file once with psql:
--    psql "$DATABASE_URL" -f prisma/manual/001_db_level_guards.sql
-- =============================================================================

-- 1) No anonymous vehicles. A vehicle_permits row must link to EXACTLY ONE of an
--    employee OR a visitor permit — never both, never neither. The DB is the last
--    line of defense even if the application layer is buggy or bypassed.
ALTER TABLE vehicle_permits
  ADD CONSTRAINT vehicle_must_have_owner CHECK (
    (employee_id IS NOT NULL AND visitor_permit_id IS NULL)
    OR
    (employee_id IS NULL AND visitor_permit_id IS NOT NULL)
  );

-- 2) audit_logs is APPEND-ONLY for everyone (including admins). Allow INSERT and
--    SELECT; block UPDATE and DELETE at the row level via a trigger so the
--    security history can never be rewritten or erased.
CREATE OR REPLACE FUNCTION audit_logs_block_mutation()
  RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'audit_logs is append-only: % is not permitted', TG_OP;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER audit_logs_no_update
  BEFORE UPDATE ON audit_logs
  FOR EACH ROW EXECUTE FUNCTION audit_logs_block_mutation();

CREATE TRIGGER audit_logs_no_delete
  BEFORE DELETE ON audit_logs
  FOR EACH ROW EXECUTE FUNCTION audit_logs_block_mutation();

-- 3) OPTIONAL — stricter, explicit PARTIAL unique index for military_id_search_hash.
--    The Prisma `@unique` on the NULLable column already gives the intended
--    behavior (PostgreSQL treats NULLs as distinct, so many employees may have no
--    military id), so this is only needed if you prefer the literal filtered form.
--    If you adopt it, also remove `@unique` from militaryIdSearchHash in
--    schema.prisma to avoid creating two indexes for the same column.
-- DROP INDEX IF EXISTS "employees_military_id_search_hash_key";
-- CREATE UNIQUE INDEX employees_military_id_search_hash_partial
--   ON employees (military_id_search_hash)
--   WHERE military_id_search_hash IS NOT NULL;
