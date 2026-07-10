import { beforeEach, describe, expect, it, vi } from 'vitest';
import { InspectionIssueStatsService } from '~/modules/inspection/inspection-issue-stats.service';
import prisma from '~/utils/prisma';

vi.mock('~/utils/prisma', () => ({
  default: {
    quality_records: {
      aggregate: vi.fn(),
      count: vi.fn(),
      groupBy: vi.fn(),
      findMany: vi.fn(),
    },
    $queryRaw: vi.fn(),
  },
}));

vi.mock('~/utils/canonical-master-data', () => ({
  MasterDataGovernanceKernel: {
    resolveCanonicalNamesByIds: vi.fn().mockResolvedValue(new Map()),
  },
}));

vi.mock('~/modules/inspection/inspection-issue', () => ({
  buildInspectionIssueDateRange: vi.fn().mockReturnValue({
    start: new Date('2024-01-01'),
    end: new Date('2025-01-01'),
  }),
}));

vi.mock('@qgs/shared', async () => {
  const actual =
    await vi.importActual<typeof import('@qgs/shared')>('@qgs/shared');
  return {
    ...actual,
    formatDate: vi.fn((d: Date) => d.toISOString().slice(0, 10)),
  };
});

function mockIssueGroupBy(
  options: {
    typeRows?: Array<{ _count: { id: number }; defectType: null | string }>;
  } = {},
) {
  (prisma.quality_records.groupBy as any).mockResolvedValue(
    options.typeRows || [],
  );
}

