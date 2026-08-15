import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MetricRefreshQueue } from '~/modules/metric-refresh';

import { WelderScoreRefreshService } from './welder-score-refresh.service';
import { WelderScoreWorkerService } from './welder-score-worker.service';

vi.mock('~/modules/metric-refresh', () => ({
  MetricRefreshQueue: {
    claimWelderScoreJobs: vi.fn(),
    completeWelderScoreJobs: vi.fn(),
    failWelderScoreJobs: vi.fn(),
  },
}));

vi.mock('./welder-score-refresh.service', () => ({
  ALL_WELDERS_SENTINEL: '__ALL__',
  WelderScoreRefreshService: {
    refreshAll: vi.fn(),
    refreshByWelderIds: vi.fn(),
  },
}));

describe('welder score worker', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(MetricRefreshQueue.claimWelderScoreJobs)
      .mockResolvedValueOnce([
        { attempts: 1, entityId: 'welder-1', jobCount: 4 },
      ])
      .mockResolvedValueOnce([]);
    vi.mocked(MetricRefreshQueue.completeWelderScoreJobs).mockResolvedValue({
      completed: 2,
    });
  });

  it('refreshes claimed welders and confirms every leased task', async () => {
    const result = await WelderScoreWorkerService.drain({
      workerId: 'worker-test',
    });

    expect(WelderScoreRefreshService.refreshByWelderIds).toHaveBeenCalledWith([
      'welder-1',
    ]);
    expect(MetricRefreshQueue.completeWelderScoreJobs).toHaveBeenCalledWith(
      ['welder-1'],
      'worker-test',
    );
    expect(result).toEqual({ batches: 1, processed: 2 });
  });

  it('runs a full refresh when the all-welders sentinel is claimed', async () => {
    vi.mocked(MetricRefreshQueue.claimWelderScoreJobs)
      .mockReset()
      .mockResolvedValueOnce([
        { attempts: 1, entityId: '__ALL__', jobCount: 1 },
      ])
      .mockResolvedValueOnce([]);

    await WelderScoreWorkerService.drain({ workerId: 'worker-test' });

    expect(WelderScoreRefreshService.refreshAll).toHaveBeenCalledTimes(1);
    expect(WelderScoreRefreshService.refreshByWelderIds).not.toHaveBeenCalled();
  });

  it('persists failures before propagating them to the caller', async () => {
    const error = new Error('welder aggregation failed');
    vi.mocked(WelderScoreRefreshService.refreshByWelderIds).mockRejectedValue(
      error,
    );

    await expect(
      WelderScoreWorkerService.drain({ workerId: 'worker-test' }),
    ).rejects.toBe(error);
    expect(MetricRefreshQueue.failWelderScoreJobs).toHaveBeenCalledWith(
      [{ attempts: 1, entityId: 'welder-1', jobCount: 4 }],
      'worker-test',
      error,
    );
    expect(MetricRefreshQueue.completeWelderScoreJobs).not.toHaveBeenCalled();
  });
});
