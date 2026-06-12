import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AfterSalesService } from '~/modules/after-sales/after-sales.service';
import { InspectionService } from '~/modules/inspection/inspection.service';
import { QualityLossRecordMaintenanceService } from '~/modules/quality-loss/quality-loss-record-maintenance.service';
import { QualityLossReportingService } from '~/modules/quality-loss/quality-loss-reporting.service';
import { QualityLossSummaryService } from '~/modules/quality-loss/quality-loss-summary.service';
import { QualityLossService } from '~/modules/quality-loss/quality-loss.service';
import { VehicleCommissioningService } from '~/modules/vehicle-commissioning/vehicle-commissioning.service';
import prisma from '~/utils/prisma';

vi.mock('~/utils/prisma', () => ({
  default: {
    quality_losses: {
      count: vi.fn(),
      findMany: vi.fn(),
    },
    quality_records: {
      findMany: vi.fn(),
    },
    $queryRaw: vi.fn(),
  },
}));

vi.mock('~/utils/logger', () => ({
  createModuleLogger: () => ({
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  }),
}));

vi.mock('@qgs/shared', async () => {
  const actual = await vi.importActual('@qgs/shared');
  return {
    ...actual,
    isValidQualityLossStatus: (status: string) =>
      ['CONFIRMED', 'PENDING', 'PROCESSING', 'RESOLVED'].includes(
        String(status || '')
          .trim()
          .toUpperCase(),
      ),
  };
});

vi.mock('~/modules/dept/dept-tree', () => ({
  flattenDeptTree: vi.fn(() => []),
}));

vi.mock('~/modules/dept/dept.service', () => ({
  DeptService: { findAll: vi.fn().mockResolvedValue([]) },
}));

vi.mock('~/modules/after-sales/after-sales.service', () => ({
  AfterSalesService: {
    getLossRecordsForAggregation: vi.fn().mockResolvedValue([]),
    countLossRecordsForAggregation: vi.fn().mockResolvedValue(0),
    getQualityLossTrendRows: vi.fn().mockResolvedValue([]),
  },
}));

vi.mock('~/modules/inspection/inspection.service', () => ({
  InspectionService: {
    getLossRecordsForAggregation: vi.fn().mockResolvedValue([]),
    countLossRecordsForAggregation: vi.fn().mockResolvedValue(0),
    getQualityLossTrendRows: vi.fn().mockResolvedValue([]),
  },
}));

vi.mock(
  '~/modules/vehicle-commissioning/vehicle-commissioning.service',
  () => ({
    VehicleCommissioningService: {
      getLossRecordsForAggregation: vi.fn().mockResolvedValue([]),
      countLossRecordsForAggregation: vi.fn().mockResolvedValue(0),
      getQualityLossTrendRows: vi.fn().mockResolvedValue([]),
    },
  }),
);

vi.mock('~/modules/quality-loss/quality-loss-data-scope.service', () => ({
  QualityLossDataScopeService: {
    apply: vi.fn((items) => Promise.resolve(items)),
    sortFilteredByScope: vi.fn((items) => items),
  },
}));

vi.mock(
  '~/modules/quality-loss/quality-loss-record-maintenance.service',
  () => ({
    QualityLossRecordMaintenanceService: {
      deleteRecord: vi.fn(),
      batchDelete: vi.fn(),
      getDrillDown: vi.fn(),
    },
  }),
);

vi.mock('~/modules/quality-loss/quality-loss-summary.service', () => ({
  QualityLossSummaryService: {
    getDashboardSummary: vi.fn(),
    getYearlyCharts: vi.fn(),
  },
}));

vi.mock('~/modules/quality-loss/quality-loss-reporting.service', () => ({
  QualityLossReportingService: {
    getStatsForDashboard: vi.fn(),
    getWeeklyTrackingIssues: vi.fn(),
    getReportPeriodMetrics: vi.fn(),
  },
}));

vi.mock('~/modules/quality-loss/quality-loss-route-update.service', () => ({
  QualityLossRouteUpdateService: { updateByRouteId: vi.fn() },
}));

