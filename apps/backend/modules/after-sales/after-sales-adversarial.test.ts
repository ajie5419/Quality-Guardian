import { beforeEach, describe, expect, it, vi } from 'vitest';
import prisma from '~/utils/prisma';

import { AfterSalesService } from './after-sales.service';

vi.mock('~/utils/prisma', () => {
  const afterSales = {
    aggregate: vi.fn(),
    count: vi.fn(),
    findMany: vi.fn(),
    findFirst: vi.fn(),
    findUnique: vi.fn(),
    groupBy: vi.fn(),
    update: vi.fn(),
  };
  const transactionClient = {
    after_sales: afterSales,
    metric_refresh_jobs: {
      createMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
  };
  return {
    default: {
      ...transactionClient,
      $transaction: vi.fn((callback) => callback(transactionClient)),
    },
  };
});

vi.mock('~/modules/file-storage/file-storage.service', () => ({
  FileStorageService: {
    getFileBufferByStoredName: vi.fn(),
  },
}));

vi.mock('~/modules/system-log/system-log.service', () => ({
  SystemLogService: { logAudit: vi.fn() },
}));

vi.mock('~/utils/department-multi', () => ({
  parseResponsibleDepartments: vi.fn((v: any) => {
    if (!v) return [];
    try {
      const parsed = JSON.parse(v);
      return Array.isArray(parsed) ? parsed : [parsed];
    } catch {
      return v ? [v] : [];
    }
  }),
}));

vi.mock('~/modules/after-sales/after-sales-analytics.service', () => ({
  AfterSalesAnalyticsService: {
    getStats: vi.fn().mockResolvedValue({
      avgCost: 0,
      engineeringIssueCount: 0,
      incomingBatchCount: 0,
      incomingQualifiedRate: 100,
      totalCount: 0,
      totalCost: 0,
    }),
    getChartAggregation: vi.fn().mockResolvedValue([]),
  },
}));

vi.mock('~/modules/after-sales/after-sales-integration.service', () => ({
  AfterSalesIntegrationService: {
    findIdBySerialNumber: vi.fn(),
    updateQualityLossFields: vi.fn(),
    getQualityLossTrendRows: vi.fn().mockResolvedValue([]),
    getLossRecordsForAggregation: vi.fn().mockResolvedValue([]),
    countLossRecordsForAggregation: vi.fn().mockResolvedValue(0),
    getQualityLossDrillDownRecords: vi.fn().mockResolvedValue([]),
    getSupplierScoringData: vi.fn().mockResolvedValue({
      records: [],
      stats: [],
      statusStats: [],
    }),
    getWeeklyReportIssues: vi.fn().mockResolvedValue([]),
    getVehicleFailureRecords: vi.fn().mockResolvedValue([]),
    findEarliestVehicleFailureDate: vi.fn().mockResolvedValue(null),
    getReportPeriodMetrics: vi.fn().mockResolvedValue({}),
    getStatsForDashboard: vi.fn().mockResolvedValue({}),
  },
}));

vi.mock('~/modules/after-sales/after-sales-payload', () => ({
  buildGovernedAfterSalesUpdateData: vi.fn().mockResolvedValue({
    costsChanged: false,
    data: {},
  }),
}));

vi.mock('~/modules/after-sales/after-sales-query', () => ({
  buildAfterSalesExplicitDateRange: vi.fn().mockReturnValue(undefined),
  buildAfterSalesDateRange: vi.fn().mockReturnValue({
    end: new Date('2026-12-31'),
    start: new Date('2026-01-01'),
  }),
}));

vi.mock('~/modules/after-sales/after-sales-status', () => ({
  normalizeAfterSalesClaimStatus: vi.fn((v: any) => {
    if (!v) return 'OPEN';
    const s = String(v).trim().toUpperCase();
    if (
      [
        'CANCELLED',
        'CLOSED',
        'COMPLETED',
        'IN_PROGRESS',
        'OPEN',
        'RESOLVED',
      ].includes(s)
    )
      return s;
    return 'OPEN';
  }),
}));

vi.mock('@qgs/shared', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@qgs/shared')>();
  return {
    ...actual,
    AUDIT_TEMPLATES: {
      ...actual.AUDIT_TEMPLATES,
      AFTER_SALES_SOFT_DELETE: '删除售后: {{id}}',
      AFTER_SALES_UPDATE: '更新售后: {{id}}',
    },
    formatDate: vi.fn((d: any) =>
      d ? new Date(d).toISOString().slice(0, 10) : '',
    ),
    tryParsePhotos: vi.fn(() => []),
  };
});

vi.mock('~/modules/data-scope/data-scope.service', () => ({
  DataScopeService: {
    buildAfterSalesWhere: vi.fn().mockImplementation((where: any) => where),
  },
}));

