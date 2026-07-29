import { MetricRefreshQueue } from '~/modules/metric-refresh';
import { createModuleLogger } from '~/utils/logger';
import prisma from '~/utils/prisma';

import { CURRENT_SUPPLIER_SCORING_MODELS } from './supplier-score-snapshot.service';
import { SupplierScoreWorkerService } from './supplier-score-worker.service';

const COVERAGE_BATCH_SIZE = 200;
const DRAIN_BATCH_LIMIT = 100;
const logger = createModuleLogger('SupplierScoreReconciliation');

async function enqueueCurrentModelCoverage() {
  let cursor: string | undefined;
  let enqueued = 0;

  for (;;) {
    const suppliers = await prisma.suppliers.findMany({
      where: {
        isDeleted: false,
        OR: [
          { scoreSnapshot: { is: null } },
          {
            scoreSnapshot: {
              is: {
                scoringModel: {
                  notIn: [...CURRENT_SUPPLIER_SCORING_MODELS],
                },
              },
            },
          },
        ],
      },
      orderBy: { id: 'asc' },
      select: { id: true },
      take: COVERAGE_BATCH_SIZE,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    if (suppliers.length === 0) break;

    const result = await MetricRefreshQueue.enqueueSupplierScores(
      prisma,
      suppliers.map((supplier) => supplier.id),
      'release.current-scoring-model-coverage',
    );
    enqueued += result.enqueued;
    cursor = suppliers.at(-1)?.id;
  }

  return enqueued;
}

export const SupplierScoreReconciliationService = {
  /**
   * Release maintenance owns the database exclusively. It first creates
   * explicit ID-based work for every missing model version, then drains all
   * online and release-created work before allowing the application to start.
   */
  async reconcileForRelease() {
    const enqueued = await enqueueCurrentModelCoverage();
    logger.info({ enqueued }, 'supplier score current-model coverage enqueued');
    const reset =
      await MetricRefreshQueue.resetOutstandingSupplierScoreJobsForMaintenance();
    logger.info(
      { resetJobs: reset.reset },
      'supplier score outstanding jobs reset for maintenance',
    );
    let batches = 0;
    let processed = 0;

    for (;;) {
      const result = await SupplierScoreWorkerService.drain({
        maxBatches: DRAIN_BATCH_LIMIT,
        workerId: 'release-maintenance',
      });
      batches += result.batches;
      processed += result.processed;

      const outstanding =
        await MetricRefreshQueue.countOutstandingSupplierScoreJobs();
      logger.info(
        { batches, outstanding, processed },
        'supplier score reconciliation progress',
      );
      if (outstanding === 0) {
        return { batches, enqueued, processed, reset: reset.reset };
      }
      if (result.processed === 0) {
        throw new Error(
          `supplier score reconciliation stalled with ${outstanding} outstanding jobs`,
        );
      }
    }
  },
};
