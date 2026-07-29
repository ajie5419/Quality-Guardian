import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AfterSalesAPI } from '~/modules/after-sales';

vi.mock('~/utils/prisma', () => ({
  default: {
    after_sales: {
      findUnique: vi.fn(),
    },
    quality_losses: {
      findFirst: vi.fn(),
      update: vi.fn(),
    },
    quality_records: {
      findUnique: vi.fn(),
    },
    vehicle_commissioning_issues: {
      findUnique: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

vi.mock('~/modules/data-scope/data-scope.service', () => ({
  DataScopeService: {
    getDeptCandidates: vi.fn(async (deptIds: string[]) => deptIds),
    getScopeForModule: vi.fn(),
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

vi.mock('~/modules/after-sales', () => ({
  AfterSalesAPI: {
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
      respDeptId:
        typeof body.responsibleDepartmentId === 'string' &&
        body.responsibleDepartmentId.trim()
          ? body.responsibleDepartmentId.trim()
          : undefined,
      status: body.status,
      type: body.type,
    };
  }),
}));

vi.mock('~/modules/quality-loss/quality-loss-manual-context', () => ({
  resolveManualQualityLossContext: vi.fn(async () => ({
    partId: 'part-1',
    partName: '主梁',
    projectId: 'project-1',
    projectName: '1000t 架桥机',
    workOrderNumber: 'WO-468624',
  })),
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

  it('should persist resolved work order, project and BOM part on manual update', async () => {
    const { QualityLossRouteUpdateService } = await import(
      '~/modules/quality-loss/quality-loss-route-update.service'
    );
    const prismaModule = await import('~/utils/prisma');
    const prisma = prismaModule.default;
    const update = vi.fn().mockResolvedValue({
      actualClaim: 0,
      amount: 100,
      createdBy: 'user-1',
      id: 'manual-1',
      isDeleted: false,
      occurDate: new Date(),
      partName: '主梁',
      projectName: '1000t 架桥机',
      respDept: 'QA',
      status: 'Pending',
      workOrderNumber: 'WO-468624',
    });
    vi.mocked(prisma.$transaction).mockImplementation(async (callback: any) =>
      callback({ quality_losses: { update } }),
    );

    const result = await QualityLossRouteUpdateService.updateByRouteId({
      body: {
        lossSource: 'Manual',
        partName: '主梁',
        workOrderNumber: 'WO-468624',
      },
      id: 'QL-2026-001',
      userId: 'user-1',
    });

    expect(result).toEqual({ ok: true });
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          partId: 'part-1',
          partName: '主梁',
          projectId: 'project-1',
          projectName: '1000t 架桥机',
          workOrderNumber: 'WO-468624',
        }),
      }),
    );
  });

  it('rebuilds the department snapshot from canonical ID in the update transaction', async () => {
    const { QualityLossRouteUpdateService } = await import(
      '~/modules/quality-loss/quality-loss-route-update.service'
    );
    const prismaModule = await import('~/utils/prisma');
    const prisma = prismaModule.default;
    const update = vi.fn().mockResolvedValue({
      id: 'manual-1',
      respDept: 'Current Quality',
      respDeptId: 'dept-qa',
    });
    const findFirst = vi.fn().mockResolvedValue({
      id: 'dept-qa',
      name: 'Current Quality',
    });
    vi.mocked(prisma.$transaction).mockImplementation(async (callback: any) =>
      callback({
        departments: { findFirst },
        quality_losses: { update },
      }),
    );

    const result = await QualityLossRouteUpdateService.updateByRouteId({
      body: {
        lossSource: 'Manual',
        responsibleDepartment: 'Historical Quality',
        responsibleDepartmentId: 'dept-qa',
      },
      id: 'QL-2026-001',
      userId: 'user-1',
    });

    expect(result).toEqual({ ok: true });
    expect(findFirst).toHaveBeenCalledWith({
      where: { id: 'dept-qa', isDeleted: false, status: 1 },
      select: { id: true, name: true },
    });
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          respDept: 'Current Quality',
          respDeptId: 'dept-qa',
        }),
      }),
    );
  });

  it('preserves the historical department snapshot when no valid ID is submitted', async () => {
    const { QualityLossRouteUpdateService } = await import(
      '~/modules/quality-loss/quality-loss-route-update.service'
    );
    const prismaModule = await import('~/utils/prisma');
    const prisma = prismaModule.default;
    const update = vi.fn().mockResolvedValue({ id: 'manual-1' });
    vi.mocked(prisma.$transaction).mockImplementation(async (callback: any) =>
      callback({ quality_losses: { update } }),
    );

    await QualityLossRouteUpdateService.updateByRouteId({
      body: {
        amount: 100,
        lossSource: 'Manual',
        responsibleDepartment: 'Historical Quality',
        responsibleDepartmentId: null,
      },
      id: 'QL-2026-001',
      userId: 'user-1',
    });

    const data = update.mock.calls[0]?.[0]?.data;
    expect(data).not.toHaveProperty('respDept');
    expect(data).not.toHaveProperty('respDeptId');
  });

  it('rejects an inactive or unknown department ID without updating the row', async () => {
    const { QualityLossRouteUpdateService } = await import(
      '~/modules/quality-loss/quality-loss-route-update.service'
    );
    const prismaModule = await import('~/utils/prisma');
    const prisma = prismaModule.default;
    const update = vi.fn();
    vi.mocked(prisma.$transaction).mockImplementation(async (callback: any) =>
      callback({
        departments: { findFirst: vi.fn().mockResolvedValue(null) },
        quality_losses: { update },
      }),
    );

    const result = await QualityLossRouteUpdateService.updateByRouteId({
      body: {
        lossSource: 'Manual',
        responsibleDepartmentId: 'dept-missing',
      },
      id: 'QL-2026-001',
      userId: 'user-1',
    });

    expect(result).toEqual(
      expect.objectContaining({
        code: 'BAD_REQUEST',
        ok: false,
      }),
    );
    expect(update).not.toHaveBeenCalled();
  });

  it('should update external record via AfterSalesService', async () => {
    const { QualityLossRouteUpdateService } = await import(
      '~/modules/quality-loss/quality-loss-route-update.service'
    );

    const result = await QualityLossRouteUpdateService.updateByRouteId({
      body: { actualClaim: 5, lossSource: 'External' },
      id: 'EXT-12',
      userId: 'user-1',
    });

    expect(result).toEqual({ ok: true });
    expect(AfterSalesAPI.updateQualityLossFields).toHaveBeenCalledWith({
      actualClaim: 5,
      id: 'EXT-12',
    });
  });

  it('rejects status changes on external records', async () => {
    const { QualityLossRouteUpdateService } = await import(
      '~/modules/quality-loss/quality-loss-route-update.service'
    );

    const result = await QualityLossRouteUpdateService.updateByRouteId({
      body: { actualClaim: 5, lossSource: 'External', status: 'Closed' },
      id: 'EXT-12',
      userId: 'user-1',
    });

    expect(result).toEqual(
      expect.objectContaining({
        code: 'BAD_REQUEST',
        ok: false,
        message: expect.stringContaining('对应业务页面'),
      }),
    );
    expect(AfterSalesAPI.updateQualityLossFields).not.toHaveBeenCalled();
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

  describe('ownership guard', () => {
    it('rejects SELF scope when manual record belongs to another user', async () => {
      const { QualityLossRouteUpdateService } = await import(
        '~/modules/quality-loss/quality-loss-route-update.service'
      );
      const prismaModule = await import('~/utils/prisma');
      const prisma = prismaModule.default;

      (prisma.quality_losses.findFirst as any).mockResolvedValue({
        createdBy: 'user-2',
        respDept: 'QA',
      });

      await expect(
        QualityLossRouteUpdateService.updateByRouteId({
          body: { amount: 1, lossSource: 'Manual' },
          dataScope: { scopeType: 'SELF', deptIds: [] },
          id: 'QL-1',
          userId: 'user-1',
        }),
      ).rejects.toMatchObject({
        code: 'FORBIDDEN',
        httpStatus: 403,
      });
    });

    it('passes SELF scope when manual record belongs to caller', async () => {
      const { QualityLossRouteUpdateService } = await import(
        '~/modules/quality-loss/quality-loss-route-update.service'
      );
      const prismaModule = await import('~/utils/prisma');
      const prisma = prismaModule.default;

      (prisma.quality_losses.findFirst as any).mockResolvedValue({
        createdBy: 'user-1',
        respDept: 'QA',
      });
      vi.mocked(prisma.$transaction).mockImplementation(async (cb: any) => {
        const tx = { quality_losses: { update: vi.fn() } };
        await cb(tx);
        return tx;
      });

      const result = await QualityLossRouteUpdateService.updateByRouteId({
        body: { amount: 1, lossSource: 'Manual' },
        dataScope: { scopeType: 'SELF', deptIds: [] },
        id: 'QL-1',
        userId: 'user-1',
      });
      expect(result).toEqual({ ok: true });
    });

    it('rejects SELF scope on external record owned by another user', async () => {
      const { QualityLossRouteUpdateService } = await import(
        '~/modules/quality-loss/quality-loss-route-update.service'
      );
      const prismaModule = await import('~/utils/prisma');
      const prisma = prismaModule.default;

      (prisma.after_sales.findUnique as any).mockResolvedValue({
        createdBy: 'user-2',
        division: null,
        feedbackDept: null,
        respDept: 'QA',
      });

      await expect(
        QualityLossRouteUpdateService.updateByRouteId({
          body: { actualClaim: 5, lossSource: 'External' },
          dataScope: { scopeType: 'SELF', deptIds: [] },
          id: 'EXT-12',
          userId: 'user-1',
        }),
      ).rejects.toMatchObject({ code: 'FORBIDDEN', httpStatus: 403 });
    });

    it('passes DEPT scope when target respDept matches user departments', async () => {
      const { QualityLossRouteUpdateService } = await import(
        '~/modules/quality-loss/quality-loss-route-update.service'
      );
      const prismaModule = await import('~/utils/prisma');
      const prisma = prismaModule.default;

      (prisma.after_sales.findUnique as any).mockResolvedValue({
        createdBy: 'user-2',
        division: null,
        feedbackDept: null,
        respDept: 'dept-a',
      });

      const result = await QualityLossRouteUpdateService.updateByRouteId({
        body: { actualClaim: 9, lossSource: 'External' },
        dataScope: { scopeType: 'DEPT', deptIds: ['dept-a'] },
        id: 'EXT-12',
        userId: 'user-1',
      });
      expect(result).toEqual({ ok: true });
    });

    it('rejects DEPT scope when target respDept is outside scope', async () => {
      const { QualityLossRouteUpdateService } = await import(
        '~/modules/quality-loss/quality-loss-route-update.service'
      );
      const prismaModule = await import('~/utils/prisma');
      const prisma = prismaModule.default;

      (prisma.quality_records.findUnique as any).mockResolvedValue({
        createdBy: 'user-9',
        responsibleBU: null,
        responsibleDepartment: 'dept-other',
      });

      await expect(
        QualityLossRouteUpdateService.updateByRouteId({
          body: { actualClaim: 1, lossSource: 'Internal' },
          dataScope: { scopeType: 'DEPT', deptIds: ['dept-a'] },
          id: 'INT-1',
          userId: 'user-1',
        }),
      ).rejects.toMatchObject({ code: 'FORBIDDEN', httpStatus: 403 });
    });

    it('rejects SELF scope on commissioning record owned by another user', async () => {
      const { QualityLossRouteUpdateService } = await import(
        '~/modules/quality-loss/quality-loss-route-update.service'
      );
      const prismaModule = await import('~/utils/prisma');
      const prisma = prismaModule.default;
      const { VehicleCommissioningService } = await import(
        '~/modules/vehicle-commissioning/vehicle-commissioning.service'
      );

      vi.mocked(VehicleCommissioningService.findIssueId).mockResolvedValue(
        'DA-1',
      );
      (prisma.vehicle_commissioning_issues.findUnique as any).mockResolvedValue(
        {
          createdBy: 'user-2',
          responsibleDepartment: 'Service',
        },
      );

      await expect(
        QualityLossRouteUpdateService.updateByRouteId({
          body: { actualClaim: 0, lossSource: 'Commissioning' },
          dataScope: { scopeType: 'SELF', deptIds: [] },
          id: 'DA-1',
          userId: 'user-1',
        }),
      ).rejects.toMatchObject({ code: 'FORBIDDEN', httpStatus: 403 });
    });

    it('returns NOT_FOUND when target row no longer exists', async () => {
      const { QualityLossRouteUpdateService } = await import(
        '~/modules/quality-loss/quality-loss-route-update.service'
      );
      const prismaModule = await import('~/utils/prisma');
      const prisma = prismaModule.default;

      (prisma.quality_losses.findFirst as any).mockResolvedValue(null);

      await expect(
        QualityLossRouteUpdateService.updateByRouteId({
          body: { amount: 1, lossSource: 'Manual' },
          dataScope: { scopeType: 'SELF', deptIds: [] },
          id: 'QL-missing',
          userId: 'user-1',
        }),
      ).rejects.toMatchObject({ code: 'NOT_FOUND', httpStatus: 404 });
    });

    it('skips ownership checks under ALL scope', async () => {
      const { QualityLossRouteUpdateService } = await import(
        '~/modules/quality-loss/quality-loss-route-update.service'
      );
      const prismaModule = await import('~/utils/prisma');
      const prisma = prismaModule.default;

      const result = await QualityLossRouteUpdateService.updateByRouteId({
        body: { actualClaim: 1, lossSource: 'External' },
        dataScope: { scopeType: 'ALL', deptIds: [] },
        id: 'EXT-12',
        userId: 'user-1',
      });
      expect(result).toEqual({ ok: true });
      expect(prisma.after_sales.findUnique).not.toHaveBeenCalled();
    });
  });
});
