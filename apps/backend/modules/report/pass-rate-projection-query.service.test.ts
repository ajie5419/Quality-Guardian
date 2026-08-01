import { beforeEach, describe, expect, it, vi } from 'vitest';

const prismaMock = {
  $queryRaw: vi.fn(),
  inspections: { findFirst: vi.fn() },
  processes: { findMany: vi.fn() },
};

vi.mock('~/utils/prisma', () => ({ default: prismaMock }));

describe('pass-rate process projection query', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('captures a createdAt and ID boundary from one fact snapshot', async () => {
    prismaMock.inspections.findFirst.mockResolvedValue({
      createdAt: new Date('2026-08-01T08:00:00.000Z'),
      id: 'inspection-boundary',
    });
    const { capturePassRateFactSnapshot } = await import(
      './pass-rate-projection-query.service'
    );

    await expect(capturePassRateFactSnapshot()).resolves.toEqual({
      createdAtCutoff: new Date('2026-08-01T08:00:00.000Z'),
      idCutoff: 'inspection-boundary',
    });
  });

  it('keeps equal display names separated by process ID', async () => {
    prismaMock.$queryRaw
      .mockResolvedValueOnce([
        {
          passCount: 10n,
          processId: 'process-a',
          state: 'RESOLVED',
          totalCount: 10n,
        },
        {
          passCount: 20n,
          processId: 'process-b',
          state: 'RESOLVED',
          totalCount: 20n,
        },
      ])
      .mockResolvedValueOnce([]);
    prismaMock.processes.findMany.mockResolvedValue([
      { id: 'process-a', name: 'Renamed Process' },
      { id: 'process-b', name: 'Renamed Process' },
    ]);
    const { getProjectedPassRateDrillDownByRange } = await import(
      './pass-rate-projection-query.service'
    );

    const result = await getProjectedPassRateDrillDownByRange(
      'generation-1',
      new Date('2026-01-01'),
      new Date('2026-12-31'),
      {
        createdAtCutoff: new Date('2026-08-01T08:00:00.000Z'),
        idCutoff: 'inspection-boundary',
      },
      () => 99.85,
    );

    expect(result).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          process: 'Renamed Process',
          processId: 'process-a',
          totalCount: 10,
        }),
        expect.objectContaining({
          process: 'Renamed Process',
          processId: 'process-b',
          totalCount: 20,
        }),
      ]),
    );
  });

  it('binds the projected aggregate to the supplied fact boundary', async () => {
    prismaMock.$queryRaw.mockResolvedValue([
      { passCount: 9n, totalCount: 10n },
    ]);
    const { getProjectedPassRateSummaryByRange } = await import(
      './pass-rate-projection-query.service'
    );
    const cutoff = new Date('2026-08-01T08:00:00.000Z');

    const result = await getProjectedPassRateSummaryByRange(
      'generation-1',
      new Date('2026-01-01'),
      new Date('2026-12-31'),
      { createdAtCutoff: cutoff, idCutoff: 'inspection-boundary' },
    );

    expect(result).toEqual({ passCount: 9, passRate: 90, totalCount: 10 });
    expect(prismaMock.$queryRaw).toHaveBeenCalledTimes(1);
  });
});
