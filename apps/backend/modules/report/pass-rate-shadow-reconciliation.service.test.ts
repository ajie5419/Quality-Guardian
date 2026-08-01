import { beforeEach, describe, expect, it, vi } from 'vitest';

const createRun = vi.fn();
const completeRun = vi.fn();
const captureSnapshot = vi.fn();
const getProjectedSummary = vi.fn();
const getProjectedDrillDown = vi.fn();
const getLegacySummary = vi.fn();
const getLegacyDrillDown = vi.fn();

const prismaMock = {
  identity_projection_generation_pointer: { findUnique: vi.fn() },
  identity_reconciliation_runs: { update: vi.fn() },
  pass_rate_process_identity_projection: { groupBy: vi.fn() },
};

vi.mock('~/utils/prisma', () => ({ default: prismaMock }));
vi.mock('~/utils/logger', () => ({
  createModuleLogger: () => ({ error: vi.fn() }),
}));
vi.mock('~/modules/master-data-identity', () => ({
  IdentityReconciliationService: { completeRun, createRun },
}));
vi.mock('./pass-rate-projection-query.service', () => ({
  capturePassRateFactSnapshot: captureSnapshot,
  getProjectedPassRateDrillDownByRange: getProjectedDrillDown,
  getProjectedPassRateSummaryByRange: getProjectedSummary,
}));
vi.mock('./pass-rate', () => ({
  createPassRateTargetResolver: vi.fn().mockResolvedValue(() => 99.85),
  getLegacyInspectionPassRateSummaryByRange: getLegacySummary,
  getLegacyPassRateDrillDownByRange: getLegacyDrillDown,
}));

describe('pass-rate shadow reconciliation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    captureSnapshot.mockResolvedValue({
      createdAtCutoff: new Date('2026-08-01T08:00:00.000Z'),
      idCutoff: 'inspection-boundary',
    });
    createRun.mockResolvedValue({ id: 'run-1' });
    prismaMock.identity_projection_generation_pointer.findUnique.mockResolvedValue(
      {
        activeGenerationId: 'generation-1',
      },
    );
    getLegacySummary.mockResolvedValue({
      passCount: 90,
      passRate: 90,
      totalCount: 100,
    });
    getProjectedSummary.mockResolvedValue({
      passCount: 90,
      passRate: 90,
      totalCount: 100,
    });
    getLegacyDrillDown.mockResolvedValue([
      { category: '过程检验', process: 'Legacy Welding', totalCount: 100 },
    ]);
    getProjectedDrillDown.mockResolvedValue([
      {
        category: '过程检验',
        process: 'Renamed Welding',
        processId: 'process-welding',
        state: 'RESOLVED',
        totalCount: 100,
      },
    ]);
    prismaMock.pass_rate_process_identity_projection.groupBy.mockResolvedValue([
      { _count: { _all: 1 }, state: 'RESOLVED' },
    ]);
    completeRun.mockResolvedValue({ id: 'run-1', status: 'COMPLETED' });
  });

  it('uses one fixed fact snapshot for legacy and projection calculations', async () => {
    const { PassRateShadowReconciliationService } = await import(
      './pass-rate-shadow-reconciliation.service'
    );
    const start = new Date('2026-01-01');
    const end = new Date('2026-08-01');

    const result = await PassRateShadowReconciliationService.run({
      baselineChecksum: 'baseline-1',
      end,
      start,
    });

    const snapshot = {
      createdAtCutoff: new Date('2026-08-01T08:00:00.000Z'),
      idCutoff: 'inspection-boundary',
    };
    expect(getLegacySummary).toHaveBeenCalledWith(start, end, snapshot);
    expect(getProjectedSummary).toHaveBeenCalledWith(
      'generation-1',
      start,
      end,
      snapshot,
    );
    expect(completeRun).toHaveBeenCalledWith(
      expect.objectContaining({
        runId: 'run-1',
        metrics: expect.arrayContaining([
          expect.objectContaining({ metricKey: 'TOTAL_COUNT' }),
          expect.objectContaining({ metricKey: 'IDENTITY_STATE:RESOLVED' }),
        ]),
      }),
    );
    expect(result).toMatchObject({
      generationId: 'generation-1',
      runId: 'run-1',
    });
  });
});
