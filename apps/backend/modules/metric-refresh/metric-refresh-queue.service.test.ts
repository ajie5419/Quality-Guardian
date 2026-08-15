import { beforeEach, describe, expect, it, vi } from 'vitest';

import { MetricRefreshQueue } from './metric-refresh-queue.service';

const prismaMock = vi.hoisted(() => ({
  metric_refresh_jobs: {
    count: vi.fn(),
    createMany: vi.fn(),
    findMany: vi.fn(),
    updateMany: vi.fn(),
  },
}));

vi.mock('~/utils/prisma', () => ({ default: prismaMock }));

describe('metric refresh queue', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('appends unique supplier jobs through the provided transaction client', async () => {
    prismaMock.metric_refresh_jobs.createMany.mockResolvedValue({ count: 2 });

    const result = await MetricRefreshQueue.enqueueSupplierScores(
      prismaMock,
      ['supplier-1', 'supplier-1', '', 'supplier-2'],
      'inspection.updated',
    );

    expect(result).toEqual({ enqueued: 2 });
    expect(prismaMock.metric_refresh_jobs.createMany).toHaveBeenCalledWith({
      data: [
        {
          entityId: 'supplier-1',
          metricType: 'SUPPLIER_SCORE',
          reason: 'inspection.updated',
        },
        {
          entityId: 'supplier-2',
          metricType: 'SUPPLIER_SCORE',
          reason: 'inspection.updated',
        },
      ],
    });
  });

  it('maps process TEAM identities in the same source transaction', async () => {
    prismaMock.metric_refresh_jobs.createMany.mockResolvedValue({ count: 2 });
    prismaMock.metric_refresh_jobs.findMany.mockResolvedValue([]);
    const client = {
      ...prismaMock,
      supplier_identity_links: {
        findMany: vi
          .fn()
          .mockResolvedValue([
            { supplierId: 'supplier-team-1' },
            { supplierId: 'supplier-direct' },
          ]),
      },
    };

    await MetricRefreshQueue.enqueueSupplierScoresForInspectionIdentities(
      client,
      {
        supplierIds: ['supplier-direct'],
        teamIds: ['team-1'],
      },
      'inspection.updated',
    );

    expect(client.supplier_identity_links.findMany).toHaveBeenCalledWith({
      select: { supplierId: true },
      where: {
        identityId: { in: ['team-1'] },
        identityType: 'TEAM',
        isDeleted: false,
      },
    });
    expect(prismaMock.metric_refresh_jobs.createMany).toHaveBeenCalledWith({
      data: [
        {
          entityId: 'supplier-direct',
          metricType: 'SUPPLIER_SCORE',
          reason: 'inspection.updated',
        },
        {
          entityId: 'supplier-team-1',
          metricType: 'SUPPLIER_SCORE',
          reason: 'inspection.updated',
        },
      ],
    });
  });

  it('uses compare-and-set so concurrent workers cannot claim the same job', async () => {
    const now = new Date('2026-07-29T00:00:00.000Z');
    prismaMock.metric_refresh_jobs.findMany.mockResolvedValue([
      {
        attempts: 1,
        entityId: 'supplier-1',
      },
      {
        attempts: 0,
        entityId: 'supplier-2',
      },
    ]);
    prismaMock.metric_refresh_jobs.updateMany
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 0 });

    const jobs = await MetricRefreshQueue.claimSupplierScoreJobs({
      leaseMs: 60_000,
      now,
      workerId: 'worker-a',
    });

    expect(jobs).toEqual([
      { attempts: 2, entityId: 'supplier-1', jobCount: 1 },
    ]);
    expect(prismaMock.metric_refresh_jobs.updateMany).toHaveBeenCalledTimes(2);
    expect(prismaMock.metric_refresh_jobs.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        distinct: ['entityId'],
        take: 50,
      }),
    );
  });

  it('claims all available signals for one supplier as a single refresh unit', async () => {
    prismaMock.metric_refresh_jobs.findMany.mockResolvedValue([
      {
        attempts: 1,
        entityId: 'supplier-1',
      },
    ]);
    prismaMock.metric_refresh_jobs.updateMany.mockResolvedValue({ count: 7 });

    const jobs = await MetricRefreshQueue.claimSupplierScoreJobs({
      workerId: 'worker-a',
    });

    expect(jobs).toEqual([
      { attempts: 2, entityId: 'supplier-1', jobCount: 7 },
    ]);
    expect(prismaMock.metric_refresh_jobs.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          entityId: 'supplier-1',
          metricType: 'SUPPLIER_SCORE',
        }),
      }),
    );
  });

  it('completes every leased signal for the refreshed suppliers', async () => {
    prismaMock.metric_refresh_jobs.updateMany.mockResolvedValue({ count: 7 });

    const result = await MetricRefreshQueue.completeSupplierScoreJobs(
      ['supplier-1', 'supplier-1'],
      'worker-a',
    );

    expect(result).toEqual({ completed: 7 });
    expect(prismaMock.metric_refresh_jobs.updateMany).toHaveBeenCalledWith({
      where: {
        entityId: { in: ['supplier-1'] },
        isDeleted: false,
        leaseOwner: 'worker-a',
        metricType: 'SUPPLIER_SCORE',
        status: 'PROCESSING',
      },
      data: {
        completedAt: expect.any(Date),
        lastError: null,
        leaseOwner: null,
        leaseUntil: null,
        status: 'COMPLETED',
      },
    });
  });

  it('reclaims every outstanding supplier job during exclusive maintenance', async () => {
    const now = new Date('2026-07-29T00:00:00.000Z');
    prismaMock.metric_refresh_jobs.updateMany.mockResolvedValue({ count: 3 });

    const result =
      await MetricRefreshQueue.resetOutstandingSupplierScoreJobsForMaintenance(
        now,
      );

    expect(result).toEqual({ reset: 3 });
    expect(prismaMock.metric_refresh_jobs.updateMany).toHaveBeenCalledWith({
      where: {
        isDeleted: false,
        metricType: 'SUPPLIER_SCORE',
        status: { not: 'COMPLETED' },
      },
      data: {
        availableAt: now,
        leaseOwner: null,
        leaseUntil: null,
        status: 'PENDING',
      },
    });
  });

  it('returns failed jobs to the queue with a persisted retry time', async () => {
    const now = new Date('2026-07-29T00:00:00.000Z');
    prismaMock.metric_refresh_jobs.updateMany.mockResolvedValue({ count: 1 });

    const result = await MetricRefreshQueue.failSupplierScoreJobs(
      [{ attempts: 2, entityId: 'supplier-1', jobCount: 3 }],
      'worker-a',
      new Error('database unavailable'),
      now,
    );

    expect(result).toEqual({ failed: 1 });
    expect(prismaMock.metric_refresh_jobs.updateMany).toHaveBeenCalledWith({
      where: {
        entityId: 'supplier-1',
        isDeleted: false,
        leaseOwner: 'worker-a',
        metricType: 'SUPPLIER_SCORE',
        status: 'PROCESSING',
      },
      data: {
        availableAt: new Date('2026-07-29T00:00:10.000Z'),
        lastError: 'database unavailable',
        leaseOwner: null,
        leaseUntil: null,
        status: 'FAILED',
      },
    });
  });

  it('appends unique welder jobs through the provided transaction client', async () => {
    prismaMock.metric_refresh_jobs.createMany.mockResolvedValue({ count: 2 });

    const result = await MetricRefreshQueue.enqueueWelderScores(
      prismaMock,
      ['welder-1', 'welder-1', '', 'welder-2'],
      'issue.updated',
    );

    expect(result).toEqual({ enqueued: 2 });
    expect(prismaMock.metric_refresh_jobs.createMany).toHaveBeenCalledWith({
      data: [
        {
          entityId: 'welder-1',
          metricType: 'WELDER_SCORE',
          reason: 'issue.updated',
        },
        {
          entityId: 'welder-2',
          metricType: 'WELDER_SCORE',
          reason: 'issue.updated',
        },
      ],
    });
  });

  it('claims all available welder signals for one welder as a single refresh unit', async () => {
    prismaMock.metric_refresh_jobs.findMany.mockResolvedValue([
      {
        attempts: 1,
        entityId: 'welder-1',
      },
    ]);
    prismaMock.metric_refresh_jobs.updateMany.mockResolvedValue({ count: 5 });

    const jobs = await MetricRefreshQueue.claimWelderScoreJobs({
      workerId: 'worker-a',
    });

    expect(jobs).toEqual([{ attempts: 2, entityId: 'welder-1', jobCount: 5 }]);
    expect(prismaMock.metric_refresh_jobs.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          entityId: 'welder-1',
          metricType: 'WELDER_SCORE',
        }),
      }),
    );
  });

  it('completes every leased welder signal for the refreshed welders', async () => {
    prismaMock.metric_refresh_jobs.updateMany.mockResolvedValue({ count: 4 });

    const result = await MetricRefreshQueue.completeWelderScoreJobs(
      ['welder-1', 'welder-1'],
      'worker-a',
    );

    expect(result).toEqual({ completed: 4 });
    expect(prismaMock.metric_refresh_jobs.updateMany).toHaveBeenCalledWith({
      where: {
        entityId: { in: ['welder-1'] },
        isDeleted: false,
        leaseOwner: 'worker-a',
        metricType: 'WELDER_SCORE',
        status: 'PROCESSING',
      },
      data: {
        completedAt: expect.any(Date),
        lastError: null,
        leaseOwner: null,
        leaseUntil: null,
        status: 'COMPLETED',
      },
    });
  });

  it('counts outstanding welder score jobs', async () => {
    prismaMock.metric_refresh_jobs.count.mockResolvedValue(2);

    const result = await MetricRefreshQueue.countOutstandingWelderScoreJobs();

    expect(result).toBe(2);
    expect(prismaMock.metric_refresh_jobs.count).toHaveBeenCalledWith({
      where: {
        isDeleted: false,
        metricType: 'WELDER_SCORE',
        status: { not: 'COMPLETED' },
      },
    });
  });

  it('reclaims every outstanding welder job during exclusive maintenance', async () => {
    const now = new Date('2026-07-29T00:00:00.000Z');
    prismaMock.metric_refresh_jobs.updateMany.mockResolvedValue({ count: 3 });

    const result =
      await MetricRefreshQueue.resetOutstandingWelderScoreJobsForMaintenance(
        now,
      );

    expect(result).toEqual({ reset: 3 });
    expect(prismaMock.metric_refresh_jobs.updateMany).toHaveBeenCalledWith({
      where: {
        isDeleted: false,
        metricType: 'WELDER_SCORE',
        status: { not: 'COMPLETED' },
      },
      data: {
        availableAt: now,
        leaseOwner: null,
        leaseUntil: null,
        status: 'PENDING',
      },
    });
  });

  it('returns failed welder jobs to the queue with a persisted retry time', async () => {
    const now = new Date('2026-07-29T00:00:00.000Z');
    prismaMock.metric_refresh_jobs.updateMany.mockResolvedValue({ count: 1 });

    const result = await MetricRefreshQueue.failWelderScoreJobs(
      [{ attempts: 2, entityId: 'welder-1', jobCount: 2 }],
      'worker-a',
      new Error('welder refresh failed'),
      now,
    );

    expect(result).toEqual({ failed: 1 });
    expect(prismaMock.metric_refresh_jobs.updateMany).toHaveBeenCalledWith({
      where: {
        entityId: 'welder-1',
        isDeleted: false,
        leaseOwner: 'worker-a',
        metricType: 'WELDER_SCORE',
        status: 'PROCESSING',
      },
      data: {
        availableAt: new Date('2026-07-29T00:00:10.000Z'),
        lastError: 'welder refresh failed',
        leaseOwner: null,
        leaseUntil: null,
        status: 'FAILED',
      },
    });
  });
});
