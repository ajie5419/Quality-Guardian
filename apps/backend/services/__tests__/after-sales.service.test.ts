import { beforeEach, describe, expect, it, vi } from 'vitest';

import prisma from '../../utils/prisma';
import { AfterSalesService } from '../after-sales.service';

// Mock prisma
vi.mock('../../utils/prisma', () => ({
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
        if (by.includes('defectType'))
          return Promise.resolve([{ defectType: 'Minor', _count: { id: 10 } }]);
        if (by.includes('supplierBrand'))
          return Promise.resolve([
            { supplierBrand: 'Brand A', _count: { id: 10 } },
          ]);
        if (by.includes('respDept'))
          return Promise.resolve([{ respDept: 'Quality', _count: { id: 10 } }]);
        return Promise.resolve([]);
      });

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
          runningHours: 100,
        },
      ];

      (prisma.after_sales.findMany as any).mockResolvedValue(mockRecords);

      const result = await AfterSalesService.getList({});

      expect(result).toHaveLength(1);
      const item = result[0];
      expect(item.id).toBe('AS-1');
      expect(item.qualityLoss).toBe(150);
    });
  });
});
