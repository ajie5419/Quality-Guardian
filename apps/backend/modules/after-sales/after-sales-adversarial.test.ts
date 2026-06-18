import { beforeEach, describe, expect, it, vi } from 'vitest';
import prisma from '~/utils/prisma';

import { AfterSalesService } from './after-sales.service';

vi.mock('~/utils/prisma', () => ({
  default: {
    after_sales: {
      aggregate: vi.fn(),
      count: vi.fn(),
      findMany: vi.fn(),
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      groupBy: vi.fn(),
      update: vi.fn(),
    },
  },
}));

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

vi.mock('@qgs/shared', () => ({
  AUDIT_TEMPLATES: {
    AFTER_SALES_SOFT_DELETE: '删除售后: {{id}}',
    AFTER_SALES_UPDATE: '更新售后: {{id}}',
  },
  formatDate: vi.fn((d: any) =>
    d ? new Date(d).toISOString().slice(0, 10) : '',
  ),
  tryParsePhotos: vi.fn(() => []),
}));

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
        supplierNames: ['Supplier A'],
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

    it('calculates qualityLoss when costs changed', async () => {
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
          data: expect.objectContaining({ qualityLoss: 6000 }),
        }),
      );
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

    it('uses current costs when updateData has null costs', async () => {
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

      expect(prisma.after_sales.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ qualityLoss: 10_000 }),
        }),
      );
    });
  });
});