describe('qualityLossService – adversarial tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const makeManualRecords = (count: number) =>
    Array.from({ length: count }, (_, i) => ({
      id: `id-${i}`,
      lossId: `L${i}`,
      occurDate: new Date(`2024-01-${String(i + 1).padStart(2, '0')}`),
      amount: String((i + 1) * 100),
      actualClaim: '0',
      respDept: 'Dept',
      type: 'Material',
      status: 'Pending',
      isDeleted: false,
    }));

  // ─── getAllLosses: status filtering ───
  describe('getAllLosses – status filtering', () => {
    it('should return all items when no status filter', async () => {
      (prisma.quality_losses.findMany as any).mockResolvedValue([]);
      (prisma.quality_losses.count as any).mockResolvedValue(0);

      const result = await QualityLossService.getAllLosses({});

      expect(result.items).toEqual([]);
      expect(result.total).toBe(0);
    });

    it('should filter by "Pending" status', async () => {
      (prisma.quality_losses.findMany as any).mockResolvedValue([
        {
          id: '1',
          lossId: 'L1',
          occurDate: new Date('2024-01-01'),
          amount: '100',
          actualClaim: '0',
          respDept: 'DeptA',
          type: 'Material',
          status: 'Pending',
          isDeleted: false,
        },
        {
          id: '2',
          lossId: 'L2',
          occurDate: new Date('2024-01-02'),
          amount: '200',
          actualClaim: '0',
          respDept: 'DeptB',
          type: 'Labor',
          status: 'Confirmed',
          isDeleted: false,
        },
      ]);
      (prisma.quality_losses.count as any).mockResolvedValue(2);

      const result = await QualityLossService.getAllLosses({
        status: 'Pending',
      });

      expect(result.items).toHaveLength(1);
      expect(result.items[0].status).toBe('Pending');
    });

    it('should handle case-insensitive status "pending"', async () => {
      (prisma.quality_losses.findMany as any).mockResolvedValue([
        {
          id: '1',
          lossId: 'L1',
          occurDate: new Date('2024-01-01'),
          amount: '50',
          actualClaim: '10',
          respDept: 'Dept',
          type: 'Test',
          status: 'pending',
          isDeleted: false,
        },
      ]);
      (prisma.quality_losses.count as any).mockResolvedValue(1);

      const result = await QualityLossService.getAllLosses({
        status: 'pending',
      });

      expect(result.items).toHaveLength(1);
    });

    it('should return empty for invalid status (FIXED: no longer maps to Pending)', async () => {
      (prisma.quality_losses.findMany as any).mockResolvedValue([
        {
          id: '1',
          lossId: 'L1',
          occurDate: new Date('2024-01-01'),
          amount: '100',
          actualClaim: '0',
          respDept: 'Dept',
          type: 'Test',
          status: 'Pending',
          isDeleted: false,
        },
      ]);
      (prisma.quality_losses.count as any).mockResolvedValue(1);

      const result = await QualityLossService.getAllLosses({
        status: 'INVALID_STATUS_XYZ',
      });

      expect(result.items).toHaveLength(0);
    });
  });

  // ─── getAllLosses: pagination edge cases ───
  describe('getAllLosses – pagination edge cases', () => {
    it('should default page=1 pageSize=20 when not provided', async () => {
      (prisma.quality_losses.findMany as any).mockResolvedValue(
        makeManualRecords(50),
      );
      (prisma.quality_losses.count as any).mockResolvedValue(50);

      const result = await QualityLossService.getAllLosses({});

      expect(result.items.length).toBeLessThanOrEqual(20);
    });

    it('should clamp page=0 to page=1', async () => {
      (prisma.quality_losses.findMany as any).mockResolvedValue(
        makeManualRecords(5),
      );
      (prisma.quality_losses.count as any).mockResolvedValue(5);

      const result = await QualityLossService.getAllLosses({
        page: 0,
        pageSize: 10,
      });

      expect(result.items.length).toBeGreaterThan(0);
    });

    it('should clamp negative page to page=1', async () => {
      (prisma.quality_losses.findMany as any).mockResolvedValue(
        makeManualRecords(5),
      );
      (prisma.quality_losses.count as any).mockResolvedValue(5);

      const result = await QualityLossService.getAllLosses({
        page: -1,
        pageSize: 10,
      });

      expect(result.items.length).toBeGreaterThan(0);
    });

    it('clamps pageSize=0 to 1 instead of defaulting to 20', async () => {
      (prisma.quality_losses.findMany as any).mockResolvedValue(
        makeManualRecords(30),
      );
      (prisma.quality_losses.count as any).mockResolvedValue(30);

      const result = await QualityLossService.getAllLosses({
        page: 1,
        pageSize: 0,
      });

      expect(result.items.length).toBe(1);
    });

    it('should clamp pageSize=999999 to pageSize=100', async () => {
      (prisma.quality_losses.findMany as any).mockResolvedValue(
        makeManualRecords(50),
      );
      (prisma.quality_losses.count as any).mockResolvedValue(50);

      const result = await QualityLossService.getAllLosses({
        page: 1,
        pageSize: 999_999,
      });

      expect(result.items.length).toBeLessThanOrEqual(100);
    });

    it('should handle page beyond data range → empty items', async () => {
      (prisma.quality_losses.findMany as any).mockResolvedValue([]);
      (prisma.quality_losses.count as any).mockResolvedValue(5);

      const result = await QualityLossService.getAllLosses({
        page: 999,
        pageSize: 10,
      });

      expect(result.items).toEqual([]);
    });

    it('should handle string page/pageSize (coercion)', async () => {
      (prisma.quality_losses.findMany as any).mockResolvedValue(
        makeManualRecords(10),
      );
      (prisma.quality_losses.count as any).mockResolvedValue(10);

      const result = await QualityLossService.getAllLosses({
        page: '2' as any,
        pageSize: '5' as any,
      });

      expect(result.items.length).toBeLessThanOrEqual(5);
    });
  });

  // ─── getAllLosses: amount validation ───
  describe('getAllLosses – amount validation', () => {
    it('should filter out manual records with amount <= 0', async () => {
      (prisma.quality_losses.findMany as any).mockResolvedValue([
        {
          id: '1',
          lossId: 'L1',
          occurDate: new Date('2024-01-01'),
          amount: 0,
          actualClaim: 0,
          respDept: 'Dept',
          type: 'Material',
          status: 'Pending',
          isDeleted: false,
        },
        {
          id: '2',
          lossId: 'L2',
          occurDate: new Date('2024-01-02'),
          amount: -100,
          actualClaim: 0,
          respDept: 'Dept',
          type: 'Material',
          status: 'Pending',
          isDeleted: false,
        },
        {
          id: '3',
          lossId: 'L3',
          occurDate: new Date('2024-01-03'),
          amount: 100,
          actualClaim: 0,
          respDept: 'Dept',
          type: 'Material',
          status: 'Pending',
          isDeleted: false,
        },
      ]);
      (prisma.quality_losses.count as any).mockResolvedValue(3);

      const result = await QualityLossService.getAllLosses({});

      expect(result.items).toHaveLength(1);
      expect(result.items[0].amount).toBe(100);
    });

    it('should handle string amount "abc" → treated as 0, filtered out', async () => {
      (prisma.quality_losses.findMany as any).mockResolvedValue([
        {
          id: '1',
          lossId: 'L1',
          occurDate: new Date('2024-01-01'),
          amount: 'abc',
          actualClaim: '0',
          respDept: 'Dept',
          type: 'Material',
          status: 'Pending',
          isDeleted: false,
        },
      ]);
      (prisma.quality_losses.count as any).mockResolvedValue(1);

      const result = await QualityLossService.getAllLosses({});

      expect(result.items).toHaveLength(0);
    });

    it('should handle null amount → filtered out', async () => {
      (prisma.quality_losses.findMany as any).mockResolvedValue([
        {
          id: '1',
          lossId: 'L1',
          occurDate: new Date('2024-01-01'),
          amount: null,
          actualClaim: null,
          respDept: 'Dept',
          type: 'Material',
          status: 'Pending',
          isDeleted: false,
        },
      ]);
      (prisma.quality_losses.count as any).mockResolvedValue(1);

      const result = await QualityLossService.getAllLosses({});

      expect(result.items).toHaveLength(0);
    });

    it('should handle very large amount', async () => {
      (prisma.quality_losses.findMany as any).mockResolvedValue([
        {
          id: '1',
          lossId: 'L1',
          occurDate: new Date('2024-01-01'),
          amount: '999999999999.99',
          actualClaim: '0',
          respDept: 'Dept',
          type: 'Material',
          status: 'Pending',
          isDeleted: false,
        },
      ]);
      (prisma.quality_losses.count as any).mockResolvedValue(1);

      const result = await QualityLossService.getAllLosses({});

      expect(result.items).toHaveLength(1);
      expect(result.items[0].amount).toBe(999_999_999_999.99);
    });
  });

  // ─── getAllLosses: loss source filtering ───
  describe('getAllLosses – loss source filtering', () => {
    it('should route to Manual source when lossSource=Manual', async () => {
      (prisma.quality_losses.findMany as any).mockResolvedValue([
        {
          id: '1',
          lossId: 'L1',
          occurDate: new Date('2024-01-01'),
          amount: '100',
          actualClaim: '0',
          respDept: 'Dept',
          type: 'Material',
          status: 'Pending',
          isDeleted: false,
        },
      ]);
      (prisma.quality_losses.count as any).mockResolvedValue(1);

      const result = await QualityLossService.getAllLosses({
        lossSource: 'Manual',
      });

      expect(result.items).toHaveLength(1);
    });

    it('should route to Internal source when lossSource=Internal', async () => {
      (InspectionService.getLossRecordsForAggregation as any).mockResolvedValue(
        [],
      );
      (
        InspectionService.countLossRecordsForAggregation as any
      ).mockResolvedValue(0);

      const result = await QualityLossService.getAllLosses({
        lossSource: 'Internal',
      });

      expect(result.items).toEqual([]);
      expect(InspectionService.getLossRecordsForAggregation).toHaveBeenCalled();
    });

    it('should route to External source when lossSource=External', async () => {
      (AfterSalesService.getLossRecordsForAggregation as any).mockResolvedValue(
        [],
      );
      (
        AfterSalesService.countLossRecordsForAggregation as any
      ).mockResolvedValue(0);

      const result = await QualityLossService.getAllLosses({
        lossSource: 'External',
      });

      expect(result.items).toEqual([]);
      expect(AfterSalesService.getLossRecordsForAggregation).toHaveBeenCalled();
    });

    it('should route to Commissioning source when lossSource=Commissioning', async () => {
      (
        VehicleCommissioningService.getLossRecordsForAggregation as any
      ).mockResolvedValue([]);
      (
        VehicleCommissioningService.countLossRecordsForAggregation as any
      ).mockResolvedValue(0);

      const result = await QualityLossService.getAllLosses({
        lossSource: 'Commissioning',
      });

      expect(result.items).toEqual([]);
      expect(
        VehicleCommissioningService.getLossRecordsForAggregation,
      ).toHaveBeenCalled();
    });

    it('should merge all sources when lossSource not provided', async () => {
      (prisma.quality_losses.findMany as any).mockResolvedValue([]);
      (prisma.quality_losses.count as any).mockResolvedValue(0);

      const result = await QualityLossService.getAllLosses({});

      expect(result.items).toEqual([]);
    });
  });

  // ─── getAllLosses: empty / edge data ───
  describe('getAllLosses – empty and edge data', () => {
    it('should return empty items for empty manual records', async () => {
      (prisma.quality_losses.findMany as any).mockResolvedValue([]);
      (prisma.quality_losses.count as any).mockResolvedValue(0);

      const result = await QualityLossService.getAllLosses({});

      expect(result.items).toEqual([]);
      expect(result.total).toBe(0);
    });

    it('should handle null/undefined respDept gracefully', async () => {
      (prisma.quality_losses.findMany as any).mockResolvedValue([
        {
          id: '1',
          lossId: 'L1',
          occurDate: new Date('2024-01-01'),
          amount: '100',
          actualClaim: '0',
          respDept: null,
          type: 'Material',
          status: 'Pending',
          isDeleted: false,
        },
      ]);
      (prisma.quality_losses.count as any).mockResolvedValue(1);

      const result = await QualityLossService.getAllLosses({});

      expect(result.items).toHaveLength(1);
      expect(result.items[0].responsibleDepartment).toBeDefined();
    });

    it('should handle empty respDept string', async () => {
      (prisma.quality_losses.findMany as any).mockResolvedValue([
        {
          id: '1',
          lossId: 'L1',
          occurDate: new Date('2024-01-01'),
          amount: '100',
          actualClaim: '0',
          respDept: '',
          type: 'Material',
          status: 'Pending',
          isDeleted: false,
        },
      ]);
      (prisma.quality_losses.count as any).mockResolvedValue(1);

      const result = await QualityLossService.getAllLosses({});

      expect(result.items).toHaveLength(1);
    });
  });

  // ─── getDashboardSummary ───
  describe('getDashboardSummary', () => {
    it('should return summary for empty list', async () => {
      (prisma.quality_losses.findMany as any).mockResolvedValue([]);
      (prisma.quality_losses.count as any).mockResolvedValue(0);
      (
        VehicleCommissioningService.getLossRecordsForAggregation as any
      ).mockResolvedValue([]);

      (QualityLossSummaryService.getDashboardSummary as any).mockReturnValue({
        kpi: {
          totalAmount: 0,
          totalClaim: 0,
          recoveryRate: 0,
          displayRate: '0%',
          pendingAmount: 0,
        },
        years: [new Date().getFullYear()],
      });

      const result = await QualityLossService.getDashboardSummary({});

      expect(result.kpi.totalAmount).toBe(0);
    });

    it('should delegate to QualityLossSummaryService', async () => {
      (prisma.quality_losses.findMany as any).mockResolvedValue([]);
      (prisma.quality_losses.count as any).mockResolvedValue(0);
      (
        VehicleCommissioningService.getLossRecordsForAggregation as any
      ).mockResolvedValue([]);

      (QualityLossSummaryService.getDashboardSummary as any).mockReturnValue({
        kpi: {
          totalAmount: 500,
          totalClaim: 100,
          recoveryRate: 20,
          displayRate: '20%',
          pendingAmount: 400,
        },
        years: [2024],
      });

      const result = await QualityLossService.getDashboardSummary({});

      expect(QualityLossSummaryService.getDashboardSummary).toHaveBeenCalled();
      expect(result.kpi.totalAmount).toBe(500);
    });
  });

  // ─── getYearlyCharts ───
  describe('getYearlyCharts', () => {
    it('should delegate to QualityLossSummaryService.getYearlyCharts', async () => {
      (prisma.quality_losses.findMany as any).mockResolvedValue([]);
      (prisma.quality_losses.count as any).mockResolvedValue(0);
      (
        VehicleCommissioningService.getLossRecordsForAggregation as any
      ).mockResolvedValue([]);

      (QualityLossSummaryService.getYearlyCharts as any).mockReturnValue({
        deptDistribution: [],
        trend: [],
      });

      const result = await QualityLossService.getYearlyCharts({});

      expect(QualityLossSummaryService.getYearlyCharts).toHaveBeenCalled();
      expect(result.deptDistribution).toEqual([]);
    });

    it('should pass filters through to summary service', async () => {
      (prisma.quality_losses.findMany as any).mockResolvedValue([]);
      (prisma.quality_losses.count as any).mockResolvedValue(0);
      (
        VehicleCommissioningService.getLossRecordsForAggregation as any
      ).mockResolvedValue([]);

      (QualityLossSummaryService.getYearlyCharts as any).mockReturnValue({
        deptDistribution: [],
        trend: [],
      });

      await QualityLossService.getYearlyCharts({ year: 2023 });

      expect(QualityLossSummaryService.getYearlyCharts).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ year: 2023 }),
      );
    });
  });

  // ─── getTrendData ───
  describe('getTrendData', () => {
    it('should return 12 monthly entries for month granularity', async () => {
      (prisma.$queryRaw as any).mockResolvedValue([]);
      (InspectionService.getQualityLossTrendRows as any).mockResolvedValue([]);
      (AfterSalesService.getQualityLossTrendRows as any).mockResolvedValue([]);
      (
        VehicleCommissioningService.getQualityLossTrendRows as any
      ).mockResolvedValue([]);

      const result = await QualityLossService.getTrendData('month');

      expect(result.trend).toHaveLength(12);
      result.trend.forEach((item) => {
        expect(item.period).toBeDefined();
        expect(item.totalAmount).toBeDefined();
      });
    });

    it('should return monthly zero buckets when all sources fail', async () => {
      (prisma.$queryRaw as any).mockRejectedValue(new Error('DB error'));
      (InspectionService.getQualityLossTrendRows as any).mockRejectedValue(
        new Error('DB error'),
      );
      (AfterSalesService.getQualityLossTrendRows as any).mockRejectedValue(
        new Error('DB error'),
      );
      (
        VehicleCommissioningService.getQualityLossTrendRows as any
      ).mockRejectedValue(new Error('DB error'));

      const result = await QualityLossService.getTrendData('month');

      expect(result.trend).toHaveLength(12);
      expect(result.trend.every((item) => item.totalAmount === 0)).toBe(true);
    });

    it('keeps healthy trend sources when one source fails', async () => {
      (prisma.$queryRaw as any).mockResolvedValue([
        { p: 1, a: 100 },
        { p: 3, a: 200 },
      ]);
      (InspectionService.getQualityLossTrendRows as any).mockRejectedValue(
        new Error('Partial fail'),
      );
      (AfterSalesService.getQualityLossTrendRows as any).mockResolvedValue([
        { p: 1, a: 50 },
      ]);
      (
        VehicleCommissioningService.getQualityLossTrendRows as any
      ).mockResolvedValue([]);

      const result = await QualityLossService.getTrendData('month');

      expect(result.trend).toHaveLength(12);
      expect(result.trend[0]).toMatchObject({
        externalAmount: 50,
        manualAmount: 100,
        totalAmount: 150,
      });
    });

    it('should return weekly entries when data exists', async () => {
      (prisma.$queryRaw as any).mockResolvedValue([
        { p: 1, a: 100 },
        { p: 5, a: 200 },
      ]);
      (InspectionService.getQualityLossTrendRows as any).mockResolvedValue([]);
      (AfterSalesService.getQualityLossTrendRows as any).mockResolvedValue([]);
      (
        VehicleCommissioningService.getQualityLossTrendRows as any
      ).mockResolvedValue([]);

      const result = await QualityLossService.getTrendData('week');

      expect(result.trend.length).toBeGreaterThan(0);
    });

    it('should return empty weekly trend when all sources empty', async () => {
      (prisma.$queryRaw as any).mockResolvedValue([]);
      (InspectionService.getQualityLossTrendRows as any).mockResolvedValue([]);
      (AfterSalesService.getQualityLossTrendRows as any).mockResolvedValue([]);
      (
        VehicleCommissioningService.getQualityLossTrendRows as any
      ).mockResolvedValue([]);

      const result = await QualityLossService.getTrendData('week');

      expect(result.trend).toEqual([]);
    });
  });

  // ─── deleteRecord / batchDelete ───
  describe('deleteRecord', () => {
    it('should delegate to QualityLossRecordMaintenanceService', async () => {
      (
        QualityLossRecordMaintenanceService.deleteRecord as any
      ).mockResolvedValue(undefined);

      await QualityLossService.deleteRecord('test-id', 'user-1');

      expect(
        QualityLossRecordMaintenanceService.deleteRecord,
      ).toHaveBeenCalledWith('test-id', 'user-1');
    });
  });

  describe('batchDelete', () => {
    it('should delegate to QualityLossRecordMaintenanceService', async () => {
      (
        QualityLossRecordMaintenanceService.batchDelete as any
      ).mockResolvedValue({ count: 2 });

      const result = await QualityLossService.batchDelete(
        ['id1', 'id2'],
        'user-1',
      );

      expect(
        QualityLossRecordMaintenanceService.batchDelete,
      ).toHaveBeenCalledWith(['id1', 'id2'], 'user-1');
      expect(result.count).toBe(2);
    });

    it('should handle empty ids array', async () => {
      (
        QualityLossRecordMaintenanceService.batchDelete as any
      ).mockResolvedValue({ count: 0 });

      const result = await QualityLossService.batchDelete([], 'user-1');

      expect(result.count).toBe(0);
    });
  });

  // ─── getDrillDown ───
  describe('getDrillDown', () => {
    it('should delegate with correct params', async () => {
      const start = new Date('2024-01-01');
      const end = new Date('2024-12-31');
      (
        QualityLossRecordMaintenanceService.getDrillDown as any
      ).mockResolvedValue([]);

      const result = await QualityLossService.getDrillDown(start, end);

      expect(
        QualityLossRecordMaintenanceService.getDrillDown,
      ).toHaveBeenCalledWith(start, end);
      expect(result).toEqual([]);
    });
  });

  // ─── reporting delegation ───
  describe('reporting methods', () => {
    it('getStatsForDashboard delegates correctly', async () => {
      const params = { weekStart: new Date(), yearStart: new Date() };
      (
        QualityLossReportingService.getStatsForDashboard as any
      ).mockResolvedValue({});

      await QualityLossService.getStatsForDashboard(params);

      expect(
        QualityLossReportingService.getStatsForDashboard,
      ).toHaveBeenCalledWith(params);
    });

    it('getWeeklyTrackingIssues delegates correctly', async () => {
      const params = {
        closedStatuses: ['CLOSED'],
        end: new Date(),
        start: new Date(),
        take: 10,
      };
      (
        QualityLossReportingService.getWeeklyTrackingIssues as any
      ).mockResolvedValue([]);

      await QualityLossService.getWeeklyTrackingIssues(params);

      expect(
        QualityLossReportingService.getWeeklyTrackingIssues,
      ).toHaveBeenCalledWith(params);
    });

    it('getReportPeriodMetrics delegates correctly', async () => {
      const params = { end: new Date(), start: new Date() };
      (
        QualityLossReportingService.getReportPeriodMetrics as any
      ).mockResolvedValue({});

      await QualityLossService.getReportPeriodMetrics(params);

      expect(
        QualityLossReportingService.getReportPeriodMetrics,
      ).toHaveBeenCalledWith(params);
    });
  });

  // ─── route update delegation ───
  describe('updateByRouteId', () => {
    it('should delegate to QualityLossRouteUpdateService', async () => {
      const { QualityLossRouteUpdateService } = await import(
        '~/modules/quality-loss/quality-loss-route-update.service'
      );
      (QualityLossRouteUpdateService.updateByRouteId as any).mockResolvedValue(
        {},
      );

      await QualityLossService.updateByRouteId({
        body: { status: 'Confirmed' },
        id: 'route-1',
        userId: 'user-1',
      });

      expect(
        QualityLossRouteUpdateService.updateByRouteId,
      ).toHaveBeenCalledWith({
        body: { status: 'Confirmed' },
        id: 'route-1',
        userId: 'user-1',
      });
    });
  });

  // ─── Bug documentation: known issues ───
  describe('known bugs / risky behaviors', () => {
    it('fIXED: invalid status now returns empty instead of matching Pending', async () => {
      (prisma.quality_losses.findMany as any).mockResolvedValue([
        {
          id: '1',
          lossId: 'L1',
          occurDate: new Date('2024-01-01'),
          amount: '100',
          actualClaim: '0',
          respDept: 'Dept',
          type: 'Material',
          status: 'Pending',
          isDeleted: false,
        },
      ]);
      (prisma.quality_losses.count as any).mockResolvedValue(1);

      const result = await QualityLossService.getAllLosses({
        status: 'totally_bogus_status',
      });

      expect(result.items.length).toBe(0);
    });

    it('clamps pageSize=0 to 1 instead of defaulting to 20', async () => {
      (prisma.quality_losses.findMany as any).mockResolvedValue(
        makeManualRecords(30),
      );
      (prisma.quality_losses.count as any).mockResolvedValue(30);

      const result = await QualityLossService.getAllLosses({
        page: 1,
        pageSize: 0,
      });

      expect(result.items.length).toBe(1);
    });

    it('negative pageSize correctly clamped to 1 (not buggy)', async () => {
      (prisma.quality_losses.findMany as any).mockResolvedValue(
        makeManualRecords(30),
      );
      (prisma.quality_losses.count as any).mockResolvedValue(30);

      const result = await QualityLossService.getAllLosses({
        page: 1,
        pageSize: -1,
      });

      expect(result.items.length).toBe(1);
    });

    it('preserves healthy trend sources when one source times out', async () => {
      (prisma.$queryRaw as any).mockResolvedValue([{ p: 1, a: 500 }]);
      (InspectionService.getQualityLossTrendRows as any).mockResolvedValue([
        { p: 1, a: 300 },
      ]);
      (AfterSalesService.getQualityLossTrendRows as any).mockResolvedValue([
        { p: 1, a: 200 },
      ]);
      (
        VehicleCommissioningService.getQualityLossTrendRows as any
      ).mockRejectedValue(new Error('Network timeout'));

      const result = await QualityLossService.getTrendData('month');

      expect(result.trend).toHaveLength(12);
      expect(result.trend[0]).toMatchObject({
        externalAmount: 200,
        internalAmount: 300,
        manualAmount: 500,
        totalAmount: 1000,
      });
    });
  });
});
