-- ============================================================================
--  accounts migration (PostgreSQL enum-safe)
--
--  PostgreSQL forbids USING a value added with `ALTER TYPE ... ADD VALUE` in the
--  same transaction it was added — the value is not committed yet. Prisma applies
--  each migration in a single transaction, so the original two statements
--      ALTER TYPE "EmployeeStatus" ADD VALUE 'pending';
--      ALTER TABLE "employees" ALTER COLUMN "status" SET DEFAULT 'pending';
--  failed ("New enum values must be committed before they can be used").
--
--  Fix: RECREATE the enum type with all values (so 'pending' exists from CREATE
--  TYPE and is immediately usable as a DEFAULT) — this is fully transaction-safe
--  and needs no ADD VALUE. Everything below runs in order in one transaction.
-- ============================================================================

-- 1) EmployeeStatus: introduce 'pending' and make it the default for employees.status.
ALTER TYPE "EmployeeStatus" RENAME TO "EmployeeStatus_old";

CREATE TYPE "EmployeeStatus" AS ENUM ('pending', 'active', 'suspended', 'terminated');

-- The current default ('active') references the old type — drop it before the swap.
ALTER TABLE "employees" ALTER COLUMN "status" DROP DEFAULT;

ALTER TABLE "employees"
  ALTER COLUMN "status" TYPE "EmployeeStatus"
  USING ("status"::text::"EmployeeStatus");

ALTER TABLE "employees" ALTER COLUMN "status" SET DEFAULT 'pending';

DROP TYPE "EmployeeStatus_old";

-- 2) vehicle_permits: no anonymous vehicles. Each row must link to EXACTLY ONE of
--    an employee OR a visitor permit — never both, never neither (DB-enforced).
ALTER TABLE "vehicle_permits"
  ADD CONSTRAINT "vehicle_must_have_owner" CHECK (
    ("employee_id" IS NOT NULL AND "visitor_permit_id" IS NULL)
    OR
    ("employee_id" IS NULL AND "visitor_permit_id" IS NOT NULL)
  );

-- 3) audit_logs: append-only. Block UPDATE and DELETE at the row level via a
--    trigger so the security history can never be rewritten or erased.
CREATE OR REPLACE FUNCTION audit_logs_block_mutation()
  RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'audit_logs is append-only: % is not permitted', TG_OP;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER audit_logs_no_update
  BEFORE UPDATE ON "audit_logs"
  FOR EACH ROW EXECUTE FUNCTION audit_logs_block_mutation();

CREATE TRIGGER audit_logs_no_delete
  BEFORE DELETE ON "audit_logs"
  FOR EACH ROW EXECUTE FUNCTION audit_logs_block_mutation();
