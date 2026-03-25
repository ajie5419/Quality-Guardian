/* eslint-disable no-console */
import { createRequire } from 'node:module';
import process from 'node:process';

const require = createRequire(import.meta.url);

function loadPrismaClient() {
  const candidates = [
    '@prisma/client',
    '../node_modules/@prisma/client',
    '../apps/backend/node_modules/@prisma/client',
  ];

  for (const candidate of candidates) {
    try {
      return require(candidate);
    } catch {
      // 继续尝试下一个候选路径，兼容本地源码与容器部署目录差异
    }
  }

  throw new Error(
    'Unable to resolve @prisma/client for inspection-quantity-backfill',
  );
}

function resolveQuantitySummary(record) {
  const totalQuantity = Math.max(1, Number(record.quantity) || 1);
  const linkedIssueQuantity = record.qualityRecords.reduce(
    (sum, item) => sum + Math.max(0, Number(item.quantity) || 0),
    0,
  );

  if (linkedIssueQuantity > 0) {
    const unqualifiedQuantity = Math.min(totalQuantity, linkedIssueQuantity);
    return {
      qualifiedQuantity: totalQuantity - unqualifiedQuantity,
      result: unqualifiedQuantity > 0 ? 'FAIL' : record.result,
      unqualifiedQuantity,
    };
  }

  if (record.result === 'FAIL') {
    return {
      qualifiedQuantity: 0,
      result: 'FAIL',
      unqualifiedQuantity: totalQuantity,
    };
  }

  return {
    qualifiedQuantity: totalQuantity,
    result: 'PASS',
    unqualifiedQuantity: 0,
  };
}

const prismaPkg = loadPrismaClient();
const { PrismaClient } = prismaPkg;
const prisma = new PrismaClient();

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  console.log(
    `[inspection-quantity-backfill] start${dryRun ? ' (dry-run)' : ''}`,
  );

  const inspections = await prisma.inspections.findMany({
    where: {
      isDeleted: false,
      OR: [{ qualifiedQuantity: null }, { unqualifiedQuantity: null }],
    },
    orderBy: [{ inspectionDate: 'desc' }, { createdAt: 'desc' }],
    select: {
      id: true,
      quantity: true,
      result: true,
      qualityRecords: {
        where: { isDeleted: false },
        select: { quantity: true },
      },
    },
  });

  if (inspections.length === 0) {
    console.log('[inspection-quantity-backfill] no rows to update');
    return;
  }

  const updates = inspections.map((record) => ({
    id: record.id,
    ...resolveQuantitySummary(record),
  }));

  console.log(
    `[inspection-quantity-backfill] found ${updates.length} rows to backfill`,
  );
  console.log(
    JSON.stringify(
      updates.slice(0, 10).map((item) => ({
        id: item.id,
        qualifiedQuantity: item.qualifiedQuantity,
        result: item.result,
        unqualifiedQuantity: item.unqualifiedQuantity,
      })),
      null,
      2,
    ),
  );

  if (dryRun) return;

  for (const item of updates) {
    await prisma.inspections.update({
      where: { id: item.id },
      data: {
        qualifiedQuantity: item.qualifiedQuantity,
        result: item.result,
        unqualifiedQuantity: item.unqualifiedQuantity,
      },
    });
  }

  console.log('[inspection-quantity-backfill] done');
}

main()
  .catch((error) => {
    console.error('[inspection-quantity-backfill] failed', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
