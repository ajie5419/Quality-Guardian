import { beforeEach, describe, expect, it, vi } from 'vitest';

import { QualityLossIndexQueue } from './quality-loss-index-queue.service';
import { QualityLossIndexWorkerService } from './quality-loss-index-worker.service';
import { QualityLossIndexService } from './quality-loss-index.service';

vi.mock('./quality-loss-index-queue.service', () => ({
  QualityLossIndexQueue: { claim: vi.fn(), complete: vi.fn(), fail: vi.fn() },
}));
vi.mock('./quality-loss-index.service', () => ({
  QualityLossIndexService: { rebuildOne: vi.fn() },
}));

describe('quality loss index worker', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(QualityLossIndexQueue.claim)
      .mockResolvedValueOnce([
        { attempts: 1, jobCount: 2, source: 'EXTERNAL', sourcePk: 'as-1' },
      ])
      .mockResolvedValueOnce([]);
    vi.mocked(QualityLossIndexQueue.complete).mockResolvedValue({
      completed: 2,
    });
  });

  it('rebuilds each claimed source record using the materialized source value', async () => {
    await expect(
      QualityLossIndexWorkerService.drain({ workerId: 'worker-test' }),
    ).resolves.toEqual({ batches: 1, processed: 2 });
    expect(QualityLossIndexService.rebuildOne).toHaveBeenCalledWith(
      'External',
      'as-1',
    );
    expect(QualityLossIndexQueue.complete).toHaveBeenCalledWith(
      [{ attempts: 1, jobCount: 2, source: 'EXTERNAL', sourcePk: 'as-1' }],
      'worker-test',
    );
  });

  it('records the full batch for retry when one idempotent rebuild fails', async () => {
    const error = new Error('index unavailable');
    vi.mocked(QualityLossIndexService.rebuildOne).mockRejectedValue(error);

    await expect(
      QualityLossIndexWorkerService.drain({ workerId: 'worker-test' }),
    ).rejects.toBe(error);
    expect(QualityLossIndexQueue.fail).toHaveBeenCalledWith(
      [{ attempts: 1, jobCount: 2, source: 'EXTERNAL', sourcePk: 'as-1' }],
      'worker-test',
      error,
    );
  });
});
