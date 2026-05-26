import prisma from '~/utils/prisma';

export const QualityLossReportingService = {
  async getStatsForDashboard(params: { weekStart: Date; yearStart: Date }) {
    const baseWhere = { isDeleted: false };
    const [yearAggregate, weekAggregate] = await Promise.all([
      prisma.quality_losses.aggregate({
        where: { ...baseWhere, occurDate: { gte: params.yearStart } },
        _sum: { amount: true },
      }),
      prisma.quality_losses.aggregate({
        where: { ...baseWhere, occurDate: { gte: params.weekStart } },
        _sum: { amount: true },
      }),
    ]);
    return {
      totalLoss: Number(yearAggregate._sum.amount || 0),
      weeklyLoss: Number(weekAggregate._sum.amount || 0),
    };
  },

  async getWeeklyTrackingIssues(params: {
    closedStatuses: string[];
    end: Date;
    start: Date;
    take?: number;
  }) {
    return prisma.quality_losses.findMany({
      where: {
        isDeleted: false,
        OR: [
          {
            occurDate: { lt: params.start },
            status: { notIn: params.closedStatuses },
          },
          {
            updatedAt: { gte: params.start, lte: params.end },
            status: { in: params.closedStatuses },
          },
        ],
      },
      take: params.take || 20,
    });
  },

  async getReportPeriodMetrics(params: { end: Date; start: Date }) {
    const aggregate = await prisma.quality_losses.aggregate({
      _sum: { amount: true },
      where: {
        occurDate: { gte: params.start, lte: params.end },
        isDeleted: false,
      },
    });
    return {
      manualLoss: Number(aggregate._sum.amount || 0),
    };
  },
};
