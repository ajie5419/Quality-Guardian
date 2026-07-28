import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AfterSalesService } from '~/modules/after-sales/after-sales.service';
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

vi.mock('~/utils/canonical-master-data', () => ({
  MasterDataGovernanceKernel: {
    resolveCanonicalNamesByIds: vi
      .fn()
      .mockImplementation(
        async ({ canonicalIds }: { canonicalIds: Array<null | string> }) =>
          new Map(canonicalIds.filter(Boolean).map((id) => [id, null])),
      ),
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
        if (by.includes('defectTypeId'))
          return Promise.resolve([
            { defectTypeId: 'defect-minor', _count: { id: 10 } },
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
        .mockResolvedValueOnce(new Map([['defect-minor', 'Minor']]))
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
        name: 'Minor',
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
          respDept: 'Quality',
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

      const result = await AfterSalesService.getList({});

      expect(result).toHaveLength(1);
      const item = result[0];
      expect(item.id).toBe('AS-1');
      expect(item.qualityLoss).toBe(150);
      expect(item.responsibleDepartments).toEqual(['Quality', 'Engineering']);
      expect(item.supplierBrandId).toBe('supplier-1');
    });
  });
});