describe('inspectionIssueStatsService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIssueGroupBy();
    (prisma.$queryRaw as any).mockResolvedValue([]);
  });

  describe('getIssueStats', () => {
    it('should return correct stats with zero records', async () => {
      (prisma.quality_records.aggregate as any).mockResolvedValue({
        _count: { id: 0 },
        _sum: { lossAmount: null },
      });
      (prisma.quality_records.count as any).mockResolvedValue(0);
      (prisma.quality_records.groupBy as any).mockResolvedValue([]);
      (prisma.$queryRaw as any).mockResolvedValue([]);

      const stats = await InspectionIssueStatsService.getIssueStats({
        year: 2024,
      });

      expect(stats.totalCount).toBe(0);
      expect(stats.openCount).toBe(0);
      expect(stats.closedCount).toBe(0);
      expect(stats.totalLoss).toBe(0);
      expect(stats.closedRate).toBe(0);
      expect(stats.pieData).toEqual([]);
    });

    it('should calculate closed rate correctly', async () => {
      (prisma.quality_records.aggregate as any).mockResolvedValue({
        _count: { id: 10 },
        _sum: { lossAmount: 500 },
      });
      (prisma.quality_records.count as any).mockResolvedValue(3);
      (prisma.quality_records.groupBy as any).mockResolvedValue([]);
      (prisma.$queryRaw as any).mockResolvedValue([]);

      const stats = await InspectionIssueStatsService.getIssueStats({
        year: 2024,
      });

      expect(stats.totalCount).toBe(10);
      expect(stats.closedCount).toBe(3);
      expect(stats.openCount).toBe(7);
      expect(stats.totalLoss).toBe(500);
      expect(stats.closedRate).toBe(30);
    });

    it('should build pie data from groupBy results', async () => {
      (prisma.quality_records.aggregate as any).mockResolvedValue({
        _count: { id: 3 },
        _sum: { lossAmount: 0 },
      });
      (prisma.quality_records.count as any).mockResolvedValue(0);
      mockIssueGroupBy({
        typeRows: [
          { defectType: '焊接缺陷', _count: { id: 2 } },
          { defectType: null, _count: { id: 1 } },
        ],
      });
      (prisma.$queryRaw as any).mockResolvedValue([]);

      const stats = await InspectionIssueStatsService.getIssueStats({
        year: 2024,
      });

      expect(stats.pieData).toContainEqual({
        name: '焊接缺陷',
        value: 2,
      });
      expect(stats.pieData).toContainEqual({
        name: 'Unknown',
        value: 1,
      });
    });

    it('should build pareto with cumulative percentages', async () => {
      (prisma.quality_records.aggregate as any).mockResolvedValue({
        _count: { id: 4 },
        _sum: { lossAmount: 0 },
      });
      (prisma.quality_records.count as any).mockResolvedValue(0);
      mockIssueGroupBy({
        typeRows: [
          { defectType: 'A', _count: { id: 3 } },
          { defectType: 'B', _count: { id: 1 } },
        ],
      });
      (prisma.$queryRaw as any).mockResolvedValue([]);

      const stats = await InspectionIssueStatsService.getIssueStats({
        year: 2024,
      });

      expect(stats.pareto[0].percent).toBe(75);
      expect(stats.pareto[0].cumulativePercent).toBe(75);
      expect(stats.pareto[1].percent).toBe(25);
      expect(stats.pareto[1].cumulativePercent).toBe(100);
    });

    it('should build trend data for month mode', async () => {
      (prisma.quality_records.aggregate as any).mockResolvedValue({
        _count: { id: 0 },
        _sum: { lossAmount: null },
      });
      (prisma.quality_records.count as any).mockResolvedValue(0);
      (prisma.quality_records.groupBy as any).mockResolvedValue([]);
      (prisma.$queryRaw as any).mockResolvedValue([
        { amount: 100, month: 1 },
        { amount: 200, month: 3 },
      ]);

      const stats = await InspectionIssueStatsService.getIssueStats({
        year: 2024,
      });

      expect(stats.trendData).toHaveLength(12);
      expect(stats.trendData[0]).toEqual({ period: '2024-01', value: 100 });
      expect(stats.trendData[2]).toEqual({ period: '2024-03', value: 200 });
      expect(stats.trendData[1]).toEqual({ period: '2024-02', value: 0 });
    });

    it('uses the creator-only scope for ordinary-user stats', async () => {
      (prisma.quality_records.aggregate as any).mockResolvedValue({
        _count: { id: 0 },
        _sum: { lossAmount: null },
      });
      (prisma.quality_records.count as any).mockResolvedValue(0);

      await InspectionIssueStatsService.getIssueStats({
        userContext: { roles: ['inspector'], userId: 'user-1' },
        year: 2024,
      });

      expect(prisma.quality_records.aggregate).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ createdBy: 'user-1' }),
        }),
      );
      const trendQuery = (prisma.$queryRaw as any).mock.calls[0][0];
      expect(trendQuery.values).toContain('user-1');
    });

    it('does not apply a creator filter to system-admin stats', async () => {
      (prisma.quality_records.aggregate as any).mockResolvedValue({
        _count: { id: 0 },
        _sum: { lossAmount: null },
      });
      (prisma.quality_records.count as any).mockResolvedValue(0);

      await InspectionIssueStatsService.getIssueStats({
        userContext: { roles: ['system_admin'], userId: 'admin-1' },
        year: 2024,
      });

      const where = (prisma.quality_records.aggregate as any).mock.calls[0][0]
        .where;
      expect(where.createdBy).toBeUndefined();
    });
  });

  describe('buildIssueTrendData', () => {
    it('should return monthly trend for default mode', async () => {
      (prisma.$queryRaw as any).mockResolvedValue([{ amount: 50, month: 6 }]);

      const result = await InspectionIssueStatsService.buildIssueTrendData({
        currentYear: 2024,
        end: new Date('2024-12-31'),
        start: new Date('2024-01-01'),
        where: { isDeleted: false },
      });

      expect(result).toHaveLength(12);
      expect(result[5]).toEqual({ period: '2024-06', value: 50 });
    });

    it('should return daily trend for month mode', async () => {
      (prisma.$queryRaw as any).mockResolvedValue([
        { amount: 15, day: '2024-03-01' },
        { amount: 20, day: '2024-03-02' },
      ]);

      const result = await InspectionIssueStatsService.buildIssueTrendData({
        currentYear: 2024,
        dateMode: 'month',
        end: new Date('2024-04-01'),
        start: new Date('2024-03-01'),
        where: { createdBy: 'user-1', isDeleted: false },
      });

      expect(result).toHaveLength(31);
      expect(result[0]).toEqual({ period: '2024-03-01', value: 15 });
      expect(result[1]).toEqual({ period: '2024-03-02', value: 20 });
    });

    it('should return daily trend for week mode', async () => {
      (prisma.$queryRaw as any).mockResolvedValue([
        { amount: 5, day: new Date('2024-03-04') },
      ]);

      const result = await InspectionIssueStatsService.buildIssueTrendData({
        currentYear: 2024,
        dateMode: 'week',
        end: new Date('2024-03-11'),
        start: new Date('2024-03-04'),
        where: { createdBy: 'user-1', isDeleted: false },
      });

      expect(result).toHaveLength(7);
      expect(result[0]).toEqual({ period: '2024-03-04', value: 5 });
    });
  });

  describe('getIssueChartAggregation', () => {
    it('should aggregate by defectType dimension with count metric', async () => {
      (prisma.quality_records.findMany as any).mockResolvedValue([
        {
          date: new Date('2024-01-15'),
          defectSubtypeId: null,
          defectTypeId: null,
          defectSubtype: '气孔',
          defectType: '焊接缺陷',
          division: '车辆',
          isClaim: false,
          lossAmount: 100,
          projectName: 'P1',
          quantity: 5,
          responsibleDepartment: '质量部',
          severity: 'Major',
          status: 'OPEN',
          supplierName: '供应商A',
        },
        {
          date: new Date('2024-01-20'),
          defectSubtypeId: null,
          defectTypeId: null,
          defectSubtype: '裂纹',
          defectType: '焊接缺陷',
          division: '车辆',
          isClaim: true,
          lossAmount: 200,
          projectName: 'P1',
          quantity: 3,
          responsibleDepartment: '生产部',
          severity: 'Critical',
          status: 'CLOSED',
          supplierName: '供应商B',
        },
      ]);

      const result = await InspectionIssueStatsService.getIssueChartAggregation(
        {
          dimension: 'defectType',
          metric: 'count',
          year: 2024,
        },
      );

      expect(result).toEqual([{ name: '焊接缺陷', value: 2 }]);
    });

    it('should aggregate by status dimension', async () => {
      (prisma.quality_records.findMany as any).mockResolvedValue([
        {
          date: new Date('2024-01-15'),
          defectSubtypeId: null,
          defectTypeId: null,
          defectSubtype: '',
          defectType: '',
          division: '',
          isClaim: false,
          lossAmount: 0,
          projectName: '',
          quantity: 0,
          responsibleDepartment: '',
          severity: '',
          status: 'OPEN',
          supplierName: '',
        },
      ]);

      const result = await InspectionIssueStatsService.getIssueChartAggregation(
        {
          dimension: 'status',
          metric: 'count',
          year: 2024,
        },
      );

      expect(result).toEqual([{ name: 'OPEN', value: 1 }]);
    });

    it('should aggregate by claim dimension', async () => {
      (prisma.quality_records.findMany as any).mockResolvedValue([
        {
          date: new Date('2024-01-15'),
          defectSubtypeId: null,
          defectTypeId: null,
          defectSubtype: '',
          defectType: '',
          division: '',
          isClaim: true,
          lossAmount: 0,
          projectName: '',
          quantity: 0,
          responsibleDepartment: '',
          severity: '',
          status: '',
          supplierName: '',
        },
      ]);

      const result = await InspectionIssueStatsService.getIssueChartAggregation(
        {
          dimension: 'claim',
          metric: 'count',
          year: 2024,
        },
      );

      expect(result).toEqual([{ name: 'Yes', value: 1 }]);
    });

    it('should use lossAmount metric', async () => {
      (prisma.quality_records.findMany as any).mockResolvedValue([
        {
          date: new Date('2024-01-15'),
          defectSubtypeId: null,
          defectTypeId: null,
          defectSubtype: '',
          defectType: 'A',
          division: '',
          isClaim: false,
          lossAmount: 150,
          projectName: '',
          quantity: 0,
          responsibleDepartment: '',
          severity: '',
          status: '',
          supplierName: '',
        },
      ]);

      const result = await InspectionIssueStatsService.getIssueChartAggregation(
        {
          dimension: 'defectType',
          metric: 'lossAmount',
          year: 2024,
        },
      );

      expect(result).toEqual([{ name: 'A', value: 150 }]);
    });

    it('should use quantity metric', async () => {
      (prisma.quality_records.findMany as any).mockResolvedValue([
        {
          date: new Date('2024-01-15'),
          defectSubtypeId: null,
          defectTypeId: null,
          defectSubtype: '',
          defectType: 'B',
          division: '',
          isClaim: false,
          lossAmount: 0,
          projectName: '',
          quantity: 10,
          responsibleDepartment: '',
          severity: '',
          status: '',
          supplierName: '',
        },
      ]);

      const result = await InspectionIssueStatsService.getIssueChartAggregation(
        {
          dimension: 'defectType',
          metric: 'quantity',
          year: 2024,
        },
      );

      expect(result).toEqual([{ name: 'B', value: 10 }]);
    });

    it('should limit results by top parameter', async () => {
      const rows = Array.from({ length: 20 }, (_, i) => ({
        date: new Date('2024-01-15'),
        defectSubtypeId: null,
        defectTypeId: null,
        defectSubtype: '',
        defectType: `Type-${i}`,
        division: '',
        isClaim: false,
        lossAmount: 0,
        projectName: '',
        quantity: 0,
        responsibleDepartment: '',
        severity: '',
        status: '',
        supplierName: '',
      }));
      (prisma.quality_records.findMany as any).mockResolvedValue(rows);

      const result = await InspectionIssueStatsService.getIssueChartAggregation(
        {
          dimension: 'defectType',
          metric: 'count',
          top: 5,
          year: 2024,
        },
      );

      expect(result).toHaveLength(5);
    });

    it('should use default top of 15', async () => {
      const rows = Array.from({ length: 20 }, (_, i) => ({
        date: new Date('2024-01-15'),
        defectSubtypeId: null,
        defectTypeId: null,
        defectSubtype: '',
        defectType: `Type-${i}`,
        division: '',
        isClaim: false,
        lossAmount: 0,
        projectName: '',
        quantity: 0,
        responsibleDepartment: '',
        severity: '',
        status: '',
        supplierName: '',
      }));
      (prisma.quality_records.findMany as any).mockResolvedValue(rows);

      const result = await InspectionIssueStatsService.getIssueChartAggregation(
        {
          dimension: 'defectType',
          metric: 'count',
          year: 2024,
        },
      );

      expect(result).toHaveLength(15);
    });

    it('should default to 未分类 for missing dimension values', async () => {
      (prisma.quality_records.findMany as any).mockResolvedValue([
        {
          date: new Date('2024-01-15'),
          defectSubtypeId: null,
          defectTypeId: null,
          defectSubtype: '',
          defectType: '',
          division: '',
          isClaim: false,
          lossAmount: 0,
          projectName: '',
          quantity: 0,
          responsibleDepartment: '',
          severity: '',
          status: '',
          supplierName: '',
        },
      ]);

      const result = await InspectionIssueStatsService.getIssueChartAggregation(
        {
          dimension: 'division',
          metric: 'count',
          year: 2024,
        },
      );

      expect(result).toEqual([{ name: '未分类', value: 1 }]);
    });
  });
});
