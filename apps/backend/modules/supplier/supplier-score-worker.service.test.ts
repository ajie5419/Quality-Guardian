import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MetricRefreshQueue } from '~/modules/metric-refresh';

import { SupplierScoreSnapshotService } from './supplier-score-snapshot.service';
import { SupplierScoreWorkerService } from './supplier-score-worker.service';

vi.mock('~/modules/metric-refresh', () => ({
  MetricRefreshQueue: {
    claimSupplierScoreJobs: vi.fn(),
    completeSupplierScoreJobs: vi.fn(),
    failSupplierScoreJobs: vi.fn(),
  },
}));

vi.mock('./supplier-score-snapshot.service', () => ({
  SupplierScoreSnapshotService: {
    refreshBySupplierIds: vi.fn(),
  },
}));

describe('supplier score worker', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(MetricRefreshQueue.claimSupplierScoreJobs)
      .mockResolvedValueOnce([
        { attempts: 1, entityId: 'supplier-1', jobCount: 4 },
      ])
      .mockResolvedValueOnce([]);
    vi.mocked(MetricRefreshQueue.completeSupplierScoreJobs).mockResolvedValue({
      completed: 2,
    });
  });

  it('recomputes unique suppliers and confirms every claimed task', async () => {
    const result = await SupplierScoreWorkerService.drain({
      workerId: 'worker-test',
    });

    expect(
      SupplierScoreSnapshotService.refreshBySupplierIds,
    ).toHaveBeenCalledWith(['supplier-1']);
    expect(MetricRefreshQueue.completeSupplierScoreJobs).toHaveBeenCalledWith(
      ['supplier-1'],
      'worker-test',
    );
    expect(result).toEqual({ batches: 1, processed: 2 });
  });

  it('persists failures before propagating them to the caller', async () => {
    const error = new Error('aggregation failed');
    vi.mocked(
      SupplierScoreSnapshotService.refreshBySupplierIds,
    ).mockRejectedValue(error);

    await expect(
      SupplierScoreWorkerService.drain({ workerId: 'worker-test' }),
    ).rejects.toBe(error);
    expect(MetricRefreshQueue.failSupplierScoreJobs).toHaveBeenCalledWith(
      [{ attempts: 1, entityId: 'supplier-1', jobCount: 4 }],
      'worker-test',
      error,
    );
    expect(MetricRefreshQueue.completeSupplierScoreJobs).not.toHaveBeenCalled();
  });
});
