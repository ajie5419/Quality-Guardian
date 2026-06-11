import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AfterSalesService } from '~/modules/after-sales/after-sales.service';

vi.mock('~/utils/prisma', () => ({
  default: {
    quality_losses: {
      update: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

vi.mock('~/modules/system-log/system-log.service', () => ({
  SystemLogService: {
    auditLog: vi.fn(),
  },
}));

vi.mock('~/modules/inspection/inspection.service', () => ({
  InspectionService: {
    findIssueIdBySerialNumber: vi.fn(),
    updateQualityLossFields: vi.fn(),
  },
}));

vi.mock('~/modules/after-sales/after-sales.service', () => ({
  AfterSalesService: {
    findIdBySerialNumber: vi.fn(),
    updateQualityLossFields: vi.fn(),
  },
}));

vi.mock(
  '~/modules/vehicle-commissioning/vehicle-commissioning.service',
  () => ({
    VehicleCommissioningService: {
      findIssueId: vi.fn(),
      updateQualityLossFields: vi.fn(),
    },
  }),
);

vi.mock('~/utils/prisma-error', () => ({
  isPrismaNotFoundError: vi.fn(
    (error: unknown) => error instanceof Error && error.message === 'not found',
  ),
}));

vi.mock('~/modules/quality-loss/quality-loss-update', () => ({
  parseQualityLossUpdateBody: vi.fn((body: Record<string, unknown>) => {
    if (body.amount === 'bad') {
      return { message: 'Invalid amount' };
    }
    return {
      actualClaim: body.actualClaim,
      amount: body.amount,
      occurDate: body.occurDate,
      respDept: body.respDept,
      status: body.status,
      type: body.type,
    };
  }),
}));

vi.mock('@qgs/shared', () => ({
  resolveQualityLossTargetLocator: vi.fn((params: any) => {
    if (params.source === 'Manual' || !params.source) {
      if (params.pk) {
        return { identifier: params.pk, lookup: 'manualLossId' };
      }
      return { identifier: params.pathId, lookup: 'manualId' };
    }
    if (params.source === 'Internal') {
      return { identifier: params.pathId, lookup: 'internal', serial: null };
    }
    if (params.source === 'Commissioning') {
      return { identifier: params.pathId, lookup: 'commissioning' };
    }
    if (params.source === 'External') {
      return { identifier: params.pathId, lookup: 'external', serial: null };
    }
    return { message: 'Unknown source' };
  }),
  normalizeQualityLossSource: vi.fn((source: any) => source || 'Manual'),
  normalizeQualityLossStatus: vi.fn((status: any) => status || 'Pending'),
  QUALITY_LOSS_SOURCE: {
    COMMISSIONING: 'Commissioning',
    EXTERNAL: 'External',
    INTERNAL: 'Internal',
    MANUAL: 'Manual',
  },
  toAfterSalesClaimStatus: vi.fn((status: any) => status || 'OPEN'),
  toQualityLossTargetType: vi.fn((source: any) => {
    if (source === 'External') return 'after_sales';
    if (source === 'Internal') return 'inspection_issue';
    if (source === 'Commissioning') return 'vehicle_commissioning_issue';
    return 'quality_loss';
  }),
  toQualityRecordStatus: vi.fn((status: any) => status || 'OPEN'),
}));

describe('quality-loss-route-update.service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should update manual record via transaction', async () => {
    const { QualityLossRouteUpdateService } = await import(
      '~/modules/quality-loss/quality-loss-route-update.service'
    );
    const prismaModule = await import('~/utils/prisma');
    const prisma = prismaModule.default;

    vi.mocked(prisma.$transaction).mockImplementation(async (cb: any) => {
      const tx = { quality_losses: { update: vi.fn() } };
      await cb(tx);
      return tx;
    });

    const result = await QualityLossRouteUpdateService.updateByRouteId({
      body: { amount: 100, lossSource: 'Manual', status: 'Confirmed' },
      id: 'QL-2026-001',
      userId: 'user-1',
    });

    expect(result).toEqual({ ok: true });
    expect(prisma.$transaction).toHaveBeenCalled();
  });

  it('should update external record via AfterSalesService', async () => {
    const { QualityLossRouteUpdateService } = await import(
      '~/modules/quality-loss/quality-loss-route-update.service'
    );

    const result = await QualityLossRouteUpdateService.updateByRouteId({
      body: { actualClaim: 5, lossSource: 'External', status: 'Pending' },
      id: 'EXT-12',
      userId: 'user-1',
    });

    expect(result).toEqual({ ok: true });
    expect(AfterSalesService.updateQualityLossFields).toHaveBeenCalledWith({
      actualClaim: 5,
      id: 'EXT-12',
      status: 'Pending',
    });
  });

  it('should return BAD_REQUEST for invalid body', async () => {
    const { QualityLossRouteUpdateService } = await import(
      '~/modules/quality-loss/quality-loss-route-update.service'
    );

    const result = await QualityLossRouteUpdateService.updateByRouteId({
      body: { amount: 'bad', lossSource: 'Manual' },
      id: 'QL-1',
      userId: 'user-1',
    });

    expect(result).toEqual(
      expect.objectContaining({ code: 'BAD_REQUEST', ok: false }),
    );
  });

  it('should return NOT_FOUND when transaction fails with not found error', async () => {
    const { QualityLossRouteUpdateService } = await import(
      '~/modules/quality-loss/quality-loss-route-update.service'
    );
    const prismaModule = await import('~/utils/prisma');
    const prisma = prismaModule.default;

    vi.mocked(prisma.$transaction).mockRejectedValue(new Error('not found'));

    const result = await QualityLossRouteUpdateService.updateByRouteId({
      body: { amount: 1, lossSource: 'Manual' },
      id: 'QL-404',
      userId: 'user-1',
    });

    expect(result).toEqual({
      code: 'NOT_FOUND',
      message: '目标记录不存在',
      ok: false,
    });
  });

  it('should return INTERNAL for generic database errors', async () => {
    const { QualityLossRouteUpdateService } = await import(
      '~/modules/quality-loss/quality-loss-route-update.service'
    );
    const prismaModule = await import('~/utils/prisma');
    const prisma = prismaModule.default;

    vi.mocked(prisma.$transaction).mockRejectedValue(
      new Error('connection lost'),
    );

    const result = await QualityLossRouteUpdateService.updateByRouteId({
      body: { amount: 1, lossSource: 'Manual' },
      id: 'QL-1',
      userId: 'user-1',
    });

    expect(result).toEqual(
      expect.objectContaining({ code: 'INTERNAL', ok: false }),
    );
  });
});
