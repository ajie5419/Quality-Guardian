import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AfterSalesAPI } from '~/modules/after-sales';
import { DashboardService } from '~/modules/dashboard/dashboard.service';
import { InspectionService } from '~/modules/inspection/inspection.service';
import { QualityLossService } from '~/modules/quality-loss/quality-loss.service';
import { SystemService } from '~/modules/system';
import { VehicleCommissioningService } from '~/modules/vehicle-commissioning/vehicle-commissioning.service';
import { WorkOrderService } from '~/modules/work-order/work-order.service';
import prisma from '~/utils/prisma';

// Mock prisma and logger
vi.mock('~/utils/prisma', () => ({
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

vi.mock('~/modules/after-sales', () => ({
  AfterSalesAPI: { getStatsForDashboard: vi.fn() },
  AfterSalesService: { getStatsForDashboard: vi.fn() },
}));
vi.mock('~/modules/inspection/inspection.service', () => ({
  InspectionService: { getStatsForDashboard: vi.fn() },
}));
vi.mock('~/modules/quality-loss/quality-loss.service', () => ({
  QualityLossService: { getStatsForDashboard: vi.fn() },
}));
vi.mock('~/modules/system', () => ({
  SystemService: {
    getSettingValue: vi.fn(),
    saveSettingValue: vi.fn(),
  },
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
    DashboardService.invalidateStatsCache();
  });

  describe('pass rate targets', () => {
    it('returns canonical pass-rate targets in configured order', async () => {
      (SystemService.getSettingValue as any).mockResolvedValue(
        JSON.stringify({
          外协: 98,
          外协结构: 99.7,
          机加: 99.5,
        }),
      );

      const targets = await DashboardService.getPassRateTargets();

      expect(Object.keys(targets)).toEqual([
        '外协结构',
        '外协机加',
        '外协涂装',
        '下料BU',
        '结构BU1',
        '结构BU2',
        '组装BU',
        '机加BU',
        '模具 BU',
      ]);
      expect(targets).toMatchObject({
        外协结构: 99.7,
        外协机加: 98,
        外协涂装: 98,
        机加BU: 99.5,
      });
    });

    it('saves pass-rate targets through system settings service', async () => {
      const targets = {
        外协结构: 99.8,
        机加BU: 99.9,
      };

      await DashboardService.savePassRateTargets(targets);

      expect(SystemService.saveSettingValue).toHaveBeenCalledWith({
        key: 'QMS_PASS_RATE_TARGETS',
        value: JSON.stringify(targets),
        description: 'QMS各工序目标合格率配置 (Quality Pass Rate Targets)',
      });
    });
  });

  describe('getStats', () => {
    it('should aggregate statistics correctly', async () => {
      (AfterSalesAPI.getStatsForDashboard as any).mockResolvedValue({
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
      (AfterSalesAPI.getStatsForDashboard as any).mockRejectedValue(
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

    it('should return cached stats without querying downstream services', async () => {
      (AfterSalesAPI.getStatsForDashboard as any).mockResolvedValue({
        totalCount: 1,
        totalLoss: 10,
        weeklyCount: 1,
        weeklyLoss: 10,
      });
      (InspectionService.getStatsForDashboard as any).mockResolvedValue({
        totalCount: 0,
        totalLoss: 0,
        weeklyCount: 0,
        weeklyLoss: 0,
      });
      (
        VehicleCommissioningService.getStatsForDashboard as any
      ).mockResolvedValue({
        totalCount: 0,
        totalLoss: 0,
        weeklyCount: 0,
        weeklyLoss: 0,
      });
      (WorkOrderService.getStatsForDashboard as any).mockResolvedValue({
        totalCount: 0,
        weeklyCount: 0,
        recentWorkOrders: [],
      });
      (QualityLossService.getStatsForDashboard as any).mockResolvedValue({
        totalLoss: 0,
        weeklyLoss: 0,
      });

      await DashboardService.getStats({ userId: 'u1', scope: 'all' });
      await DashboardService.getStats({ userId: 'u1', scope: 'all' });

      expect(AfterSalesAPI.getStatsForDashboard).toHaveBeenCalledTimes(1);

      DashboardService.invalidateStatsCache({ userId: 'u1', scope: 'all' });
      await DashboardService.getStats({ userId: 'u1', scope: 'all' });

      expect(AfterSalesAPI.getStatsForDashboard).toHaveBeenCalledTimes(2);
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
