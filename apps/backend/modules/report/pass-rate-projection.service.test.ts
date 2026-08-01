import { beforeEach, describe, expect, it, vi } from 'vitest';

const prismaMock = {
  identity_projection_generation_pointer: { findUnique: vi.fn() },
  system_settings: { findUnique: vi.fn() },
};

const getFreshness = vi.fn();

vi.mock('~/utils/prisma', () => ({ default: prismaMock }));
vi.mock('~/utils/logger', () => ({
  createModuleLogger: () => ({ error: vi.fn(), warn: vi.fn() }),
}));
vi.mock('./pass-rate-projection-query.service', () => ({
  getPassRateProjectionFreshness: getFreshness,
}));

describe('pass-rate projection feature flag', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('defaults to the legacy report when the flag is absent', async () => {
    prismaMock.system_settings.findUnique.mockResolvedValue(null);
    const { PassRateProjectionService } = await import(
      './pass-rate-projection.service'
    );

    await expect(PassRateProjectionService.isEnabled()).resolves.toBe(false);
  });

  it('enables projection reads only after an explicit true setting', async () => {
    prismaMock.system_settings.findUnique.mockResolvedValue({ value: 'true' });
    const { PassRateProjectionService } = await import(
      './pass-rate-projection.service'
    );

    await expect(PassRateProjectionService.isEnabled()).resolves.toBe(true);
  });

  it('falls back to legacy when a new inspection makes the active generation stale', async () => {
    prismaMock.system_settings.findUnique.mockResolvedValue({ value: 'true' });
    prismaMock.identity_projection_generation_pointer.findUnique.mockResolvedValue(
      { activeGenerationId: 'generation-1' },
    );
    getFreshness.mockResolvedValue({
      isFresh: false,
      projectionSnapshot: {
        createdAtCutoff: new Date('2026-07-31T08:00:00.000Z'),
        idCutoff: 'old-inspection',
      },
      reason: 'CREATED_FACT_BOUNDARY_CHANGED,SOURCE_FACT_MISSING_OR_UPDATED',
    });
    const { PassRateProjectionService } = await import(
      './pass-rate-projection.service'
    );

    await expect(
      PassRateProjectionService.getReadableGeneration(),
    ).resolves.toBeNull();
    expect(getFreshness).toHaveBeenCalledWith('generation-1');
  });
});