describe('afterSalesService – adversarial', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getList', () => {
    it('returns empty array when no records', async () => {
      (prisma.after_sales.findMany as any).mockResolvedValue([]);

      const result = await AfterSalesService.getList({});

      expect(result).toEqual([]);
    });

    it('returns records when found', async () => {
      (prisma.after_sales.findMany as any).mockResolvedValue([
        { id: 'AS-001', claimStatus: 'OPEN' },
      ]);

      const result = await AfterSalesService.getList({});

      expect(result).toHaveLength(1);
    });

    it('filters supplier portrait records by canonical supplier ID', async () => {
      (prisma.after_sales.findMany as any).mockResolvedValue([]);

      await AfterSalesService.getList({
        supplierBrand: 'Stale Supplier Name',
        supplierBrandId: 'supplier-1',
      });

      expect(prisma.after_sales.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ supplierBrandId: 'supplier-1' }),
        }),
      );
      const where = (prisma.after_sales.findMany as any).mock.calls[0][0].where;
      expect(where).not.toHaveProperty('OR');
    });

    it('filters all quality classifications by exact scoped IDs', async () => {
      (prisma.after_sales.findMany as any).mockResolvedValue([]);

      await AfterSalesService.getList({
        defectCategoryId: 'defect-category',
        defectSubcategoryId: 'defect-subcategory',
        defectType: 'Stale Defect Name',
        productCategoryId: 'product-category',
        productSubcategoryId: 'product-subcategory',
        productType: 'Stale Product Name',
      });

      expect(prisma.after_sales.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            defectCategoryId: 'defect-category',
            defectSubcategoryId: 'defect-subcategory',
            productCategoryId: 'product-category',
            productSubcategoryId: 'product-subcategory',
          }),
        }),
      );
      const where = (prisma.after_sales.findMany as any).mock.calls[0][0].where;
      expect(where).not.toHaveProperty('defectType');
      expect(where).not.toHaveProperty('productType');
    });

    it('applies expanded text filters and explicit date ranges in the database where', async () => {
      const explicitRange = {
        end: new Date('2026-08-01T00:00:00.000'),
        start: new Date('2026-07-01T00:00:00.000'),
      };
      const { buildAfterSalesExplicitDateRange } = await import(
        '~/modules/after-sales/after-sales-query'
      );
      vi.mocked(buildAfterSalesExplicitDateRange).mockReturnValue(
        explicitRange,
      );
      (prisma.after_sales.findMany as any).mockResolvedValue([]);

      await AfterSalesService.getList({
        customerName: 'Customer A',
        defectType: '制造装配缺陷',
        endDate: '2026-07-31',
        handler: 'Handler A',
        partName: 'Part A',
        productType: '车辆产品',
        projectName: 'Project A',
        responsibleDept: 'Quality',
        startDate: '2026-07-01',
        supplierBrand: 'Brand A',
        workOrderNumber: 'WO-001',
      });

      expect(prisma.after_sales.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            customerName: { contains: 'Customer A' },
            handler: { contains: 'Handler A' },
            occurDate: {
              gte: explicitRange.start,
              lt: explicitRange.end,
            },
            partName: { contains: 'Part A' },
            projectName: { contains: 'Project A' },
            workOrderNumber: { contains: 'WO-001' },
          }),
        }),
      );
      const where = (prisma.after_sales.findMany as any).mock.calls.at(-1)[0]
        .where;
      expect(where.AND).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            OR: expect.arrayContaining([
              { respDept: { contains: 'Quality' } },
              { respDeptId: { contains: 'Quality' } },
              { responsibleDepartments: { contains: 'Quality' } },
            ]),
          }),
          expect.objectContaining({
            OR: expect.arrayContaining([
              { supplierBrand: { contains: 'Brand A' } },
              { projectName: { contains: 'Brand A' } },
            ]),
          }),
          expect.objectContaining({
            OR: expect.arrayContaining([
              { productType: { contains: '车辆产品' } },
              {
                productCategory: {
                  is: { name: { contains: '车辆产品' } },
                },
              },
            ]),
          }),
          expect.objectContaining({
            OR: expect.arrayContaining([
              { defectType: { contains: '制造装配缺陷' } },
              {
                defectCategory: {
                  is: { name: { contains: '制造装配缺陷' } },
                },
              },
            ]),
          }),
        ]),
      );
    });
  });

  describe('getStats', () => {
    it('delegates to analytics service', async () => {
      const result = await AfterSalesService.getStats({});
      expect(result).toBeDefined();
      expect((result as any).totalCount).toBe(0);
    });
  });

  describe('getSupplierScoringData', () => {
    it('delegates to integration service', async () => {
      const result = await AfterSalesService.getSupplierScoringData({
        since: new Date('2025-01-01'),
        supplierIds: ['supplier-1'],
      });

      expect(result.stats).toEqual([]);
      expect(result.statusStats).toEqual([]);
      expect(result.records).toEqual([]);
    });
  });

  describe('findIdBySerialNumber', () => {
    it('delegates to integration service', async () => {
      const { AfterSalesIntegrationService } = await import(
        '~/modules/after-sales/after-sales-integration.service'
      );
      vi.mocked(
        AfterSalesIntegrationService.findIdBySerialNumber,
      ).mockResolvedValue('AS-001' as any);

      const result = await AfterSalesService.findIdBySerialNumber(1001);
      expect(result).toBe('AS-001');
    });
  });

  describe('updateQualityLossFields', () => {
    it('delegates to integration service', async () => {
      const { AfterSalesIntegrationService } = await import(
        '~/modules/after-sales/after-sales-integration.service'
      );
      vi.mocked(
        AfterSalesIntegrationService.updateQualityLossFields,
      ).mockResolvedValue({} as any);

      const result = await AfterSalesService.updateQualityLossFields({
        actualClaim: 5000,
        id: 'AS-001',
      });
      expect(result).toBeDefined();
    });
  });

  describe('getQualityLossTrendRows', () => {
    it('returns empty array', async () => {
      const result = await AfterSalesService.getQualityLossTrendRows({
        granularity: 'month',
        year: 2026,
      });
      expect(result).toEqual([]);
    });
  });

  describe('getLossRecordsForAggregation', () => {
    it('returns empty array when no records', async () => {
      const result = await AfterSalesService.getLossRecordsForAggregation({});
      expect(result).toEqual([]);
    });

    it('handles undefined params', async () => {
      const result = await AfterSalesService.getLossRecordsForAggregation();
      expect(result).toEqual([]);
    });
  });

  describe('countLossRecordsForAggregation', () => {
    it('returns 0 when no records', async () => {
      const result = await AfterSalesService.countLossRecordsForAggregation({});
      expect(result).toBe(0);
    });
  });

  describe('updateByRoute', () => {
    it('updates record when costs not changed', async () => {
      (prisma.after_sales.update as any).mockResolvedValue({});

      await AfterSalesService.updateByRoute('AS-001', {
        description: 'Updated',
      });

      expect(prisma.after_sales.update).toHaveBeenCalled();
    });

    it('writes the cost fields verbatim and lets DB compute qualityLoss elsewhere', async () => {
      const { buildGovernedAfterSalesUpdateData } = await import(
        '~/modules/after-sales/after-sales-payload'
      );
      vi.mocked(buildGovernedAfterSalesUpdateData).mockResolvedValue({
        costsChanged: true,
        data: { materialCost: 5000, laborTravelCost: 1000 },
      });
      (prisma.after_sales.findUnique as any).mockResolvedValue({
        laborTravelCost: 500,
        materialCost: 2000,
      });
      (prisma.after_sales.update as any).mockResolvedValue({});

      await AfterSalesService.updateByRoute('AS-001', {
        laborTravelCost: 1000,
        materialCost: 5000,
      });

      expect(prisma.after_sales.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            laborTravelCost: 1000,
            materialCost: 5000,
          }),
        }),
      );
      const callArgs = (prisma.after_sales.update as any).mock.calls[0][0];
      expect(callArgs.data).not.toHaveProperty('qualityLoss');
    });

    it('throws when record not found during cost update', async () => {
      const { buildGovernedAfterSalesUpdateData } = await import(
        '~/modules/after-sales/after-sales-payload'
      );
      vi.mocked(buildGovernedAfterSalesUpdateData).mockResolvedValue({
        costsChanged: true,
        data: { materialCost: 5000 },
      });
      (prisma.after_sales.findUnique as any).mockResolvedValue(null);

      await expect(
        AfterSalesService.updateByRoute('NONEXISTENT', { materialCost: 5000 }),
      ).rejects.toThrow('AFTER_SALES_NOT_FOUND');
    });

    it('keeps using current costs even when updateData has null costs', async () => {
      const { buildGovernedAfterSalesUpdateData } = await import(
        '~/modules/after-sales/after-sales-payload'
      );
      vi.mocked(buildGovernedAfterSalesUpdateData).mockResolvedValue({
        costsChanged: true,
        data: { laborTravelCost: null, materialCost: null },
      });
      (prisma.after_sales.findUnique as any).mockResolvedValue({
        laborTravelCost: 3000,
        materialCost: 7000,
      });
      (prisma.after_sales.update as any).mockResolvedValue({});

      await AfterSalesService.updateByRoute('AS-001', {});

      const callArgs = (prisma.after_sales.update as any).mock.calls[0][0];
      expect(callArgs.data).not.toHaveProperty('qualityLoss');
    });
  });
});
