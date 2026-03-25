import { beforeEach, describe, expect, it, vi } from 'vitest';

import prisma from '../../utils/prisma';
import { DashboardService } from '../dashboard.service';

// Mock prisma and logger
vi.mock('../../utils/prisma', () => ({
  default: {
    inspections: {
      findMany: vi.fn(),
    },
    after_sales: {
      aggregate: vi.fn(),
      count: vi.fn(),
    },
    quality_records: {
      aggregate: vi.fn(),
      count: vi.fn(),
      groupBy: vi.fn(),
    },
    work_orders: {
      aggregate: vi.fn(),
      count: vi.fn(),
      findMany: vi.fn(),
    },
    quality_losses: {
      aggregate: vi.fn(),
    },
  },
}));

vi.mock('~/utils/logger', () => ({
  createModuleLogger: () => ({
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  }),
}));

describe('dashboardService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getStats', () => {
    it('should aggregate statistics correctly', async () => {
      // Mock year data
      (prisma.after_sales.aggregate as any).mockResolvedValueOnce({
        _count: { id: 10 },
        _sum: { materialCost: 1000, laborTravelCost: 500 },
      });
      (prisma.quality_records.aggregate as any).mockResolvedValueOnce({
        _count: { id: 5 },
        _sum: { lossAmount: 2000 },
      });
      (prisma.work_orders.aggregate as any).mockResolvedValueOnce({
        _count: { workOrderNumber: 20 },
      });
      (prisma.quality_losses.aggregate as any).mockResolvedValueOnce({
        _sum: { amount: 3000 },
      });

      // Mock week data counts
      (prisma.after_sales.count as any).mockResolvedValue(2);
      (prisma.quality_records.count as any).mockResolvedValue(3);
      (prisma.work_orders.count as any).mockResolvedValue(4);

      // Mock week loss aggregate (Promise.all)
      (prisma.after_sales.aggregate as any).mockResolvedValueOnce({
        _sum: { materialCost: 100, laborTravelCost: 50 },
      });
      (prisma.quality_records.aggregate as any).mockResolvedValueOnce({
        _sum: { lossAmount: 200 },
      });
      (prisma.quality_losses.aggregate as any).mockResolvedValueOnce({
        _sum: { amount: 300 },
      });

      // Mock recent work orders
      (prisma.work_orders.findMany as any).mockResolvedValue([
        {
          workOrderNumber: 'WO-1',
          projectName: 'P1',
          status: 'In Progress',
          customerName: 'C1',
        },
      ]);

      const stats = await DashboardService.getStats();
      const ql = stats.overview.qualityLoss as {
        total: number;
        weekly: number;
      };

      expect(ql.total).toBe(6500); // 1000+500+2000+3000
      expect(ql.weekly).toBe(650); // 100+50+200+300
      expect(stats.overview.fieldIssues?.total).toBe(10);
      expect(stats.overview.fieldIssues?.open).toBe(2);
      expect(stats.recentWorkOrders).toHaveLength(1);
    });

    it('should handle errors gracefully', async () => {
      (prisma.after_sales.aggregate as any).mockRejectedValue(
        new Error('DB Error'),
      );

      const stats = await DashboardService.getStats();
      const ql = stats.overview.qualityLoss as {
        total: number;
        weekly: number;
      };

      expect(ql.total).toBe(0);
      expect(stats.recentWorkOrders).toEqual([]);
    });
  });

  describe('getMonthlyTrend', () => {
    it('should calculate pass rate correctly from inspection quantities only', async () => {
      (prisma.inspections.findMany as any).mockResolvedValueOnce([
        {
          quantity: 100,
          qualifiedQuantity: 92,
          unqualifiedQuantity: 8,
          result: 'FAIL',
        },
      ]);
      for (let i = 0; i < 11; i += 1) {
        (prisma.inspections.findMany as any).mockResolvedValueOnce([]);
      }

      const trend = await DashboardService.getMonthlyTrend();
      const jan = trend[0];

      expect(jan.month).toBe('1月');
      expect(jan.rate).toBe(92);
    });

    it('should handle zero total quantity', async () => {
      (prisma.inspections.findMany as any).mockResolvedValue(
        Array.from({ length: 12 }, () => []),
      );

      const trend = await DashboardService.getMonthlyTrend();
      expect(trend[0].rate).toBe(100); // Default for no activity
    });
  });

  describe('getIssueDistribution', () => {
    it('should return defect type distribution', async () => {
      (prisma.quality_records.groupBy as any).mockResolvedValue([
        { defectType: 'Minor', _count: 10 },
        { defectType: 'Major', _count: 2 },
      ]);

      const dist = await DashboardService.getIssueDistribution();
      expect(dist).toHaveLength(2);
      expect(dist[0]).toEqual({ type: 'Minor', value: 10 });
    });
  });
});
