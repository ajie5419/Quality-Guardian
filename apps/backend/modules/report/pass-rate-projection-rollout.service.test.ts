import { beforeEach, describe, expect, it, vi } from 'vitest';

const getFreshness = vi.fn();
const buildGeneration = vi.fn();
const createStagedGeneration = vi.fn();
const publishStagedGeneration = vi.fn();
const db = {
  identity_projection_generation_pointer: { findUnique: vi.fn() },
  identity_projection_generations: { findMany: vi.fn() },
  identity_reconciliation_runs: { findFirst: vi.fn() },
  pass_rate_projection_refresh_jobs: {
    create: vi.fn(),
    findFirst: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
  },
  system_settings: { findUnique: vi.fn(), upsert: vi.fn() },
};

vi.mock('~/utils/prisma', () => ({ default: db }));
vi.mock('~/utils/logger', () => ({
  createModuleLogger: () => ({ error: vi.fn() }),
}));
vi.mock('~/modules/master-data-identity', () => ({
  IdentityProjectionService: {
    createStagedGeneration,
    publishStagedGeneration,
  },
}));
vi.mock('./pass-rate-projection.service', () => ({
  PASS_RATE_FLAG_KEY: 'QMS_PASS_RATE_IDENTITY_PROJECTION_ENABLED',
  PassRateProjectionService: { buildGeneration },
}));
vi.mock('./pass-rate-projection-query.service', () => ({
  getPassRateProjectionFreshness: getFreshness,
}));

describe('pass-rate projection rollout gate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    db.system_settings.findUnique.mockImplementation(({ where }: any) =>
      Promise.resolve(
        where.key === 'QMS_MASTER_DATA_IDENTITY_BASELINE_CHECKSUM'
          ? { value: 'baseline-1' }
          : { value: 'false' },
      ),
    );
    db.identity_projection_generation_pointer.findUnique.mockResolvedValue({
      activeGeneration: {
        activatedAt: new Date('2026-08-01T00:00:00.000Z'),
        createdAt: new Date('2026-08-01T00:00:00.000Z'),
        id: 'generation-1',
        status: 'ACTIVE',
      },
    });
    db.identity_projection_generations.findMany.mockResolvedValue([]);
    db.identity_reconciliation_runs.findFirst.mockResolvedValue({
      baselineChecksum: 'baseline-1',
      completedAt: new Date('2026-08-01T01:00:00.000Z'),
      metrics: [
        { differenceValue: 0, metricKey: 'TOTAL_COUNT' },
        { differenceValue: 0, metricKey: 'PASS_COUNT' },
        { differenceValue: 0, metricKey: 'PASS_RATE' },
      ],
      projectionGenerationId: 'generation-1',
    });
    getFreshness.mockResolvedValue({
      isFresh: true,
      projectionSnapshot: {
        createdAtCutoff: new Date('2026-08-01T00:00:00.000Z'),
        idCutoff: 'inspection-1',
      },
      reason: null,
    });
  });

  it('enables only when every gate matches the active generation', async () => {
    const { PassRateProjectionRolloutService } = await import(
      './pass-rate-projection-rollout.service'
    );

    await expect(
      PassRateProjectionRolloutService.setEnabled(true),
    ).resolves.toMatchObject({
      rolloutReady: true,
    });
    expect(db.system_settings.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ update: { value: 'true' } }),
    );
  });

  it('fails closed when the latest shadow does not belong to the active generation', async () => {
    db.identity_reconciliation_runs.findFirst.mockResolvedValue({
      baselineChecksum: 'baseline-1',
      completedAt: new Date(),
      metrics: [
        { differenceValue: 0, metricKey: 'TOTAL_COUNT' },
        { differenceValue: 0, metricKey: 'PASS_COUNT' },
        { differenceValue: 0, metricKey: 'PASS_RATE' },
      ],
      projectionGenerationId: 'old-generation',
    });
    const { PassRateProjectionRolloutService } = await import(
      './pass-rate-projection-rollout.service'
    );

    await expect(
      PassRateProjectionRolloutService.setEnabled(true),
    ).rejects.toMatchObject({
      code: 'PASS_RATE_PROJECTION_ROLLOUT_NOT_READY',
    });
  });

  it('allows disabling even when every rollout gate is stale', async () => {
    getFreshness.mockResolvedValue({
      isFresh: false,
      projectionSnapshot: { createdAtCutoff: new Date(), idCutoff: 'old' },
      reason: 'ACTIVE_FACT_COUNT_CHANGED',
    });
    const { PassRateProjectionRolloutService } = await import(
      './pass-rate-projection-rollout.service'
    );

    await expect(
      PassRateProjectionRolloutService.setEnabled(false),
    ).resolves.toMatchObject({
      rolloutReady: false,
    });
  });

  it('ignores generations that failed before the active generation was published', async () => {
    db.identity_projection_generations.findMany.mockResolvedValue([]);
    const { PassRateProjectionRolloutService } = await import(
      './pass-rate-projection-rollout.service'
    );

    const status = await PassRateProjectionRolloutService.getStatus();
    expect(status.rolloutReady).toBe(true);
    expect(db.identity_projection_generations.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          createdAt: { gte: new Date('2026-08-01T00:00:00.000Z') },
        }),
      }),
    );
  });

  it('keeps legacy fallback available when a queued rebuild fails', async () => {
    db.pass_rate_projection_refresh_jobs.findFirst.mockResolvedValue({
      id: 'job-1',
    });
    db.pass_rate_projection_refresh_jobs.updateMany.mockResolvedValue({
      count: 1,
    });
    createStagedGeneration.mockRejectedValue(new Error('projection failed'));
    const { PassRateProjectionRolloutService } = await import(
      './pass-rate-projection-rollout.service'
    );

    await expect(
      PassRateProjectionRolloutService.processNextRebuild(),
    ).resolves.toBeNull();
    expect(db.pass_rate_projection_refresh_jobs.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'FAILED' }),
      }),
    );
  });
});
