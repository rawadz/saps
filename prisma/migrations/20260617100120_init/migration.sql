-- CreateEnum
CREATE TYPE "Role" AS ENUM ('branch_head', 'supervisor', 'guard', 'permit_officer', 'hr');

-- CreateEnum
CREATE TYPE "PersonnelType" AS ENUM ('civilian', 'military');

-- CreateEnum
CREATE TYPE "EmployeeStatus" AS ENUM ('active', 'suspended', 'terminated');

-- CreateEnum
CREATE TYPE "PermitType" AS ENUM ('scheduled', 'single_entry');

-- CreateEnum
CREATE TYPE "PermitStatus" AS ENUM ('active', 'used', 'expired', 'cancelled');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "username" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "is_account_activated" BOOLEAN NOT NULL DEFAULT false,
    "full_name" TEXT,
    "employee_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employees" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "self_id_enc" TEXT NOT NULL,
    "self_id_search_hash" TEXT NOT NULL,
    "military_id_enc" TEXT,
    "military_id_search_hash" TEXT,
    "full_name" TEXT NOT NULL,
    "command_department" TEXT,
    "branch" TEXT,
    "priority" TEXT,
    "rank" TEXT,
    "current_job_title" TEXT,
    "photo_url" TEXT,
    "extra_fields" JSONB,
    "personnel_type" "PersonnelType" NOT NULL DEFAULT 'civilian',
    "status" "EmployeeStatus" NOT NULL DEFAULT 'active',
    "is_entry_blocked" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "employees_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "barcodes" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "employee_id" UUID NOT NULL,
    "token" TEXT NOT NULL,
    "generated_by" UUID,
    "generated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "barcodes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "permits" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "permit_number" TEXT NOT NULL,
    "permit_type" "PermitType" NOT NULL,
    "status" "PermitStatus" NOT NULL DEFAULT 'active',
    "visitor_name" TEXT NOT NULL,
    "id_or_phone_enc" TEXT,
    "id_or_phone_search_hash" TEXT,
    "personnel_type" "PersonnelType",
    "host" TEXT NOT NULL,
    "reason" TEXT,
    "token" TEXT,
    "start_date" DATE,
    "end_date" DATE,
    "allowed_days" INTEGER[],
    "allowed_time_from" TEXT,
    "allowed_time_to" TEXT,
    "allowed_equipment" JSONB,
    "expires_at" TIMESTAMPTZ(6),
    "used_at" TIMESTAMPTZ(6),
    "issued_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "permits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vehicle_permits" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "plate_number" TEXT NOT NULL,
    "vehicle_type" TEXT,
    "color" TEXT,
    "employee_id" UUID,
    "visitor_permit_id" UUID,
    "barcode_token" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vehicle_permits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "type" TEXT NOT NULL,
    "subject_type" TEXT,
    "subject_ref" TEXT,
    "actor_user_id" UUID,
    "gate_name" TEXT,
    "result" TEXT NOT NULL,
    "reason" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");

-- CreateIndex
CREATE UNIQUE INDEX "users_employee_id_key" ON "users"("employee_id");

-- CreateIndex
CREATE UNIQUE INDEX "employees_self_id_search_hash_key" ON "employees"("self_id_search_hash");

-- CreateIndex
CREATE UNIQUE INDEX "employees_military_id_search_hash_key" ON "employees"("military_id_search_hash");

-- CreateIndex
CREATE INDEX "employees_status_idx" ON "employees"("status");

-- CreateIndex
CREATE INDEX "employees_is_entry_blocked_idx" ON "employees"("is_entry_blocked");

-- CreateIndex
CREATE UNIQUE INDEX "barcodes_employee_id_key" ON "barcodes"("employee_id");

-- CreateIndex
CREATE UNIQUE INDEX "barcodes_token_key" ON "barcodes"("token");

-- CreateIndex
CREATE UNIQUE INDEX "permits_permit_number_key" ON "permits"("permit_number");

-- CreateIndex
CREATE UNIQUE INDEX "permits_token_key" ON "permits"("token");

-- CreateIndex
CREATE INDEX "permits_status_idx" ON "permits"("status");

-- CreateIndex
CREATE INDEX "permits_permit_type_idx" ON "permits"("permit_type");

-- CreateIndex
CREATE INDEX "permits_expires_at_idx" ON "permits"("expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "vehicle_permits_barcode_token_key" ON "vehicle_permits"("barcode_token");

-- CreateIndex
CREATE INDEX "vehicle_permits_employee_id_idx" ON "vehicle_permits"("employee_id");

-- CreateIndex
CREATE INDEX "vehicle_permits_visitor_permit_id_idx" ON "vehicle_permits"("visitor_permit_id");

-- CreateIndex
CREATE INDEX "audit_logs_type_idx" ON "audit_logs"("type");

-- CreateIndex
CREATE INDEX "audit_logs_subject_ref_idx" ON "audit_logs"("subject_ref");

-- CreateIndex
CREATE INDEX "audit_logs_created_at_idx" ON "audit_logs"("created_at");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "barcodes" ADD CONSTRAINT "barcodes_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "barcodes" ADD CONSTRAINT "barcodes_generated_by_fkey" FOREIGN KEY ("generated_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "permits" ADD CONSTRAINT "permits_issued_by_fkey" FOREIGN KEY ("issued_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle_permits" ADD CONSTRAINT "vehicle_permits_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle_permits" ADD CONSTRAINT "vehicle_permits_visitor_permit_id_fkey" FOREIGN KEY ("visitor_permit_id") REFERENCES "permits"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
