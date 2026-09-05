import type { QualityLossItem } from '@qgs/shared';

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { QualityLossService } from '~/modules/quality-loss/quality-loss.service';
import prisma from '~/utils/prisma';

vi.mock('~/utils/prisma', () => ({
  default: {
    quality_loss_index: {
      aggregate: vi.fn(),
      count: vi.fn(),
      findMany: vi.fn(),
      groupBy: vi.fn(),
    },
    $queryRaw: vi.fn(),
  },
}));

vi.mock('~/modules/data-scope/data-scope.service', () => ({
  DataScopeService: {
    buildQualityLossIndexWhere: vi.fn(async (where: unknown) => where),
  },
}));

vi.mock('~/modules/dept/dept.service', () => ({
  DeptService: {
    findAll: vi.fn(async () => []),
  },
}));

vi.mock('~/modules/dept/dept-tree', () => ({
  flattenDeptTree: () => [],
}));

vi.mock('~/utils/canonical-master-data', () => ({
  MasterDataGovernanceKernel: {
    resolveCanonicalNamesByIds: vi
      .fn()
      .mockResolvedValue(new Map([['dept-qa', 'Quality']])),
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
  const actual =
    await vi.importActual<typeof import('@qgs/shared')>('@qgs/shared');
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

function indexRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    actualClaim: 0,
    amount: 100,
    createdBy: 'system',
    description: null,
    id: 'EXT-as-1',
    indexedAt: new Date('2024-01-01'),
    isDeleted: false,
    occurDate: new Date('2024-01-01'),
    partName: 'Bolt',
    projectName: 'P',
    respDept: 'QA',
    respDeptId: 'dept-qa',
    source: 'External',
    sourcePk: 'as-1',
    status: 'OPEN',
    workOrderNumber: 'WO-1',
    ...overrides,
  };
}

describe('qualityLossService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getAllLosses', () => {
    it('serves rows from quality_loss_index with DB pagination', async () => {
      (prisma.quality_loss_index.findMany as any).mockResolvedValue([
        indexRow({ id: 'EXT-as-1', source: 'External', amount: 350 }),
        indexRow({
          id: 'INT-qr-1',
          source: 'Internal',
          sourcePk: 'qr-1',
          amount: 200,
        }),
      ]);
      (prisma.quality_loss_index.count as any).mockResolvedValue(2);

      const result = await QualityLossService.getAllLosses();

      expect(prisma.quality_loss_index.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ isDeleted: false }),
          orderBy: { occurDate: 'desc' },
        }),
      );
      expect(result.total).toBe(2);
      expect(result.items.map((item) => item.lossSource).sort()).toEqual([
        'External',
        'Internal',
      ]);
      expect(result.items[0]).toEqual(
        expect.objectContaining({
          responsibleDepartment: 'QA',
          responsibleDepartmentCanonicalName: 'Quality',
          responsibleDepartmentId: 'dept-qa',
          responsibleDepartmentResolutionStatus: 'RESOLVED',
        }),
      );
    });

    it('preserves unresolved historical department snapshots', async () => {
      (prisma.quality_loss_index.findMany as any).mockResolvedValue([
        indexRow({ respDept: 'Legacy Quality', respDeptId: null }),
      ]);
      (prisma.quality_loss_index.count as any).mockResolvedValue(1);

      const result = await QualityLossService.getAllLosses();

      expect(result.items[0]).toEqual(
        expect.objectContaining({
          responsibleDepartment: 'Legacy Quality',
          responsibleDepartmentCanonicalName: '数据待治理：Legacy Quality',
          responsibleDepartmentResolutionReason: 'MISSING_REQUIRED',
          responsibleDepartmentResolutionStatus: 'MISSING',
        }),
      );
    });

    it('applies lossSource filter to where clause', async () => {
      (prisma.quality_loss_index.findMany as any).mockResolvedValue([]);
      (prisma.quality_loss_index.count as any).mockResolvedValue(0);

      await QualityLossService.getAllLosses({ lossSource: 'External' });

      expect(prisma.quality_loss_index.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ source: 'External' }),
        }),
      );
    });
  });

  describe('getTrendData', () => {
    it('uses a sargable occurDate range instead of YEAR(occurDate)', async () => {
      (prisma.$queryRaw as any).mockResolvedValue([]);
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-04-29T00:00:00.000Z'));
      try {
        await QualityLossService.getTrendData('month');
      } finally {
        vi.useRealTimers();
      }
      const rawSqlArgs = (prisma.$queryRaw as any).mock.calls[0];
      const sql = rawSqlArgs[0].join('');
      expect(sql).toContain('occurDate >= ');
      expect(sql).toContain('occurDate < ');
      expect(sql).not.toContain('YEAR(occurDate)');
      expect(rawSqlArgs[2]).toEqual(new Date('2026-01-01T00:00:00.000Z'));
      expect(rawSqlArgs[3]).toEqual(new Date('2027-01-01T00:00:00.000Z'));
    });

    it('should handle trend data aggregation', async () => {
      (prisma.$queryRaw as any).mockResolvedValueOnce([
        { p: 1, a: 100, source: 'Manual' },
        { p: 1, a: 200, source: 'Internal' },
        { p: 1, a: 300, source: 'External' },
        { p: 1, a: 50, source: 'Commissioning' },
      ]);

      const result = await QualityLossService.getTrendData('month');

      const jan = result.trend.find(
        (t) => t.period === '1月' || t.period === 'Jan',
      );
      expect(jan).toBeDefined();
      expect(jan?.totalAmount).toBe(650);
      expect(jan?.manualAmount).toBe(100);
      expect(jan?.internalAmount).toBe(200);
      expect(jan?.externalAmount).toBe(300);
      expect(jan?.commissioningAmount).toBe(50);
    });

    it('should handle BigInt period and sum values', async () => {
      (prisma.$queryRaw as any).mockResolvedValueOnce([
        { p: BigInt(5), a: BigInt(1000), source: 'Manual' },
        { p: BigInt(5), a: BigInt(2000), source: 'Internal' },
        { p: BigInt(5), a: BigInt(3000), source: 'External' },
        { p: BigInt(5), a: BigInt(500), source: 'Commissioning' },
      ]);

      const result = await QualityLossService.getTrendData('week');
      const w5 = result.trend.find((t) => t.period === 'W5');
      expect(w5).toBeDefined();
      expect(w5?.totalAmount).toBe(6500);
    });
  });

  describe('getDashboardSummary', () => {
    it('aggregates in the database and matches the legacy summary oracle', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-04-29T00:00:00.000Z'));
      try {
        (prisma.quality_loss_index.aggregate as any)
          .mockResolvedValueOnce({
            _sum: { actualClaim: 150.5, amount: 1000.25 },
          })
          .mockResolvedValueOnce({
            _sum: { actualClaim: 30.25, amount: 400.75 },
          });
        (prisma.quality_loss_index.groupBy as any).mockResolvedValue([
          { occurDate: new Date('2025-03-01') },
          { occurDate: new Date('2026-03-01') },
        ]);

        const result = await QualityLossService.getDashboardSummary({});

        expect(result.kpi).toEqual({
          totalAmount: 1000.25,
          totalClaim: 150.5,
          recoveryRate: 15,
          displayRate: '15%',
          pendingAmount: 370.5,
        });
        expect(result.years).toEqual([2026, 2025]);
        expect(prisma.quality_loss_index.findMany).not.toHaveBeenCalled();
      } finally {
        vi.useRealTimers();
      }
    });

    it('keeps the zero KPI and current-year fallback on empty data', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-04-29T00:00:00.000Z'));
      try {
        (prisma.quality_loss_index.aggregate as any)
          .mockResolvedValueOnce({
            _sum: { actualClaim: null, amount: null },
          })
          .mockResolvedValueOnce({
            _sum: { actualClaim: null, amount: null },
          });
        (prisma.quality_loss_index.groupBy as any).mockResolvedValue([]);

        const result = await QualityLossService.getDashboardSummary({});

        expect(result.kpi).toEqual({
          totalAmount: 0,
          totalClaim: 0,
          recoveryRate: 0,
          displayRate: '0%',
          pendingAmount: 0,
        });
        expect(result.years).toEqual([2026]);
      } finally {
        vi.useRealTimers();
      }
    });

    it('keeps Decimal sums exact through toFixed formatting', async () => {
      (prisma.quality_loss_index.aggregate as any)
        .mockResolvedValueOnce({
          _sum: { actualClaim: 10.1, amount: 100.2 },
        })
        .mockResolvedValueOnce({
          _sum: { actualClaim: 1.05, amount: 20.2 },
        });
      (prisma.quality_loss_index.groupBy as any).mockResolvedValue([]);

      const result = await QualityLossService.getDashboardSummary({});

      expect(result.kpi.totalAmount).toBe(100.2);
      expect(result.kpi.pendingAmount).toBe(19.15);
    });
  });

  describe('getYearlyCharts', () => {
    it('matches the legacy charts oracle for month granularity', async () => {
      const { QualityLossSummaryService } = await import(
        '~/modules/quality-loss/quality-loss-summary.service'
      );
      const legacyList: QualityLossItem[] = [
        {
          actualClaim: 40,
          amount: 100,
          date: '2026-01-15',
          id: 'row-1',
          lossSource: 'Internal',
          partName: null,
          pk: 'row-1',
          projectName: null,
          responsibleDepartment: 'QA',
          responsibleDepartmentCanonicalName: 'Quality',
          responsibleDepartmentId: 'dept-qa',
          responsibleDepartmentResolutionStatus: 'RESOLVED' as const,
          status: 'OPEN',
          workOrderNumber: null,
        },
        {
          actualClaim: 50,
          amount: 200,
          date: '2026-06-20',
          id: 'row-2',
          lossSource: 'Internal',
          partName: null,
          pk: 'row-2',
          projectName: null,
          responsibleDepartment: 'QA',
          responsibleDepartmentCanonicalName: 'Quality',
          responsibleDepartmentId: 'dept-qa',
          responsibleDepartmentResolutionStatus: 'RESOLVED' as const,
          status: 'CONFIRMED',
          workOrderNumber: null,
        },
        {
          actualClaim: 100,
          amount: 300,
          date: '2027-03-05',
          id: 'row-3',
          lossSource: 'Internal',
          partName: null,
          pk: 'row-3',
          projectName: null,
          responsibleDepartment: 'QA',
          responsibleDepartmentCanonicalName: 'Quality',
          responsibleDepartmentId: 'dept-qa',
          responsibleDepartmentResolutionStatus: 'RESOLVED' as const,
          status: 'OPEN',
          workOrderNumber: null,
        },
      ];
      const expected = QualityLossSummaryService.getYearlyCharts(legacyList, {
        granularity: 'month',
        year: 2026,
      });

      (prisma.quality_loss_index.groupBy as any)
        .mockResolvedValueOnce([
          {
            respDept: 'QA',
            respDeptId: 'dept-qa',
            _sum: { amount: 300 },
          },
        ])
        .mockResolvedValueOnce([
          {
            occurDate: new Date('2026-01-15'),
            _sum: { actualClaim: 40, amount: 100 },
          },
          {
            occurDate: new Date('2026-06-20'),
            _sum: { actualClaim: 50, amount: 200 },
          },
          {
            occurDate: new Date('2027-03-05'),
            _sum: { actualClaim: 100, amount: 300 },
          },
        ]);

      const result = await QualityLossService.getYearlyCharts({
        granularity: 'month',
        year: 2026,
      });

      expect(result).toEqual(expected);
      expect(prisma.quality_loss_index.findMany).not.toHaveBeenCalled();
    });

    it('buckets the year-granularity trend across all present years', async () => {
      (prisma.quality_loss_index.groupBy as any)
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([
          {
            occurDate: new Date('2025-11-02'),
            _sum: { actualClaim: 10, amount: 100 },
          },
          {
            occurDate: new Date('2026-07-03'),
            _sum: { actualClaim: 20, amount: 200 },
          },
        ]);

      const result = await QualityLossService.getYearlyCharts({
        granularity: 'year',
        year: 2026,
      });

      expect(result.trend).toEqual([
        {
          period: 2025,
          periodLabel: '2025年',
          totalAmount: 100,
          claimAmount: 10,
        },
        {
          period: 2026,
          periodLabel: '2026年',
          totalAmount: 200,
          claimAmount: 20,
        },
      ]);
    });
  });

  describe('getExportRows', () => {
    it('reads at most EXPORT_QUERY_TAKE rows through the same scoped where', async () => {
      (prisma.quality_loss_index.findMany as any).mockResolvedValue([]);

      await QualityLossService.getExportRows({
        status: 'Pending',
        year: 2026,
      });

      const findManyArgs = (prisma.quality_loss_index.findMany as any).mock
        .calls[0][0];
      expect(findManyArgs.take).toBe(20_001);
      expect(findManyArgs.where).toBeDefined();
    });
  });
});
