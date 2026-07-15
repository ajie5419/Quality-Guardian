import process from 'node:process';

import { createModuleLogger } from '~/utils/logger';
import prisma from '~/utils/prisma';
import { redis } from '~/utils/redis';

const logger = createModuleLogger('after-sales-supplier-brand-id-backfill');

interface UnresolvedRow {
  id: string;
  serialNumber: number;
  supplierBrand: string;
}

async function findUnresolved(): Promise<UnresolvedRow[]> {
  return prisma.$queryRaw<UnresolvedRow[]>`
    SELECT
      a.id,
      a.serialNumber,
      a.supplierBrand
    FROM after_sales AS a
    LEFT JOIN suppliers AS s
      ON s.id = a.supplierBrandId
      AND s.isDeleted = 0
    WHERE a.isDeleted = 0
      AND a.supplierBrand IS NOT NULL
      AND a.supplierBrand <> ''
      AND s.id IS NULL
    ORDER BY a.serialNumber ASC
  `;
}

async function main() {
  logger.info({}, 'after-sales supplierBrandId backfill started');

  // The backfill SQL has already been applied by the matching migration
  // (20260623000100_backfill_after_sales_supplier_brand_id). This script
  // The reconciliation migration rewrites both missing IDs and legacy IDs
  // from the wrong namespace. This script reports anything still unresolved.
  const unresolved = await findUnresolved();

  if (unresolved.length === 0) {
    logger.info({}, 'no unresolved supplier brands — backfill clean');
    return;
  }

  const grouped = new Map<string, UnresolvedRow[]>();
  for (const row of unresolved) {
    const list = grouped.get(row.supplierBrand) ?? [];
    list.push(row);
    grouped.set(row.supplierBrand, list);
  }

  logger.warn(
    {
      uniqueBrands: grouped.size,
      totalRows: unresolved.length,
      sample: [...grouped.entries()].slice(0, 10).map(([brand, rows]) => ({
        brand,
        rowCount: rows.length,
        firstSerial: rows[0]?.serialNumber,
      })),
    },
    'unresolved after-sales supplierBrand entries — please reconcile via suppliers master data',
  );
}

async function run() {
  try {
    await main();
  } finally {
    await prisma.$disconnect();
    redis.disconnect();
  }
}

void run().catch((error: unknown) => {
  logger.fatal({ err: error }, 'after-sales supplier brand backfill failed');
  process.exitCode = 1;
});
