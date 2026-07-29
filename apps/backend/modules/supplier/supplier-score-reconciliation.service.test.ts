import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MetricRefreshQueue } from '~/modules/metric-refresh';
import prisma from '~/utils/prisma';

import { SupplierScoreReconciliationService } from './supplier-score-reconciliation.service';
import { SupplierScoreWorkerService } from './supplier-score-worker.service';

const prismaMock = vi.hoisted(() => ({
  suppliers: { findMany: vi.fn() },
}));

vi.mock('~/utils/prisma', () => ({ default: prismaMock }));
vi.mock('~/modules/metric-refresh', () => ({
  MetricRefreshQueue: {
    countOutstandingSupplierScoreJobs: vi.fn(),
    enqueueSupplierScores: vi.fn(),
    resetOutstandingSupplierScoreJobsForMaintenance: vi.fn(),
  },
}));
vi.mock('./supplier-score-worker.service', () => ({
  startSupplierScoreWorker: vi.fn(),
  SupplierScoreWorkerService: { drain: vi.fn() },
}));

describe('supplierScoreReconciliationService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(MetricRefreshQueue.enqueueSupplierScores).mockResolvedValue({
      enqueued: 2,
    });
    vi.mocked(
      MetricRefreshQueue.resetOutstandingSupplierScoreJobsForMaintenance,
    ).mockResolvedValue({ reset: 3 });
  });

  it('seeds current ID-model coverage and requires a zero outstanding queue', async () => {
    vi.mocked(prisma.suppliers.findMany)
      .mockResolvedValueOnce([
        { id: 'supplier-1' },
        { id: 'supplier-2' },
      ] as any)
      .mockResolvedValueOnce([]);
    vi.mocked(SupplierScoreWorkerService.drain).mockResolvedValue({
      batches: 1,
      processed: 3,
    });
    vi.mocked(
      MetricRefreshQueue.countOutstandingSupplierScoreJobs,
    ).mockResolvedValue(0);

    const result =
      await SupplierScoreReconciliationService.reconcileForRelease();

    expect(result).toEqual({
      batches: 1,
      enqueued: 2,
      processed: 3,
      reset: 3,
    });
    expect(prisma.suppliers.findMany).toHaveBeenCalledWith({
      orderBy: { id: 'asc' },
      select: { id: true },
      take: 200,
      where: {
        isDeleted: false,
        OR: [
          { scoreSnapshot: { is: null } },
          {
            scoreSnapshot: {
              is: {
                scoringModel: {
                  notIn: ['IN_HOUSE_OUTSOURCING_V4', 'SUPPLIER_V4'],
                },
              },
            },
          },
        ],
      },
    });
    expect(MetricRefreshQueue.enqueueSupplierScores).toHaveBeenCalledWith(
      prisma,
      ['supplier-1', 'supplier-2'],
      'release.current-scoring-model-coverage',
    );
  });

  it('fails release maintenance when outstanding work cannot progress', async () => {
    vi.mocked(prisma.suppliers.findMany).mockResolvedValue([]);
    vi.mocked(SupplierScoreWorkerService.drain).mockResolvedValue({
      batches: 0,
      processed: 0,
    });
    vi.mocked(
      MetricRefreshQueue.countOutstandingSupplierScoreJobs,
    ).mockResolvedValue(1);

    await expect(
      SupplierScoreReconciliationService.reconcileForRelease(),
    ).rejects.toThrow(
      'supplier score reconciliation stalled with 1 outstanding jobs',
    );
  });
});
