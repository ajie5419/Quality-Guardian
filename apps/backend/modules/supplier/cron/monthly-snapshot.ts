import { registerCronJob } from '~/modules/scheduler';
import { SupplierScoreSnapshotService } from '~/modules/supplier';
import { createModuleLogger } from '~/utils/logger';
import prisma from '~/utils/prisma';

const logger = createModuleLogger('SupplierMonthlySnapshot');

/**
 * Monthly 1st day 02:00 full supplier score snapshot refresh.
 * Loads all active suppliers and recomputes their score snapshots so monthly
 * reports reflect a clean, complete baseline.
 */
async function runMonthlySnapshot() {
  const suppliers = await prisma.suppliers.findMany({
    where: { isDeleted: false },
    select: { id: true },
  });
  const ids = suppliers.map((item) => item.id);
  if (ids.length === 0) {
    logger.info('supplier monthly snapshot: no suppliers');
    return;
  }

  const result = await SupplierScoreSnapshotService.refreshBySupplierIds(ids);
  logger.info(
    { processed: result?.processed ?? ids.length, total: ids.length },
    'supplier monthly snapshot completed',
  );
}

export function registerSupplierMonthlySnapshot(): void {
  registerCronJob({
    key: 'supplier.monthly-snapshot',
    cronExpr: '0 2 1 * *',
    description: '每月 1 日 02:00 全量刷新供应商评分快照',
    handler: runMonthlySnapshot,
  });
}
