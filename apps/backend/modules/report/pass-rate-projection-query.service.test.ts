import { beforeEach, describe, expect, it, vi } from 'vitest';

const prismaMock = {
  $queryRaw: vi.fn(),
  inspections: { count: vi.fn(), findFirst: vi.fn() },
  pass_rate_process_identity_projection: {
    count: vi.fn(),
    findFirst: vi.fn(),
  },
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

  it('captures shadow cutoff from the active projection generation', async () => {
    prismaMock.pass_rate_process_identity_projection.findFirst.mockResolvedValue(
      {
        createdAtSnapshot: new Date('2026-07-31T08:00:00.000Z'),
        inspectionId: 'projection-boundary',
      },
    );
    const { capturePassRateProjectionSnapshot } = await import(
      './pass-rate-projection-query.service'
    );

    await expect(
      capturePassRateProjectionSnapshot('generation-1'),
    ).resolves.toEqual({
      createdAtCutoff: new Date('2026-07-31T08:00:00.000Z'),
      idCutoff: 'projection-boundary',
    });
    expect(
      prismaMock.pass_rate_process_identity_projection.findFirst,
    ).toHaveBeenCalledWith(
      expect.objectContaining({ where: { generationId: 'generation-1' } }),
    );
  });

  it('fails freshness after a new source inspection is added after publication', async () => {
    const projectionDate = new Date('2026-07-31T08:00:00.000Z');
    const sourceDate = new Date('2026-08-01T08:00:00.000Z');
    prismaMock.inspections.findFirst.mockImplementation(({ orderBy }) =>
      Promise.resolve(
        'createdAt' in orderBy[0]
          ? { createdAt: sourceDate, id: 'new-inspection' }
          : { updatedAt: sourceDate, id: 'new-inspection' },
      ),
    );
    prismaMock.pass_rate_process_identity_projection.findFirst.mockImplementation(
      ({ orderBy }) =>
        Promise.resolve(
          'createdAtSnapshot' in orderBy[0]
            ? {
                createdAtSnapshot: projectionDate,
                inspectionId: 'old-inspection',
              }
            : {
                inspectionId: 'old-inspection',
                updatedAtSnapshot: projectionDate,
              },
        ),
    );
    prismaMock.inspections.count.mockResolvedValue(2);
    prismaMock.pass_rate_process_identity_projection.count.mockResolvedValue(1);
    prismaMock.$queryRaw.mockResolvedValue([{ id: 'new-inspection' }]);
    const { getPassRateProjectionFreshness } = await import(
      './pass-rate-projection-query.service'
    );

    await expect(
      getPassRateProjectionFreshness('generation-1'),
    ).resolves.toMatchObject({
      isFresh: false,
      reason: expect.stringContaining('CREATED_FACT_BOUNDARY_CHANGED'),
    });
    // Freshness only asks MySQL for one mismatch; it never materializes the
    // projection in application memory.
    expect(prismaMock.$queryRaw).toHaveBeenCalledTimes(1);
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
