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
        id: 'job-won',
        leaseOwner: null,
        leaseUntil: null,
        status: 'PENDING',
      },
      {
        attempts: 0,
        entityId: 'supplier-2',
        id: 'job-lost',
        leaseOwner: null,
        leaseUntil: null,
        status: 'PENDING',
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
      { attempts: 2, entityId: 'supplier-1', id: 'job-won' },
    ]);
    expect(prismaMock.metric_refresh_jobs.updateMany).toHaveBeenCalledTimes(2);
  });

  it('returns failed jobs to the queue with a persisted retry time', async () => {
    const now = new Date('2026-07-29T00:00:00.000Z');
    prismaMock.metric_refresh_jobs.updateMany.mockResolvedValue({ count: 1 });

    const result = await MetricRefreshQueue.failSupplierScoreJobs(
      [{ attempts: 2, entityId: 'supplier-1', id: 'job-1' }],
      'worker-a',
      new Error('database unavailable'),
      now,
    );

    expect(result).toEqual({ failed: 1 });
    expect(prismaMock.metric_refresh_jobs.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'job-1',
        leaseOwner: 'worker-a',
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
});
