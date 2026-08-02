-- AlterTable
ALTER TABLE "vehicle_permits" ADD COLUMN     "expires_at" TIMESTAMPTZ(6),
ADD COLUMN     "make" TEXT,
ADD COLUMN     "model" TEXT;
