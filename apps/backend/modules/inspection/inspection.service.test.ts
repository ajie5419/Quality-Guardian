import { beforeEach, describe, expect, it, vi } from 'vitest';
import { InspectionService } from '~/modules/inspection/inspection.service';
import { MasterDataGovernanceKernel } from '~/utils/canonical-master-data';
import prisma from '~/utils/prisma';

vi.mock('~/modules/supplier-identity', () => ({
  SupplierIdentityService: {
    resolveSupplierForInspection: vi.fn().mockResolvedValue(null),
    resolveTeamById: vi.fn().mockImplementation(async (teamId: string) => ({
      id: teamId,
      name: 'A班',
    })),
  },
}));

// Mock prisma
vi.mock('~/utils/prisma', () => ({
  default: {
    inspections: {
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    inspection_items: {
      deleteMany: vi.fn(),
      createMany: vi.fn(),
    },
    quality_records: {
      count: vi.fn(),
      aggregate: vi.fn(),
      groupBy: vi.fn(),
      findMany: vi.fn(),
    },
    processes: {
      findMany: vi.fn(),
    },
    $queryRawUnsafe: vi.fn(),
    $queryRaw: vi.fn(),
    $transaction: vi.fn((cb) =>
      cb({
        inspections: {
          create: vi.fn().mockResolvedValue({ id: 'test-id' }),
          update: vi.fn().mockResolvedValue({ id: 'test-id' }),
        },
        inspection_items: {
          deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
          createMany: vi.fn().mockResolvedValue({ count: 1 }),
        },
      }),
    ),
  },
}));

vi.mock('~/utils/canonical-master-data', async () => {
  const actual = await vi.importActual<
    typeof import('~/utils/canonical-master-data')
  >('~/utils/canonical-master-data');
  return {
    ...actual,
    MasterDataGovernanceKernel: {
      ...actual.MasterDataGovernanceKernel,
      resolveCanonicalNamesByIds: vi.fn().mockResolvedValue(new Map()),
    },
  };
});

describe('inspectionService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (prisma.$queryRaw as any).mockResolvedValue([]);
    (prisma.$queryRawUnsafe as any).mockResolvedValue([]);
  });

  describe('determineItemResult', () => {
    it('should correctly determine PASS for quantitative within tolerance', () => {
      const item = {
        standardValue: 10,
        measuredValue: 10.5,
        upperTolerance: 1,
        lowerTolerance: 1,
        result: 'PASS',
      };
      expect(InspectionService.determineItemResult(item)).toBe('PASS');
    });

    it('should determine FAIL for quantitative outside tolerance', () => {
      const item = {
        standardValue: 10,
        measuredValue: 12,
        upperTolerance: 1,
        lowerTolerance: 1,
        result: 'PASS',
      };
      expect(InspectionService.determineItemResult(item)).toBe('FAIL');
    });

    it('should respect NA result', () => {
      const item = { result: 'NA' };
      expect(InspectionService.determineItemResult(item)).toBe('NA');
    });
  });

  describe('generateSerialNumber', () => {
    it('should handle first record of the day', async () => {
      (prisma.inspections.findFirst as any).mockResolvedValue(null);
      const sn = await InspectionService.generateSerialNumber();
      expect(sn).toMatch(/^INS-\d{8}-001$/);
    });

    it('should increment existing sequence', async () => {
      (prisma.inspections.findFirst as any).mockResolvedValue({
        serialNumber: `INS-${new Date().toISOString().slice(0, 10).replaceAll('-', '')}-005`,
      });
      const sn = await InspectionService.generateSerialNumber();
      const seq = sn.split('-')[2];
      expect(seq).toBe('006');
    });
  });

  describe('normalizeQuantitySummary', () => {
    it('should prefer explicit qualified and unqualified quantities when valid', () => {
      const result = InspectionService.normalizeQuantitySummary({
        quantity: 10,
        qualifiedQuantity: 7,
        unqualifiedQuantity: 3,
        result: 'FAIL',
      });

      expect(result).toEqual({
        quantity: 10,
        qualifiedQuantity: 7,
        unqualifiedQuantity: 3,
      });
    });

    it('should derive qualified quantity from unqualified quantity when only it is provided', () => {
      const result = InspectionService.normalizeQuantitySummary({
        quantity: 8,
        unqualifiedQuantity: 2,
        result: 'FAIL',
      });

      expect(result).toEqual({
        quantity: 8,
        qualifiedQuantity: 6,
        unqualifiedQuantity: 2,
      });
    });

    it('should fall back to fail-all when record result is fail and no split quantity is provided', () => {
      const result = InspectionService.normalizeQuantitySummary({
        quantity: 5,
        result: 'FAIL',
      });

      expect(result).toEqual({
        quantity: 5,
        qualifiedQuantity: 0,
        unqualifiedQuantity: 5,
      });
    });
  });

  describe('getIssueStats', () => {
    it('should correctly aggregate counts and loss amounts', async () => {
      (prisma.quality_records.aggregate as any).mockResolvedValue({
        _count: { id: 2 },
        _sum: { lossAmount: 300 },
      });
      (prisma.quality_records.count as any).mockResolvedValue(1);
      (prisma.quality_records.groupBy as any).mockResolvedValueOnce([
        { defectTypeId: 'defect-minor', _count: { id: 1 } },
        { defectTypeId: 'defect-major', _count: { id: 1 } },
      ]);
      (
        MasterDataGovernanceKernel.resolveCanonicalNamesByIds as any
      ).mockResolvedValue(
        new Map([
          ['defect-major', 'Major'],
          ['defect-minor', 'Minor'],
        ]),
      );
      (prisma.$queryRaw as any).mockResolvedValueOnce([
        { amount: 300, month: 1 },
      ]);

      const stats = await InspectionService.getIssueStats({ year: 2024 });

      expect(stats.totalCount).toBe(2);
      expect(stats.openCount).toBe(1);
      expect(stats.closedCount).toBe(1);
      expect(stats.totalLoss).toBe(300);
      expect(stats.closedRate).toBe(50);
      expect(stats.pieData).toContainEqual({
        id: 'defect-minor',
        name: 'Minor',
        resolutionStatus: 'RESOLVED',
        value: 1,
      });
      expect(stats.pieData).toContainEqual({
        id: 'defect-major',
        name: 'Major',
        resolutionStatus: 'RESOLVED',
        value: 1,
      });
      expect(stats.trendData).toContainEqual({ period: '2024-01', value: 300 });
    });
  });

  describe('getIssues', () => {
    it('should filter by supplierName when provided', async () => {
      (prisma.quality_records.count as any).mockResolvedValue(0);
      (prisma.quality_records.findMany as any).mockResolvedValue([]);

      await InspectionService.getIssues({
        supplierName: '江西子轩电气有限公司',
      });

      expect(prisma.quality_records.count).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            isDeleted: false,
            supplierName: { contains: '江西子轩电气有限公司' },
          }),
        }),
      );
      expect(prisma.quality_records.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            isDeleted: false,
            supplierName: { contains: '江西子轩电气有限公司' },
          }),
        }),
      );
    });

    it('should query by processName with processId fallback when process exists', async () => {
      (prisma.$queryRawUnsafe as any).mockResolvedValue([
        { id: 'process-1', name: '焊接' },
      ]);
      (prisma.quality_records.count as any).mockResolvedValue(0);
      (prisma.quality_records.findMany as any).mockResolvedValue([]);

      await InspectionService.getIssues({
        processName: '焊接',
      });

      expect(prisma.quality_records.count).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: expect.arrayContaining([
              { processName: '焊接' },
              { processId: 'process-1' },
            ]),
          }),
        }),
      );
    });

    it('should query by processName only when process id is not resolved', async () => {
      (prisma.$queryRawUnsafe as any).mockResolvedValue([]);
      (prisma.quality_records.count as any).mockResolvedValue(0);
      (prisma.quality_records.findMany as any).mockResolvedValue([]);

      await InspectionService.getIssues({
        processName: '未知工序',
      });

      const where = (prisma.quality_records.count as any).mock.calls[0][0]
        .where;
      expect(where.processName).toBe('未知工序');
      expect(where.OR).toBeUndefined();
    });
  });

  describe('update', () => {
    it('should use resolved processId for template binding when processName changes', async () => {
      const stopError = new Error('stop-after-template-binding');
      const inspectionFormFindFirst = vi.fn().mockResolvedValue(null);
      (prisma.$queryRawUnsafe as any).mockResolvedValue([
        { id: 'process-new', name: '新工序' },
      ]);
      (prisma.$transaction as any).mockImplementation(async (callback: any) =>
        callback({
          inspections: {
            findUnique: vi.fn().mockResolvedValue({
              category: 'PROCESS',
              incomingType: null,
              processId: 'process-old',
              processName: '旧工序',
              team: 'A班',
              teamId: 'team-1',
              templateId: null,
              templateName: null,
              workOrderNumber: 'WO-1001',
            }),
            update: vi.fn().mockResolvedValue({
              id: 'inspection-1',
              processId: 'process-new',
              processName: '新工序',
              documents: null,
              workOrderNumber: 'WO-1001',
            }),
          },
          processes: {
            findFirst: vi.fn().mockResolvedValue({
              name: '旧工序',
            }),
          },
          inspection_form_templates: {
            findFirst: inspectionFormFindFirst,
          },
          inspection_items: {
            deleteMany: vi.fn().mockRejectedValue(stopError),
            createMany: vi.fn(),
          },
        }),
      );

      await expect(
        InspectionService.update('inspection-1', {
          category: 'PROCESS',
          workOrderNumber: 'WO-1001',
          projectName: 'P-1',
          processName: '新工序',
          quantity: 1,
          inspector: 'tester',
          inspectionDate: new Date('2026-01-01'),
          teamId: 'team-1',
        } as any),
      ).rejects.toThrow('stop-after-template-binding');

      expect(inspectionFormFindFirst).toHaveBeenCalled();
      const templateQuery = inspectionFormFindFirst.mock.calls[0][0];
      expect(templateQuery.where.OR).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ processId: 'process-new' }),
        ]),
      );
    });

    it('loads the canonical team name when updating inspection', async () => {
      const stopError = new Error('stop-after-template-binding');
      const inspectionFormFindFirst = vi.fn().mockResolvedValue(null);
      const inspectionsUpdate = vi.fn().mockResolvedValue({
        id: 'inspection-2',
        processId: null,
        processName: null,
        documents: null,
        workOrderNumber: 'WO-1002',
      });
      (prisma.$queryRawUnsafe as any).mockResolvedValue([]);
      (prisma.$transaction as any).mockImplementation(async (callback: any) =>
        callback({
          inspections: {
            findUnique: vi.fn().mockResolvedValue({
              category: 'PROCESS',
              incomingType: null,
              processId: null,
              processName: null,
              templateId: null,
              templateName: null,
              workOrderNumber: 'WO-1002',
            }),
            update: inspectionsUpdate,
          },
          processes: {
            findFirst: vi.fn().mockResolvedValue(null),
          },
          inspection_form_templates: {
            findFirst: inspectionFormFindFirst,
          },
          inspection_items: {
            deleteMany: vi.fn().mockRejectedValue(stopError),
            createMany: vi.fn(),
          },
        }),
      );

      await expect(
        InspectionService.update('inspection-2', {
          category: 'PROCESS',
          workOrderNumber: 'WO-1002',
          projectName: 'P-2',
          processName: '',
          quantity: 1,
          inspector: 'tester',
          inspectionDate: new Date('2026-01-01'),
          team: '  A班 ',
          teamId: 'team-1',
        } as any),
      ).rejects.toThrow('stop-after-template-binding');

      expect(inspectionsUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            team: 'A班',
          }),
        }),
      );
    });
  });
});
