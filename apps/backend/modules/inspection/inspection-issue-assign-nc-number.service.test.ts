import { beforeEach, describe, expect, it, vi } from 'vitest';
import { InspectionIssueAssignNcNumberService } from '~/modules/inspection/inspection-issue-assign-nc-number.service';
import prisma from '~/utils/prisma';

const mocks = vi.hoisted(() => ({
  auditLog: vi.fn(),
  getAccessContext: vi.fn(),
  enqueueScores: vi.fn(),
  ensurePermission: vi.fn(),
  upsertLoss: vi.fn(),
}));

vi.mock('~/utils/prisma', () => {
  const tx = {
    $executeRaw: vi.fn(),
    $queryRaw: vi.fn(),
    quality_records: {
      findUnique: vi.fn(),
      updateMany: vi.fn(),
    },
  };
  return {
    default: {
      ...tx,
      $transaction: vi.fn((callback) => callback(tx)),
    },
  };
});

vi.mock('~/modules/inspection/inspection-issue-access.service', () => ({
  applyInspectionIssueWriteOwnership: vi.fn(
    (
      where: Record<string, unknown>,
      context: { roles?: string[]; userId: string },
    ) =>
      context.roles?.includes('admin')
        ? where
        : { ...where, createdBy: context.userId },
  ),
  InspectionIssueAccessService: {
    getAccessContext: mocks.getAccessContext,
  },
}));
vi.mock('~/modules/metric-refresh', () => ({
  MetricRefreshQueue: { enqueueSupplierScores: mocks.enqueueScores },
}));
vi.mock('~/modules/quality-loss', () => ({
  QualityLossIndexService: {
    upsertFromInternalInTransaction: mocks.upsertLoss,
  },
}));
vi.mock('~/modules/system-log', () => ({
  SystemLogService: { auditLog: mocks.auditLog },
}));

describe('inspection issue NC assignment', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getAccessContext.mockResolvedValue({ roles: [], userId: 'user-1' });
    vi.mocked(prisma.$queryRaw)
      .mockResolvedValueOnce([{ value: 0 }])
      .mockResolvedValueOnce([{ currentValue: 1 }]);
    vi.mocked(prisma.quality_records.updateMany).mockResolvedValue({
      count: 1,
    });
    vi.mocked(prisma.quality_records.findUnique)
      .mockResolvedValueOnce({ nonConformanceNumber: null } as never)
      .mockResolvedValueOnce({
        id: 'issue-1',
        nonConformanceNumber: 'NC-26KJ-001',
        partName: 'Bearing',
        supplierId: null,
      } as never);
  });

  it('atomically assigns one formal number and refreshes projections in the same transaction', async () => {
    const result = await InspectionIssueAssignNcNumberService.assignNcNumber(
      { id: 'user-1' } as never,
      'issue-1',
    );

    expect(result.ncNumber).toBe('NC-26KJ-001');
    expect(mocks.getAccessContext).toHaveBeenCalledWith(
      { id: 'user-1' },
      'QMS:Inspection:Issues:AssignNcNumber',
    );
    expect(prisma.quality_records.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'issue-1',
        isDeleted: false,
        nonConformanceNumber: null,
        createdBy: 'user-1',
      },
      data: { nonConformanceNumber: 'NC-26KJ-001' },
    });
    expect(mocks.upsertLoss).toHaveBeenCalled();
    expect(mocks.enqueueScores).toHaveBeenCalled();
  });

  it('rejects records that already have an NC number', async () => {
    vi.mocked(prisma.quality_records.findUnique).mockReset();
    vi.mocked(prisma.quality_records.findUnique).mockResolvedValue({
      nonConformanceNumber: 'NC-26KJ-001',
    } as never);

    await expect(
      InspectionIssueAssignNcNumberService.assignNcNumber(
        { id: 'user-1' } as never,
        'issue-1',
      ),
    ).rejects.toMatchObject({ code: 'CONFLICT', httpStatus: 409 });
    expect(prisma.quality_records.updateMany).not.toHaveBeenCalled();
  });

  it('does not assign another user’s issue for a restricted role', async () => {
    vi.mocked(prisma.quality_records.findUnique).mockReset();
    vi.mocked(prisma.quality_records.findUnique).mockResolvedValue(null);

    await expect(
      InspectionIssueAssignNcNumberService.assignNcNumber(
        { id: 'user-1' } as never,
        'other-users-issue',
      ),
    ).rejects.toMatchObject({ code: 'NOT_FOUND', httpStatus: 404 });
    expect(prisma.quality_records.updateMany).not.toHaveBeenCalled();
  });

  it('keeps a successful assignment successful when audit logging fails', async () => {
    mocks.auditLog.mockRejectedValue(new Error('audit unavailable'));

    await expect(
      InspectionIssueAssignNcNumberService.assignNcNumber(
        { id: 'user-1' } as never,
        'issue-1',
      ),
    ).resolves.toMatchObject({ ncNumber: 'NC-26KJ-001' });
  });
});
