import type { AnalyticsAccessContext } from '~/modules/data-scope';

import { Prisma } from '@prisma/client';
import { DataScopeService, requireAnalyticsUser } from '~/modules/data-scope';
import prisma from '~/utils/prisma';

async function buildScopedQualityLossWhere(
  baseWhere: Prisma.quality_lossesWhereInput,
  access?: AnalyticsAccessContext,
): Promise<Prisma.quality_lossesWhereInput> {
  if (!access) return baseWhere;
  const user = requireAnalyticsUser(access);
  return DataScopeService.buildQualityLossWhere(
    baseWhere,
    user,
    access.dataScope,
  );
}

export const QualityLossReportingService = {
  async getStatsForDashboard(
    params: { weekStart: Date; yearStart: Date },
    access?: AnalyticsAccessContext,
  ) {
    const baseWhere = { isDeleted: false };
    const yearWhere = await buildScopedQualityLossWhere(
      { ...baseWhere, occurDate: { gte: params.yearStart } },
      access,
    );
    const weekWhere = await buildScopedQualityLossWhere(
      { ...baseWhere, occurDate: { gte: params.weekStart } },
      access,
    );
    const [yearAggregate, weekAggregate] = await Promise.all([
      prisma.quality_losses.aggregate({
        where: yearWhere,
        _sum: { amount: true },
      }),
      prisma.quality_losses.aggregate({
        where: weekWhere,
        _sum: { amount: true },
      }),
    ]);
    return {
      totalLoss: Number(yearAggregate._sum.amount || 0),
      weeklyLoss: Number(weekAggregate._sum.amount || 0),
    };
  },

  async getWeeklyTrackingIssues(
    params: {
      closedStatuses: string[];
      end: Date;
      start: Date;
      take?: number;
    },
    access?: AnalyticsAccessContext,
  ) {
    const where = await buildScopedQualityLossWhere(
      {
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
      access,
    );
    return prisma.quality_losses.findMany({
      where,
      take: params.take || 20,
    });
  },

  async getReportPeriodMetrics(
    params: { end: Date; start: Date },
    access?: AnalyticsAccessContext,
  ) {
    const where = await buildScopedQualityLossWhere(
      {
        occurDate: { gte: params.start, lte: params.end },
        isDeleted: false,
      },
      access,
    );
    const aggregate = await prisma.quality_losses.aggregate({
      _sum: { amount: true },
      where,
    });
    return {
      manualLoss: Number(aggregate._sum.amount || 0),
    };
  },
};
