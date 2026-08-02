-- CreateEnum
CREATE TYPE "GateDirection" AS ENUM ('in', 'out', 'both');

-- CreateTable
CREATE TABLE "gates" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,
    "direction" "GateDirection" NOT NULL,
    "supports_vehicles" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "gates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "gates_name_key" ON "gates"("name");

-- CreateIndex
CREATE INDEX "gates_is_active_idx" ON "gates"("is_active");

-- AddForeignKey
ALTER TABLE "gates" ADD CONSTRAINT "gates_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
