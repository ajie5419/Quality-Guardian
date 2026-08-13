import { beforeEach, describe, expect, it, vi } from 'vitest';

import { QualityLossIndexQueue } from './quality-loss-index-queue.service';

const prismaMock = vi.hoisted(() => ({
  quality_loss_index_jobs: {
    createMany: vi.fn(),
    findMany: vi.fn(),
    updateMany: vi.fn(),
  },
}));

vi.mock('~/utils/prisma', () => ({ default: prismaMock }));

describe('quality loss index queue', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('adds unique source keys through the caller transaction', async () => {
    prismaMock.quality_loss_index_jobs.createMany.mockResolvedValue({
      count: 2,
    });

    const result = await QualityLossIndexQueue.enqueue(
      prismaMock,
      [
        { source: 'EXTERNAL', sourcePk: 'as-1' },
        { source: 'EXTERNAL', sourcePk: 'as-1' },
        { source: 'MANUAL', sourcePk: 'ql-1' },
      ],
      'source.updated',
    );

    expect(result).toEqual({ enqueued: 2 });
    expect(prismaMock.quality_loss_index_jobs.createMany).toHaveBeenCalledWith({
      data: [
        { reason: 'source.updated', source: 'EXTERNAL', sourcePk: 'as-1' },
        { reason: 'source.updated', source: 'MANUAL', sourcePk: 'ql-1' },
      ],
    });
  });

  it('claims all available signals for one source record with a lease', async () => {
    const now = new Date('2026-08-13T00:00:00.000Z');
    prismaMock.quality_loss_index_jobs.findMany.mockResolvedValue([
      { attempts: 1, source: 'EXTERNAL', sourcePk: 'as-1' },
      { attempts: 0, source: 'MANUAL', sourcePk: 'ql-1' },
    ]);
    prismaMock.quality_loss_index_jobs.updateMany
      .mockResolvedValueOnce({ count: 3 })
      .mockResolvedValueOnce({ count: 0 });

    await expect(
      QualityLossIndexQueue.claim({ now, workerId: 'worker-a' }),
    ).resolves.toEqual([
      { attempts: 2, jobCount: 3, source: 'EXTERNAL', sourcePk: 'as-1' },
    ]);
    expect(prismaMock.quality_loss_index_jobs.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          leaseOwner: 'worker-a',
          leaseUntil: new Date('2026-08-13T00:05:00.000Z'),
          status: 'PROCESSING',
        }),
        where: expect.objectContaining({
          source: 'EXTERNAL',
          sourcePk: 'as-1',
        }),
      }),
    );
  });

  it('reclaims an expired lease through the same compare-and-set path', async () => {
    const now = new Date('2026-08-13T00:00:00.000Z');
    prismaMock.quality_loss_index_jobs.findMany.mockResolvedValue([
      { attempts: 4, source: 'COMMISSIONING', sourcePk: 'da-1' },
    ]);
    prismaMock.quality_loss_index_jobs.updateMany.mockResolvedValue({
      count: 1,
    });

    await QualityLossIndexQueue.claim({ now, workerId: 'worker-b' });

    expect(prismaMock.quality_loss_index_jobs.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: expect.arrayContaining([
            expect.objectContaining({
              leaseUntil: { lte: now },
              status: 'PROCESSING',
            }),
          ]),
        }),
      }),
    );
  });

  it('persists retry state and clears the lease after a worker failure', async () => {
    const now = new Date('2026-08-13T00:00:00.000Z');
    prismaMock.quality_loss_index_jobs.updateMany.mockResolvedValue({
      count: 2,
    });

    await expect(
      QualityLossIndexQueue.fail(
        [{ attempts: 2, jobCount: 2, source: 'INTERNAL', sourcePk: 'qr-1' }],
        'worker-a',
        new Error('index unavailable'),
        now,
      ),
    ).resolves.toEqual({ failed: 2 });
    expect(prismaMock.quality_loss_index_jobs.updateMany).toHaveBeenCalledWith({
      where: {
        leaseOwner: 'worker-a',
        source: 'INTERNAL',
        sourcePk: 'qr-1',
        status: 'PROCESSING',
      },
      data: {
        availableAt: new Date('2026-08-13T00:00:10.000Z'),
        lastError: 'index unavailable',
        leaseOwner: null,
        leaseUntil: null,
        status: 'FAILED',
      },
    });
  });

  it('completes every signal held by the worker after idempotent rebuild', async () => {
    prismaMock.quality_loss_index_jobs.updateMany.mockResolvedValue({
      count: 2,
    });

    await expect(
      QualityLossIndexQueue.complete(
        [{ source: 'MANUAL', sourcePk: 'ql-1' }],
        'worker-a',
      ),
    ).resolves.toEqual({ completed: 2 });
    expect(prismaMock.quality_loss_index_jobs.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          leaseOwner: null,
          leaseUntil: null,
          status: 'COMPLETED',
        }),
      }),
    );
  });
});
