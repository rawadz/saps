-- CreateTable
CREATE TABLE "employee_gate_access" (
    "employee_id" UUID NOT NULL,
    "gate_id" UUID NOT NULL,
    "assigned_by" UUID,
    "assigned_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "employee_gate_access_pkey" PRIMARY KEY ("employee_id","gate_id")
);

-- CreateIndex
CREATE INDEX "employee_gate_access_gate_id_idx" ON "employee_gate_access"("gate_id");

-- AddForeignKey
ALTER TABLE "employee_gate_access" ADD CONSTRAINT "employee_gate_access_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_gate_access" ADD CONSTRAINT "employee_gate_access_gate_id_fkey" FOREIGN KEY ("gate_id") REFERENCES "gates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_gate_access" ADD CONSTRAINT "employee_gate_access_assigned_by_fkey" FOREIGN KEY ("assigned_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
