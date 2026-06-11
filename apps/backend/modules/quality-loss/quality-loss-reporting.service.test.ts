import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('~/utils/prisma', () => ({
  default: {
    quality_losses: {
      aggregate: vi.fn(),
      findMany: vi.fn(),
    },
  },
}));

describe('quality-loss-reporting.service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return totalLoss and weeklyLoss from aggregate', async () => {
    const { QualityLossReportingService } = await import(
      '~/modules/quality-loss/quality-loss-reporting.service'
    );
    const prismaModule = await import('~/utils/prisma');
    const prisma = prismaModule.default;

    (prisma.quality_losses.aggregate as any)
      .mockResolvedValueOnce({ _sum: { amount: 500 } })
      .mockResolvedValueOnce({ _sum: { amount: 120 } });

    const result = await QualityLossReportingService.getStatsForDashboard({
      weekStart: new Date('2026-01-06'),
      yearStart: new Date('2026-01-01'),
    });

    expect(result).toEqual({ totalLoss: 500, weeklyLoss: 120 });
    expect(prisma.quality_losses.aggregate).toHaveBeenCalledTimes(2);
  });

  it('should handle null amount in aggregate', async () => {
    const { QualityLossReportingService } = await import(
      '~/modules/quality-loss/quality-loss-reporting.service'
    );
    const prismaModule = await import('~/utils/prisma');
    const prisma = prismaModule.default;

    (prisma.quality_losses.aggregate as any)
      .mockResolvedValueOnce({ _sum: { amount: null } })
      .mockResolvedValueOnce({ _sum: { amount: null } });

    const result = await QualityLossReportingService.getStatsForDashboard({
      weekStart: new Date('2026-01-06'),
      yearStart: new Date('2026-01-01'),
    });

    expect(result).toEqual({ totalLoss: 0, weeklyLoss: 0 });
  });

  it('should return weekly tracking issues with correct filters', async () => {
    const { QualityLossReportingService } = await import(
      '~/modules/quality-loss/quality-loss-reporting.service'
    );
    const prismaModule = await import('~/utils/prisma');
    const prisma = prismaModule.default;

    (prisma.quality_losses.findMany as any).mockResolvedValue([{ id: 'ql-1' }]);

    const result = await QualityLossReportingService.getWeeklyTrackingIssues({
      closedStatuses: ['Confirmed', 'Closed'],
      end: new Date('2026-01-12'),
      start: new Date('2026-01-06'),
      take: 10,
    });

    expect(result).toEqual([{ id: 'ql-1' }]);
    expect(prisma.quality_losses.findMany).toHaveBeenCalledWith({
      where: {
        isDeleted: false,
        OR: [
          {
            occurDate: { lt: new Date('2026-01-06') },
            status: { notIn: ['Confirmed', 'Closed'] },
          },
          {
            updatedAt: {
              gte: new Date('2026-01-06'),
              lte: new Date('2026-01-12'),
            },
            status: { in: ['Confirmed', 'Closed'] },
          },
        ],
      },
      take: 10,
    });
  });

  it('should default take to 20 when not provided', async () => {
    const { QualityLossReportingService } = await import(
      '~/modules/quality-loss/quality-loss-reporting.service'
    );
    const prismaModule = await import('~/utils/prisma');
    const prisma = prismaModule.default;

    (prisma.quality_losses.findMany as any).mockResolvedValue([]);

    await QualityLossReportingService.getWeeklyTrackingIssues({
      closedStatuses: ['Confirmed'],
      end: new Date('2026-01-12'),
      start: new Date('2026-01-06'),
    });

    expect(prisma.quality_losses.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 20 }),
    );
  });

  it('should return report period metrics', async () => {
    const { QualityLossReportingService } = await import(
      '~/modules/quality-loss/quality-loss-reporting.service'
    );
    const prismaModule = await import('~/utils/prisma');
    const prisma = prismaModule.default;

    (prisma.quality_losses.aggregate as any).mockResolvedValue({
      _sum: { amount: 75 },
    });

    const result = await QualityLossReportingService.getReportPeriodMetrics({
      end: new Date('2026-01-31'),
      start: new Date('2026-01-01'),
    });

    expect(result).toEqual({ manualLoss: 75 });
  });

  it('should handle null amount in report period metrics', async () => {
    const { QualityLossReportingService } = await import(
      '~/modules/quality-loss/quality-loss-reporting.service'
    );
    const prismaModule = await import('~/utils/prisma');
    const prisma = prismaModule.default;

    (prisma.quality_losses.aggregate as any).mockResolvedValue({
      _sum: { amount: null },
    });

    const result = await QualityLossReportingService.getReportPeriodMetrics({
      end: new Date('2026-01-31'),
      start: new Date('2026-01-01'),
    });

    expect(result).toEqual({ manualLoss: 0 });
  });
});
