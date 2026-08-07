import { beforeEach, describe, expect, it, vi } from 'vitest';
import { InspectionIssueStatsService } from '~/modules/inspection/inspection-issue-stats.service';
import { QualityClassificationService } from '~/modules/quality-classification';
import { MasterDataGovernanceKernel } from '~/utils/canonical-master-data';
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

vi.mock('~/utils/canonical-master-data', async () => {
  const actual = await vi.importActual<
    typeof import('~/utils/canonical-master-data')
  >('~/utils/canonical-master-data');
  return {
    MasterDataGovernanceKernel: {
      ...actual.MasterDataGovernanceKernel,
      resolveCanonicalNamesByIds: vi.fn().mockResolvedValue(new Map()),
    },
  };
});

vi.mock('~/modules/quality-classification', () => ({
  QualityClassificationService: {
    resolveCategoryNamesByIds: vi.fn().mockResolvedValue(new Map()),
    resolveSubcategoryNamesByIds: vi.fn().mockResolvedValue(new Map()),
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
    typeRows?: Array<{
      _count: { id: number };
      defectCategoryId: null | string;
      defectType?: null | string;
    }>;
  } = {},
) {
  (prisma.quality_records.groupBy as any).mockResolvedValue(
    options.typeRows || [],
  );
}

describe('inspectionIssueStatsService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (
      QualityClassificationService.resolveCategoryNamesByIds as any
    ).mockResolvedValue(new Map());
    (
      QualityClassificationService.resolveSubcategoryNamesByIds as any
    ).mockResolvedValue(new Map());
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

    it('should group the default pie by canonical ID across name snapshots', async () => {
      (prisma.quality_records.aggregate as any).mockResolvedValue({
        _count: { id: 3 },
        _sum: { lossAmount: 0 },
      });
      (prisma.quality_records.count as any).mockResolvedValue(0);
      mockIssueGroupBy({
        typeRows: [
          {
            defectCategoryId: 'defect-1',
            defectType: 'Old Welding Defect',
            _count: { id: 1 },
          },
          {
            defectCategoryId: 'defect-1',
            defectType: 'Renamed Welding Defect',
            _count: { id: 1 },
          },
          {
            defectCategoryId: null,
            defectType: 'Legacy Machining Defect',
            _count: { id: 1 },
          },
        ],
      });
      (
        QualityClassificationService.resolveCategoryNamesByIds as any
      ).mockResolvedValue(new Map([['defect-1', '焊接缺陷']]));
      (prisma.$queryRaw as any).mockResolvedValue([]);

      const stats = await InspectionIssueStatsService.getIssueStats({
        year: 2024,
      });

      expect(stats.pieData).toContainEqual({
        id: 'defect-1',
        name: '焊接缺陷',
        resolutionStatus: 'RESOLVED',
        value: 2,
      });
      expect(stats.pieData).toContainEqual({
        id: null,
        name: '数据待治理：Legacy Machining Defect',
        rawName: 'Legacy Machining Defect',
        resolutionReason: 'MISSING_REQUIRED',
        resolutionStatus: 'MISSING',
        value: 1,
      });
      expect(prisma.quality_records.groupBy).toHaveBeenCalledWith(
        expect.objectContaining({ by: ['defectCategoryId', 'defectType'] }),
      );
    });

    it('should build pareto with cumulative percentages', async () => {
      (prisma.quality_records.aggregate as any).mockResolvedValue({
        _count: { id: 4 },
        _sum: { lossAmount: 0 },
      });
      (prisma.quality_records.count as any).mockResolvedValue(0);
      mockIssueGroupBy({
        typeRows: [
          { defectCategoryId: 'defect-a', _count: { id: 3 } },
          { defectCategoryId: 'defect-b', _count: { id: 1 } },
        ],
      });
      (
        QualityClassificationService.resolveCategoryNamesByIds as any
      ).mockResolvedValue(
        new Map([
          ['defect-a', 'A'],
          ['defect-b', 'B'],
        ]),
      );
      (prisma.$queryRaw as any).mockResolvedValue([]);

      const stats = await InspectionIssueStatsService.getIssueStats({
        year: 2024,
      });

      expect(stats.pareto[0].percent).toBe(75);
      expect(stats.pareto[0].cumulativePercent).toBe(75);
      expect(stats.pareto[1].percent).toBe(25);
      expect(stats.pareto[1].cumulativePercent).toBe(100);
    });

    it('should keep different canonical IDs separate when names match', async () => {
      (prisma.quality_records.aggregate as any).mockResolvedValue({
        _count: { id: 3 },
        _sum: { lossAmount: 0 },
      });
      (prisma.quality_records.count as any).mockResolvedValue(0);
      mockIssueGroupBy({
        typeRows: [
          { defectCategoryId: 'defect-a', _count: { id: 2 } },
          { defectCategoryId: 'defect-b', _count: { id: 1 } },
        ],
      });
      (
        QualityClassificationService.resolveCategoryNamesByIds as any
      ).mockResolvedValue(
        new Map([
          ['defect-a', 'Same name'],
          ['defect-b', 'Same name'],
        ]),
      );

      const stats = await InspectionIssueStatsService.getIssueStats({
        year: 2024,
      });

      expect(stats.pieData).toEqual([
        {
          id: 'defect-a',
          name: 'Same name',
          resolutionStatus: 'RESOLVED',
          value: 2,
        },
        {
          id: 'defect-b',
          name: 'Same name',
          resolutionStatus: 'RESOLVED',
          value: 1,
        },
      ]);
      expect(prisma.quality_records.groupBy).toHaveBeenCalledWith(
        expect.objectContaining({ by: ['defectCategoryId', 'defectType'] }),
      );
    });

    it('should expose missing and invalid canonical IDs without name fallback', async () => {
      (prisma.quality_records.aggregate as any).mockResolvedValue({
        _count: { id: 2 },
        _sum: { lossAmount: 0 },
      });
      (prisma.quality_records.count as any).mockResolvedValue(0);
      mockIssueGroupBy({
        typeRows: [
          { defectCategoryId: null, _count: { id: 1 } },
          { defectCategoryId: 'deleted-defect', _count: { id: 1 } },
        ],
      });

      const stats = await InspectionIssueStatsService.getIssueStats({
        year: 2024,
      });

      expect(stats.pieData).toEqual([
        {
          id: null,
          name: '数据待治理',
          resolutionReason: 'MISSING_REQUIRED',
          resolutionStatus: 'MISSING',
          value: 1,
        },
        {
          id: 'deleted-defect',
          name: '主数据已失效',
          resolutionReason: 'INVALID_REFERENCE',
          resolutionStatus: 'INVALID',
          value: 1,
        },
      ]);
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
          defectSubcategoryId: null,
          defectCategoryId: 'defect-welding',
          defectSubtype: '气孔',
          defectType: '历史焊接缺陷名称',
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
          defectSubcategoryId: null,
          defectCategoryId: 'defect-welding',
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
      (
        QualityClassificationService.resolveCategoryNamesByIds as any
      ).mockResolvedValue(new Map([['defect-welding', '焊接缺陷']]));

      const result = await InspectionIssueStatsService.getIssueChartAggregation(
        {
          dimension: 'defectType',
          metric: 'count',
          year: 2024,
        },
      );

      expect(result).toEqual([
        {
          id: 'defect-welding',
          name: '焊接缺陷',
          resolutionStatus: 'RESOLVED',
          value: 2,
        },
      ]);
    });

    it('should aggregate by status dimension', async () => {
      (prisma.quality_records.findMany as any).mockResolvedValue([
        {
          date: new Date('2024-01-15'),
          defectSubcategoryId: null,
          defectCategoryId: 'defect-a',
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
      (
        QualityClassificationService.resolveCategoryNamesByIds as any
      ).mockResolvedValue(new Map([['defect-a', 'A']]));

      const result = await InspectionIssueStatsService.getIssueChartAggregation(
        {
          dimension: 'status',
          metric: 'count',
          year: 2024,
        },
      );

      expect(result).toEqual([
        {
          id: 'OPEN',
          name: 'OPEN',
          resolutionStatus: 'RESOLVED',
          value: 1,
        },
      ]);
    });

    it('should aggregate by claim dimension', async () => {
      (prisma.quality_records.findMany as any).mockResolvedValue([
        {
          date: new Date('2024-01-15'),
          defectSubcategoryId: null,
          defectCategoryId: 'defect-b',
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
      (
        QualityClassificationService.resolveCategoryNamesByIds as any
      ).mockResolvedValue(new Map([['defect-b', 'B']]));

      const result = await InspectionIssueStatsService.getIssueChartAggregation(
        {
          dimension: 'claim',
          metric: 'count',
          year: 2024,
        },
      );

      expect(result).toEqual([
        {
          id: 'Yes',
          name: 'Yes',
          resolutionStatus: 'RESOLVED',
          value: 1,
        },
      ]);
    });

    it('should use lossAmount metric', async () => {
      (prisma.quality_records.findMany as any).mockResolvedValue([
        {
          date: new Date('2024-01-15'),
          defectSubcategoryId: null,
          defectCategoryId: 'defect-a',
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
      (
        QualityClassificationService.resolveCategoryNamesByIds as any
      ).mockResolvedValue(new Map([['defect-a', 'A']]));

      const result = await InspectionIssueStatsService.getIssueChartAggregation(
        {
          dimension: 'defectType',
          metric: 'lossAmount',
          year: 2024,
        },
      );

      expect(result).toEqual([
        {
          id: 'defect-a',
          name: 'A',
          resolutionStatus: 'RESOLVED',
          value: 150,
        },
      ]);
    });

    it('should use quantity metric', async () => {
      (prisma.quality_records.findMany as any).mockResolvedValue([
        {
          date: new Date('2024-01-15'),
          defectSubcategoryId: null,
          defectCategoryId: 'defect-b',
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
      (
        QualityClassificationService.resolveCategoryNamesByIds as any
      ).mockResolvedValue(new Map([['defect-b', 'B']]));

      const result = await InspectionIssueStatsService.getIssueChartAggregation(
        {
          dimension: 'defectType',
          metric: 'quantity',
          year: 2024,
        },
      );

      expect(result).toEqual([
        {
          id: 'defect-b',
          name: 'B',
          resolutionStatus: 'RESOLVED',
          value: 10,
        },
      ]);
    });

    it('should limit results by top parameter', async () => {
      const rows = Array.from({ length: 20 }, (_, i) => ({
        date: new Date('2024-01-15'),
        defectSubcategoryId: null,
        defectCategoryId: `defect-${i}`,
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
      (
        QualityClassificationService.resolveCategoryNamesByIds as any
      ).mockResolvedValue(
        new Map(rows.map((_, index) => [`defect-${index}`, `Type-${index}`])),
      );

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
        defectSubcategoryId: null,
        defectCategoryId: `defect-${i}`,
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
      (
        QualityClassificationService.resolveCategoryNamesByIds as any
      ).mockResolvedValue(
        new Map(rows.map((_, index) => [`defect-${index}`, `Type-${index}`])),
      );

      const result = await InspectionIssueStatsService.getIssueChartAggregation(
        {
          dimension: 'defectType',
          metric: 'count',
          year: 2024,
        },
      );

      expect(result).toHaveLength(15);
    });

    it('should expose missing dimension evidence instead of Unknown', async () => {
      (prisma.quality_records.findMany as any).mockResolvedValue([
        {
          date: new Date('2024-01-15'),
          defectSubcategoryId: null,
          defectCategoryId: null,
          defectSubtype: '',
          defectType: '',
          division: '车辆 OBU',
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

      expect(result).toEqual([
        {
          id: null,
          name: '数据待治理：车辆 OBU',
          rawName: '车辆 OBU',
          resolutionReason: 'MISSING_REQUIRED',
          resolutionStatus: 'MISSING',
          value: 1,
        },
      ]);
    });

    it('should mark an empty supplier identity as not applicable', async () => {
      (prisma.quality_records.findMany as any).mockResolvedValue([
        {
          date: new Date('2024-01-15'),
          defectSubcategoryId: null,
          defectCategoryId: null,
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
          supplierId: null,
          supplierName: null,
        },
      ]);

      const result = await InspectionIssueStatsService.getIssueChartAggregation(
        {
          dimension: 'supplierName',
          metric: 'count',
          year: 2024,
        },
      );

      expect(result).toEqual([
        {
          id: null,
          name: '不涉及供应商',
          resolutionReason: 'NOT_APPLICABLE',
          resolutionStatus: 'MISSING',
          value: 1,
        },
      ]);
    });

    it('resolves a retired department ID through the frozen canonical ID name snapshot', async () => {
      (prisma.quality_records.findMany as any).mockResolvedValue([
        {
          date: new Date('2024-01-15'),
          defectSubcategoryId: null,
          defectCategoryId: null,
          defectSubtype: '',
          defectType: '',
          division: '',
          isClaim: false,
          lossAmount: 0,
          projectName: '',
          quantity: 0,
          responsibleDepartment: 'dept-1769576623191',
          responsibleDepartmentId: 'a3a98d7b568511f1881c00163e37355f',
          severity: '',
          status: 'OPEN',
          supplierId: null,
          supplierName: '',
        },
      ]);
      (
        MasterDataGovernanceKernel.resolveCanonicalNamesByIds as any
      ).mockResolvedValue(
        new Map([['a3a98d7b568511f1881c00163e37355f', '生产 OBU']]),
      );

      const result = await InspectionIssueStatsService.getIssueChartAggregation(
        {
          dimension: 'responsibleDepartment',
          metric: 'count',
          year: 2024,
        },
      );

      expect(result).toEqual([
        {
          id: 'a3a98d7b568511f1881c00163e37355f',
          name: '生产 OBU',
          resolutionStatus: 'RESOLVED',
          value: 1,
        },
      ]);
      expect(
        MasterDataGovernanceKernel.resolveCanonicalNamesByIds,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          configKey: 'responsibleDepartment',
          idLikeNameById: [
            {
              id: 'a3a98d7b568511f1881c00163e37355f',
              rawName: 'dept-1769576623191',
            },
          ],
        }),
      );
    });

    it('keeps an unresolvable department reference as invalidated master data', async () => {
      (prisma.quality_records.findMany as any).mockResolvedValue([
        {
          date: new Date('2024-01-15'),
          defectSubcategoryId: null,
          defectCategoryId: null,
          defectSubtype: '',
          defectType: '',
          division: '',
          isClaim: false,
          lossAmount: 0,
          projectName: '',
          quantity: 0,
          responsibleDepartment: '秦皇岛弘旺设备安装工程有限公司',
          responsibleDepartmentId: 'a3a98e23568511f1881c00163e37355f',
          severity: '',
          status: 'OPEN',
          supplierId: null,
          supplierName: '',
        },
      ]);
      (
        MasterDataGovernanceKernel.resolveCanonicalNamesByIds as any
      ).mockResolvedValue(new Map());

      const result = await InspectionIssueStatsService.getIssueChartAggregation(
        {
          dimension: 'responsibleDepartment',
          metric: 'count',
          year: 2024,
        },
      );

      expect(result).toEqual([
        {
          id: 'a3a98e23568511f1881c00163e37355f',
          name: '主数据已失效：秦皇岛弘旺设备安装工程有限公司',
          rawName: '秦皇岛弘旺设备安装工程有限公司',
          resolutionReason: 'INVALID_REFERENCE',
          resolutionStatus: 'INVALID',
          value: 1,
        },
      ]);
    });

    it('merges the legacy department ID row with the canonical row', async () => {
      (prisma.quality_records.findMany as any).mockResolvedValue([
        {
          date: new Date('2024-01-15'),
          defectSubcategoryId: null,
          defectCategoryId: null,
          defectSubtype: '',
          defectType: '',
          division: '',
          isClaim: false,
          lossAmount: 0,
          projectName: '',
          quantity: 0,
          responsibleDepartment: 'dept-1769576623191',
          responsibleDepartmentId: 'a3a98d7b568511f1881c00163e37355f',
          severity: '',
          status: 'OPEN',
          supplierId: null,
          supplierName: '',
        },
        {
          date: new Date('2024-01-16'),
          defectSubcategoryId: null,
          defectCategoryId: null,
          defectSubtype: '',
          defectType: '',
          division: '',
          isClaim: false,
          lossAmount: 0,
          projectName: '',
          quantity: 0,
          responsibleDepartment: '生产 OBU',
          responsibleDepartmentId: 'dept-1769576623191',
          severity: '',
          status: 'OPEN',
          supplierId: null,
          supplierName: '',
        },
      ]);
      (
        MasterDataGovernanceKernel.resolveCanonicalNamesByIds as any
      ).mockImplementation(
        (options: { canonicalIdById?: Map<string, string> }) => {
          options.canonicalIdById?.set(
            'a3a98d7b568511f1881c00163e37355f',
            'dept-1769576623191',
          );
          return Promise.resolve(
            new Map([
              ['a3a98d7b568511f1881c00163e37355f', '生产 OBU'],
              ['dept-1769576623191', '生产 OBU'],
            ]),
          );
        },
      );

      const result = await InspectionIssueStatsService.getIssueChartAggregation(
        {
          dimension: 'responsibleDepartment',
          metric: 'count',
          year: 2024,
        },
      );

      expect(result).toEqual([
        {
          id: 'dept-1769576623191',
          name: '生产 OBU',
          resolutionStatus: 'RESOLVED',
          value: 2,
        },
      ]);
    });
  });
});
