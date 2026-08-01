import { beforeEach, describe, expect, it, vi } from 'vitest';

const prismaMock = {
  system_settings: { findUnique: vi.fn() },
};

vi.mock('~/utils/prisma', () => ({ default: prismaMock }));
vi.mock('~/utils/logger', () => ({
  createModuleLogger: () => ({ error: vi.fn() }),
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
});
