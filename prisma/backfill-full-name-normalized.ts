import { PrismaClient } from '@prisma/client';
import { normalizeArabicName } from '../src/domain/search/arabic-name.normalizer';

/* eslint-disable no-console */

/**
 * One-off backfill: set employees.full_name_normalized = normalizeArabicName(full_name)
 * for every existing row, using the EXACT same normalizer the app applies on create —
 * so backfilled values are byte-identical to app-written ones (no SQL-vs-TS drift).
 *
 * Idempotent and safe to re-run (e.g. if the normalizer rules ever change). No Nest
 * context / no crypto needed: full_name is plaintext.
 *
 *   Run (from web/):  npm run db:backfill:names
 *   Order:            prisma migrate deploy  →  this script
 */

const BATCH = 500;

async function main(): Promise<void> {
  const prisma = new PrismaClient();
  let processed = 0;
  let changed = 0;
  try {
    // Page by created_at + id (stable ordering) to avoid loading the whole table.
    let cursor: string | undefined;
    for (;;) {
      const rows = await prisma.employee.findMany({
        take: BATCH,
        ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
        orderBy: { id: 'asc' },
        select: { id: true, fullName: true, fullNameNormalized: true },
      });
      if (rows.length === 0) break;

      for (const row of rows) {
        const normalized = normalizeArabicName(row.fullName);
        if (normalized !== row.fullNameNormalized) {
          await prisma.employee.update({
            where: { id: row.id },
            data: { fullNameNormalized: normalized },
          });
          changed += 1;
        }
        processed += 1;
      }
      cursor = rows[rows.length - 1].id;
      console.log(`  …processed ${processed} (updated ${changed})`);
    }
    console.log(`Backfill complete: ${processed} employees, ${changed} updated.`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err: unknown) => {
  console.error(`Backfill failed: ${(err as Error).message}`);
  process.exit(1);
});
