import type { AnalyticsAccessContext } from '~/modules/data-scope';

import { Prisma } from '@prisma/client';
import { DataScopeService, requireAnalyticsUser } from '~/modules/data-scope';
import { MetricRefreshQueue } from '~/modules/metric-refresh';
import { QualityLossIndexQueue } from '~/modules/quality-loss';
import prisma from '~/utils/prisma';

import { InspectionReportStatisticsService } from './inspection-report-statistics.service';

async function buildScopedIssueWhere(
  baseWhere: Prisma.quality_recordsWhereInput,
  access?: AnalyticsAccessContext,
): Promise<Prisma.quality_recordsWhereInput> {
  if (!access) return baseWhere;
  const user = requireAnalyticsUser(access);
  return DataScopeService.buildInspectionWhere(
    baseWhere,
    user,
    access.dataScope,
  );
}

async function buildScopedInspectionWhere(
  baseWhere: Prisma.inspectionsWhereInput,
  access?: AnalyticsAccessContext,
): Promise<Prisma.inspectionsWhereInput> {
  if (!access) return baseWhere;
  const user = requireAnalyticsUser(access);
  return DataScopeService.buildScopedWhere(
    'inspection',
    baseWhere,
    user,
    access.dataScope,
  );
}

export const InspectionReportingService = {
  async findIssueIdBySerialNumber(
    serialNumber: number,
    access?: AnalyticsAccessContext,
  ) {
    const row = await prisma.quality_records.findFirst({
      where: await buildScopedIssueWhere(
        { isDeleted: false, serialNumber },
        access,
      ),
      select: { id: true },
    });
    return row?.id || null;
  },
  async updateQualityLossFields(params: {
    access?: AnalyticsAccessContext;
    actualClaim?: number;
    id: string;
  }) {
    const user = requireAnalyticsUser(params.access);
    await prisma.$transaction(async (tx) => {
      const scopedWhere = await DataScopeService.buildInspectionWhere(
        { id: params.id, isDeleted: false },
        user,
        params.access?.dataScope,
      );
      const current = await tx.quality_records.findFirst({
        where: scopedWhere,
        select: { recoveredAmount: true, supplierId: true },
      });
      if (!current) throw new Error('Inspection issue is outside data scope');
      const updated = await tx.quality_records.updateMany({
        where: {
          AND: [scopedWhere, { recoveredAmount: current.recoveredAmount }],
        },
        data: {
          recoveredAmount: params.actualClaim,
          updatedAt: new Date(),
        },
      });
      if (updated.count !== 1) throw new Error('Inspection issue changed');
      await MetricRefreshQueue.enqueueSupplierScores(
        tx,
        [current.supplierId],
        'inspection-issue.quality-loss-updated',
      );
      await QualityLossIndexQueue.enqueue(
        tx,
        [{ source: 'INTERNAL', sourcePk: params.id }],
        'inspection-issue.quality-loss-updated',
      );
    });
  },

  async getWorkspaceIssueSummary(
    params: { today: Date },
    access?: AnalyticsAccessContext,
  ) {
    const openIssueWhere = await buildScopedIssueWhere(
      { status: 'OPEN', isDeleted: false },
      access,
    );
    const todayInspectionWhere = await buildScopedInspectionWhere(
      { createdAt: { gte: params.today }, isDeleted: false },
      access,
    );
    const todayIssueWhere = await buildScopedIssueWhere(
      { createdAt: { gte: params.today }, isDeleted: false },
      access,
    );
    const recentIssueWhere = await buildScopedIssueWhere(
      { isDeleted: false },
      access,
    );
    const [
      openIssues,
      todayInspections,
      todayIssues,
      openIssuesCount,
      recentIssues,
    ] = await Promise.all([
      prisma.quality_records.findMany({
        where: openIssueWhere,
        take: 5,
        orderBy: { createdAt: 'desc' },
      }),
      prisma.inspections.count({
        where: todayInspectionWhere,
      }),
      prisma.quality_records.count({
        where: todayIssueWhere,
      }),
      prisma.quality_records.count({
        where: openIssueWhere,
      }),
      prisma.quality_records.findMany({
        take: 8,
        orderBy: { createdAt: 'desc' },
        where: recentIssueWhere,
        select: {
          id: true,
          partName: true,
          description: true,
          createdAt: true,
          status: true,
          inspector: true,
        },
      }),
    ]);

    return {
      openIssues,
      openIssuesCount,
      recentIssues,
      todayInspections,
      todayIssues,
    };
  },

  async getWeeklyReportIssues(
    params: { end: Date; start: Date },
    access?: AnalyticsAccessContext,
  ) {
    const where = await buildScopedIssueWhere(
      {
        isDeleted: false,
        date: { gte: params.start, lte: params.end },
      },
      access,
    );
    return prisma.quality_records.findMany({
      where,
    });
  },

  async getDailyReportInspections(
    params: {
      end: Date;
      realName?: string;
      start: Date;
      username: string;
    },
    access?: AnalyticsAccessContext,
  ) {
    const where = await buildScopedInspectionWhere(
      {
        isDeleted: false,
        inspectionDate: { gte: params.start, lte: params.end },
        OR: [
          { inspector: params.username },
          { inspector: params.realName || '' },
        ],
      },
      access,
    );
    return prisma.inspections.findMany({
      where,
      include: {
        process: { select: { name: true } },
        work_order: { select: { projectName: true, customerName: true } },
      },
    });
  },

  async getDailyReportIssues(
    params: {
      end: Date;
      start: Date;
      username: string;
    },
    access?: AnalyticsAccessContext,
  ) {
    const where = await buildScopedIssueWhere(
      {
        isDeleted: false,
        OR: [
          {
            createdAt: { gte: params.start, lte: params.end },
            OR: [
              { inspector: params.username },
              { lastEditor: params.username },
            ],
          },
          {
            status: { not: 'CLOSED' },
            OR: [
              { inspector: params.username },
              { lastEditor: params.username },
            ],
          },
          {
            status: 'CLOSED',
            updatedAt: { gte: params.start, lte: params.end },
            OR: [
              { inspector: params.username },
              { lastEditor: params.username },
            ],
          },
        ],
      },
      access,
    );
    return prisma.quality_records.findMany({
      where,
      include: {
        work_orders: { select: { projectName: true, customerName: true } },
      },
    });
  },

  async getDailyArchiveReportData(params: {
    inspectionIds: string[];
    workOrderNumbers: string[];
  }) {
    const [tasks, templates] = await Promise.all([
      params.inspectionIds.length > 0
        ? prisma.inspection_archive_tasks.findMany({
            where: {
              isDeleted: false,
              inspectionId: { in: params.inspectionIds },
            },
            include: {
              inspection: {
                select: {
                  category: true,
                  incomingType: true,
                  process: { select: { name: true } },
                  processName: true,
                },
              },
            },
            orderBy: [{ dueAt: 'asc' }, { updatedAt: 'desc' }],
          })
        : Promise.resolve([]),
      params.workOrderNumbers.length > 0
        ? prisma.inspection_form_templates.findMany({
            where: {
              isDeleted: false,
              status: 'active',
              workOrderNumber: { in: params.workOrderNumbers },
            },
            select: {
              id: true,
              process: { select: { name: true } },
              processName: true,
              workOrderNumber: true,
            },
          })
        : Promise.resolve([]),
    ]);
    return { tasks, templates };
  },

  async getReportPeriodMetrics(
    params: { end: Date; start: Date },
    access?: AnalyticsAccessContext,
  ) {
    const newIssuesWhere = await buildScopedIssueWhere(
      {
        createdAt: { gte: params.start, lte: params.end },
        isDeleted: false,
      },
      access,
    );
    const internalLossWhere = await buildScopedIssueWhere(
      {
        date: { gte: params.start, lte: params.end },
        isDeleted: false,
      },
      access,
    );
    const [newIssues, closedIssues, internalLossAgg] = await Promise.all([
      prisma.quality_records.count({
        where: newIssuesWhere,
      }),
      prisma.quality_records.count({
        where: {
          ...newIssuesWhere,
          status: 'CLOSED',
        },
      }),
      prisma.quality_records.aggregate({
        _sum: { lossAmount: true },
        where: internalLossWhere,
      }),
    ]);
    return {
      closedIssues,
      internalLoss: Number(internalLossAgg._sum.lossAmount || 0),
      newIssues,
    };
  },

  async getReportDefectRows(
    params: { end: Date; start: Date },
    access?: AnalyticsAccessContext,
  ) {
    const where = await buildScopedIssueWhere(
      { date: { gte: params.start, lte: params.end }, isDeleted: false },
      access,
    );
    return prisma.quality_records.findMany({
      where,
      select: { defectCategoryId: true, defectType: true },
    });
  },

  async getReportTopRiskProjects(
    params: { end: Date; start: Date },
    access?: AnalyticsAccessContext,
  ) {
    return InspectionReportStatisticsService.getTopRiskProjects(params, access);
  },

  async getReportSupplierPerformance(
    params: { end: Date; start: Date },
    access?: AnalyticsAccessContext,
  ) {
    return InspectionReportStatisticsService.getSupplierPerformance(
      params,
      access,
    );
  },

  async getReportMajorEvents(
    params: { end: Date; start: Date },
    access?: AnalyticsAccessContext,
  ) {
    const where = await buildScopedIssueWhere(
      { date: { gte: params.start, lte: params.end }, isDeleted: false },
      access,
    );
    return prisma.quality_records.findMany({
      where,
      orderBy: { lossAmount: 'desc' },
      take: 3,
    });
  },

  async getStatsForDashboard(
    params: { weekStart: Date; yearStart: Date },
    access?: AnalyticsAccessContext,
  ) {
    const baseWhere: Prisma.quality_recordsWhereInput = {
      isDeleted: false,
    };
    const yearWhere = await buildScopedIssueWhere(
      { ...baseWhere, date: { gte: params.yearStart } },
      access,
    );
    const weekWhere = await buildScopedIssueWhere(
      { ...baseWhere, date: { gte: params.weekStart } },
      access,
    );
    const [yearAggregate, weekAggregate, weekCount, yearTypeStats] =
      await Promise.all([
        prisma.quality_records.aggregate({
          where: yearWhere,
          _count: { id: true },
          _sum: { lossAmount: true },
        }),
        prisma.quality_records.aggregate({
          where: weekWhere,
          _sum: { lossAmount: true },
        }),
        prisma.quality_records.count({
          where: weekWhere,
        }),
        InspectionReportStatisticsService.getDefectDistribution(
          params.yearStart,
          access,
        ),
      ]);

    return {
      totalCount: yearAggregate._count.id || 0,
      weeklyCount: weekCount || 0,
      totalLoss: Number(yearAggregate._sum.lossAmount || 0),
      weeklyLoss: Number(weekAggregate._sum.lossAmount || 0),
      issueDistribution: yearTypeStats,
    };
  },
};
