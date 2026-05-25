import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AfterSalesService } from '~/modules/after-sales/after-sales.service';
import { DashboardService } from '~/modules/dashboard/dashboard.service';
import { InspectionService } from '~/modules/inspection/inspection.service';
import { QualityLossService } from '~/modules/quality-loss/quality-loss.service';
import { VehicleCommissioningService } from '~/modules/vehicle-commissioning/vehicle-commissioning.service';
import { WorkOrderService } from '~/modules/work-order/work-order.service';

import prisma from '../../utils/prisma';

// Mock prisma and logger
vi.mock('../../utils/prisma', () => ({
  default: {
    $queryRaw: vi.fn(),
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
    vehicle_commissioning_issues: {
      aggregate: vi.fn(),
      count: vi.fn(),
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

vi.mock('~/modules/after-sales/after-sales.service', () => ({
  AfterSalesService: { getStatsForDashboard: vi.fn() },
}));
vi.mock('~/modules/inspection/inspection.service', () => ({
  InspectionService: { getStatsForDashboard: vi.fn() },
}));
vi.mock('~/modules/quality-loss/quality-loss.service', () => ({
  QualityLossService: { getStatsForDashboard: vi.fn() },
}));
vi.mock(
  '~/modules/vehicle-commissioning/vehicle-commissioning.service',
  () => ({
    VehicleCommissioningService: { getStatsForDashboard: vi.fn() },
  }),
);
vi.mock('~/modules/work-order/work-order.service', () => ({
  WorkOrderService: { getStatsForDashboard: vi.fn() },
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
      (AfterSalesService.getStatsForDashboard as any).mockResolvedValue({
        totalCount: 10,
        totalLoss: 1500,
        weeklyCount: 2,
        weeklyLoss: 150,
      });
      (InspectionService.getStatsForDashboard as any).mockResolvedValue({
        totalCount: 5,
        totalLoss: 2000,
        weeklyCount: 3,
        weeklyLoss: 200,
        issueDistribution: [
          { type: 'Minor', value: 10 },
          { type: 'Major', value: 2 },
        ],
      });
      (
        VehicleCommissioningService.getStatsForDashboard as any
      ).mockResolvedValue({
        totalCount: 2,
        totalLoss: 700,
        weeklyCount: 1,
        weeklyLoss: 70,
      });
      (WorkOrderService.getStatsForDashboard as any).mockResolvedValue({
        totalCount: 20,
        weeklyCount: 4,
        recentWorkOrders: [
          {
            workOrderNumber: 'WO-1',
            projectName: 'P1',
            status: 'In Progress',
            customerName: 'C1',
          },
        ],
      });
      (QualityLossService.getStatsForDashboard as any).mockResolvedValue({
        totalLoss: 3000,
        weeklyLoss: 300,
      });

      const stats = await DashboardService.getStats();
      const ql = stats.overview.qualityLoss as {
        total: number;
        weekly: number;
      };

      expect(ql.total).toBe(7200); // 1000+500+2000+700+3000
      expect(ql.weekly).toBe(720); // 100+50+200+70+300
      expect(stats.overview.fieldIssues?.total).toBe(10);
      expect(stats.overview.fieldIssues?.open).toBe(2);
      expect(stats.overview.processIssues?.total).toBe(7);
      expect(stats.overview.processIssues?.open).toBe(4);
      expect(stats.overview.openIssues).toBe(6);
      expect(stats.recentWorkOrders).toHaveLength(1);
    });

    it('should handle errors gracefully', async () => {
      (AfterSalesService.getStatsForDashboard as any).mockRejectedValue(
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
      (prisma.$queryRaw as any)
        .mockResolvedValueOnce([{ passCount: 92n, totalCount: 100n }])
        .mockResolvedValue([{ passCount: 0n, totalCount: 0n }]);

      const trend = await DashboardService.getMonthlyTrend();
      const jan = trend[0];

      expect(jan.month).toBe('1月');
      expect(jan.rate).toBe(92);
    });

    it('should handle zero total quantity', async () => {
      (prisma.$queryRaw as any).mockResolvedValue([
        { passCount: 0n, totalCount: 0n },
      ]);

      const trend = await DashboardService.getMonthlyTrend();
      expect(trend[0].rate).toBe(100); // Default for no activity
    });
  });

  describe('getIssueDistribution', () => {
    it('should return defect type distribution', async () => {
      (InspectionService.getStatsForDashboard as any).mockResolvedValue({
        issueDistribution: [
          { type: 'Minor', value: 10 },
          { type: 'Major', value: 2 },
        ],
      });

      const dist = await DashboardService.getIssueDistribution();
      expect(dist).toHaveLength(2);
      expect(dist[0]).toEqual({ type: 'Minor', value: 10 });
    });
  });
});
