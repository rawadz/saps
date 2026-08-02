-- AlterTable
-- The gate's stable id on the append-only audit trail — a plain UUID, intentionally
-- NOT a foreign key: an FK cascade (SET NULL) would be an UPDATE on audit_logs, which
-- the append-only trigger blocks. gate_name remains as the human-readable snapshot.
ALTER TABLE "audit_logs" ADD COLUMN "gate_id" UUID;

-- CreateIndex
CREATE INDEX "audit_logs_gate_id_idx" ON "audit_logs"("gate_id");
