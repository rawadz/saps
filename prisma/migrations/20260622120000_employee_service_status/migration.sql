-- CreateEnum
CREATE TYPE "ServiceStatus" AS ENUM ('active', 'transferred', 'discharged', 'contract_ended');

-- AlterTable
ALTER TABLE "employees" ADD COLUMN     "service_status" "ServiceStatus" NOT NULL DEFAULT 'active',
ADD COLUMN     "service_exit_date" DATE,
ADD COLUMN     "service_exit_note" TEXT;

-- CreateIndex
CREATE INDEX "employees_service_status_idx" ON "employees"("service_status");
