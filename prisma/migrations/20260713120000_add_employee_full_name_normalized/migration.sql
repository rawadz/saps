-- Adds a search-normalized copy of full_name for the professional directory search
-- (Arabic-folded, lowercased, order-free token matching + trigram-indexed substring).
--
-- pg_trgm powers an INDEXABLE substring LIKE on the normalized name (a leading-wildcard
-- ILIKE cannot use a btree index). Creating the extension needs the privilege — managed
-- Postgres roles (RDS/Cloud SQL) generally allow it.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- NOT NULL via a TRANSIENT '' default so existing rows are valid immediately; the
-- ts-node backfill (npm run db:backfill:names) then overwrites every row with the real
-- normalized value using the SAME normalizeArabicName() the app writes on create — one
-- source of truth, no SQL-vs-TS drift. New rows are populated by the app on write.
ALTER TABLE "employees" ADD COLUMN "full_name_normalized" TEXT NOT NULL DEFAULT '';
ALTER TABLE "employees" ALTER COLUMN "full_name_normalized" DROP DEFAULT;

-- Trigram GIN index (name matches Prisma's @@index convention for this column).
CREATE INDEX "employees_full_name_normalized_idx"
  ON "employees" USING gin ("full_name_normalized" gin_trgm_ops);
