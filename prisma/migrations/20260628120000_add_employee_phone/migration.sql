-- AlterTable
ALTER TABLE "employees" ADD COLUMN     "phone_enc" TEXT,
ADD COLUMN     "phone_search_hash" TEXT;

-- CreateIndex
CREATE INDEX "employees_phone_search_hash_idx" ON "employees"("phone_search_hash");
