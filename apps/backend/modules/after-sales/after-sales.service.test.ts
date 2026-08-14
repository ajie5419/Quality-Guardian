import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AfterSalesService } from '~/modules/after-sales/after-sales.service';
import { DeptService } from '~/modules/dept';
import { MasterDataGovernanceKernel } from '~/utils/canonical-master-data';
import prisma from '~/utils/prisma';

// Mock prisma
vi.mock('~/utils/prisma', () => ({
  default: {
    after_sales: {
      findMany: vi.fn(),
      aggregate: vi.fn(),
      count: vi.fn(),
      groupBy: vi.fn(),
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
      resolveCanonicalNamesByIds: vi
        .fn()
        .mockImplementation(
          async ({ canonicalIds }: { canonicalIds: Array<null | string> }) =>
            new Map(canonicalIds.filter(Boolean).map((id) => [id, null])),
        ),
    },
  };
});

vi.mock('~/modules/quality-classification', () => {
  const listForManagement = vi.fn().mockResolvedValue([
    {
      code: 'MINOR',
      id: 'defect-minor',
      name: 'Minor',
      scope: 'AFTER_SALES_DEFECT',
      sort: 0,
      status: 1,
      subcategories: [],
    },
  ]);
  return {
    QualityClassificationService: {
      listForManagement,
      resolveCategoryNamesByIds: vi.fn(async () => {
        const categories = await listForManagement();
        return new Map(
          categories.map((item: { id: string; name: string }) => [
            item.id,
            item.name,
          ]),
        );
      }),
    },
  };
});

vi.mock('~/modules/dept', () => ({
  DeptService: {
    findActiveByNameContains: vi.fn().mockResolvedValue([]),
    resolveActiveNamesByIds: vi.fn().mockResolvedValue(new Map()),
  },
}));

describe('afterSalesService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getStats', () => {
    it('should correctly aggregate after-sales statistics', async () => {
      (prisma.after_sales.aggregate as any).mockResolvedValue({
        _count: { id: 10 },
        _sum: { materialCost: 1000, laborTravelCost: 500 },
      });
      (prisma.after_sales.count as any).mockResolvedValue(5);
      (prisma.$queryRaw as any).mockImplementation((...args: any[]) => {
        const queryStr = JSON.stringify(args);
        if (queryStr.includes('AVG(DATEDIFF')) {
          return Promise.resolve([{ avgDays: 3.5 }]);
        }
        if (queryStr.includes('MONTH(occurDate)')) {
          return Promise.resolve([
            { period: 1, issues: 10n, costs: 1500, closed: 5n },
          ]);
        }
        return Promise.resolve([]);
      });
      (prisma.after_sales.groupBy as any).mockImplementation(({ by }: any) => {
        if (by.includes('defectCategoryId'))
          return Promise.resolve([
            { defectCategoryId: 'defect-minor', _count: { id: 10 } },
          ]);
        if (by.includes('supplierBrandId'))
          return Promise.resolve([
            { supplierBrandId: 'supplier-a', _count: { id: 10 } },
          ]);
        if (by.includes('respDeptId'))
          return Promise.resolve([
            { respDeptId: 'dept-quality', _count: { id: 10 } },
          ]);
        return Promise.resolve([]);
      });
      (MasterDataGovernanceKernel.resolveCanonicalNamesByIds as any)
        .mockResolvedValueOnce(new Map([['supplier-a', 'Brand A']]))
        .mockResolvedValueOnce(new Map([['dept-quality', 'Quality']]));

      const stats = await AfterSalesService.getStats({ year: 2024 });

      expect(stats.kpi.total).toBe(10);
      expect(stats.kpi.open).toBe(5);
      expect(stats.kpi.cost).toBe(1500);
      expect(stats.kpi.avgTime).toBe(3.5);
      expect(stats.trend.issues[0]).toBe(10);
      expect(stats.trend.costs[0]).toBe(1500);
      expect(stats.defectDistribution).toContainEqual({
        id: 'defect-minor',
        name: 'Minor',
        resolutionStatus: 'RESOLVED',
        value: 10,
      });
    });
  });

  describe('getList', () => {
    it('should correctly map database records to frontend items', async () => {
      const mockRecords = [
        {
          id: 'AS-1',
          occurDate: new Date('2024-01-01T10:00:00.000Z'),
          factoryDate: new Date('2023-12-01T10:00:00.000Z'),
          closeDate: null,
          shipDate: null,
          createdAt: new Date('2024-01-01T10:00:00.000Z'),
          claimStatus: 'OPEN',
          materialCost: 100,
          laborTravelCost: 50,
          respDept: 'Old Quality',
          respDeptId: 'dept-quality',
          responsibleDepartments: JSON.stringify(['Quality', 'Engineering']),
          solution: 'Repair',
          isClaim: true,
          photos: JSON.stringify(['photo1.jpg']),
          projectName: 'Project A',
          workOrderNumber: 'WO-001',
          productType: 'Type A',
          productSubtype: 'Subtype A',
          division: 'Div A',
          partName: 'Part A',
          supplierBrand: 'Brand A',
          supplierBrandId: 'supplier-1',
          runningHours: 100,
        },
      ];

      (prisma.after_sales.findMany as any).mockResolvedValue(mockRecords);
      vi.mocked(DeptService.resolveActiveNamesByIds).mockResolvedValue(
        new Map([['dept-quality', 'Renamed Quality']]),
      );

      const result = await AfterSalesService.getList({});

      expect(result).toHaveLength(1);
      const item = result[0];
      expect(item.id).toBe('AS-1');
      expect(item.qualityLoss).toBe(150);
      expect(item.responsibleDept).toBe('Renamed Quality');
      expect(item.responsibleDepartments).toEqual([
        'Renamed Quality',
        'Engineering',
      ]);
      expect(item.supplierBrandId).toBe('supplier-1');
    });

    it('resolves classification names from current master data over snapshots', async () => {
      const mockRecords = [
        {
          id: 'AS-2',
          occurDate: new Date('2024-01-01T10:00:00.000Z'),
          factoryDate: new Date('2023-12-01T10:00:00.000Z'),
          closeDate: null,
          shipDate: null,
          createdAt: new Date('2024-01-01T10:00:00.000Z'),
          claimStatus: 'OPEN',
          materialCost: 0,
          laborTravelCost: 0,
          respDept: null,
          responsibleDepartments: null,
          solution: null,
          isClaim: false,
          photos: '[]',
          projectName: 'Project A',
          workOrderNumber: 'WO-001',
          productType: '产品类型-旧',
          productSubtype: '产品子类-旧',
          defectType: '缺陷-旧',
          defectSubtype: '缺陷子类-旧',
          division: null,
          partName: null,
          supplierBrand: null,
          supplierBrandId: null,
          runningHours: null,
          defectCategory: { name: '缺陷-新' },
          defectSubcategory: { name: '缺陷子类-新' },
          productCategory: { name: '产品类型-新' },
          productSubcategory: { name: '产品子类-新' },
        },
      ];

      (prisma.after_sales.findMany as any).mockResolvedValue(mockRecords);

      const result = await AfterSalesService.getList({});

      expect(result[0]).toMatchObject({
        defectType: '缺陷-新',
        defectSubtype: '缺陷子类-新',
        productType: '产品类型-新',
        productSubtype: '产品子类-新',
      });
    });

    it('matches classification name filters against snapshot or current master-data names', async () => {
      (prisma.after_sales.findMany as any).mockResolvedValue([]);

      await AfterSalesService.getList({
        defectType: '缺陷-新',
        productType: '产品类型-新',
      });

      const where = (prisma.after_sales.findMany as any).mock.calls[0][0].where;
      expect(where.AND).toEqual([
        {
          OR: [
            { productType: { contains: '产品类型-新' } },
            {
              productCategory: {
                is: { name: { contains: '产品类型-新' } },
              },
            },
          ],
        },
        {
          OR: [
            { defectType: { contains: '缺陷-新' } },
            { defectCategory: { is: { name: { contains: '缺陷-新' } } } },
          ],
        },
      ]);
    });

    it('filters the after-sales list by current active department ID', async () => {
      (prisma.after_sales.findMany as any).mockResolvedValue([]);
      vi.mocked(DeptService.findActiveByNameContains).mockResolvedValue([
        { businessUnit: null, id: 'dept-quality', name: 'Renamed Quality' },
      ]);

      await AfterSalesService.getList({ responsibleDept: 'Renamed Quality' });

      const where = (prisma.after_sales.findMany as any).mock.calls[0][0].where;
      expect(where.AND).toContainEqual({
        OR: expect.arrayContaining([{ respDeptId: { in: ['dept-quality'] } }]),
      });
    });
  });
});
