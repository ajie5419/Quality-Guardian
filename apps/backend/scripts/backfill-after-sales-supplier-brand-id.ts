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
  const rows = await prisma.after_sales.findMany({
    where: {
      isDeleted: false,
      supplierBrandId: null,
      supplierBrand: { not: null },
    },
    select: { id: true, serialNumber: true, supplierBrand: true },
    orderBy: { serialNumber: 'asc' },
  });
  return rows
    .filter((row): row is UnresolvedRow => Boolean(row.supplierBrand))
    .map((row) => ({
      id: row.id,
      serialNumber: row.serialNumber,
      supplierBrand: row.supplierBrand as string,
    }));
}

async function main() {
  logger.info({}, 'after-sales supplierBrandId backfill started');

  // The backfill SQL has already been applied by the matching migration
  // (20260623000100_backfill_after_sales_supplier_brand_id). This script
  // only reports rows whose supplierBrand could not be resolved against
  // suppliers.name so the business team can reconcile them manually.
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

main()
  .catch((error: unknown) => {
    throw error;
  })
  .finally(async () => {
    await prisma.$disconnect();
    redis.disconnect();
  });
