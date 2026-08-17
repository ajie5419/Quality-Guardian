import { Prisma } from '@prisma/client';
import { MetricRefreshQueue } from '~/modules/metric-refresh';
import { QualityLossIndexQueue } from '~/modules/quality-loss';
import prisma from '~/utils/prisma';

import { InspectionReportStatisticsService } from './inspection-report-statistics.service';
import { buildSupplierEngineeringIssueWhere } from './inspection-supplier-profile';

export const InspectionReportingService = {
  async findIssueIdBySerialNumber(serialNumber: number) {
    const row = await prisma.quality_records.findFirst({
      where: { isDeleted: false, serialNumber },
      select: { id: true },
    });
    return row?.id || null;
  },
  async updateQualityLossFields(params: { actualClaim?: number; id: string }) {
    await prisma.$transaction(async (tx) => {
      const current = await tx.quality_records.findUnique({
        where: { id: params.id },
        select: { supplierId: true },
      });
      const updated = await tx.quality_records.update({
        where: { id: params.id },
        data: {
          recoveredAmount: params.actualClaim,
          updatedAt: new Date(),
        },
      });
      await MetricRefreshQueue.enqueueSupplierScores(
        tx,
        [current?.supplierId, updated.supplierId],
        'inspection-issue.quality-loss-updated',
      );
      await QualityLossIndexQueue.enqueue(
        tx,
        [{ source: 'INTERNAL', sourcePk: updated.id }],
        'inspection-issue.quality-loss-updated',
      );
    });
  },

  async getWorkspaceIssueSummary(params: { today: Date }) {
    const [
      openIssues,
      todayInspections,
      todayIssues,
      openIssuesCount,
      recentIssues,
    ] = await Promise.all([
      prisma.quality_records.findMany({
        where: { status: 'OPEN', isDeleted: false },
        take: 5,
        orderBy: { createdAt: 'desc' },
      }),
      prisma.inspections.count({
        where: { createdAt: { gte: params.today }, isDeleted: false },
      }),
      prisma.quality_records.count({
        where: { createdAt: { gte: params.today }, isDeleted: false },
      }),
      prisma.quality_records.count({
        where: { status: 'OPEN', isDeleted: false },
      }),
      prisma.quality_records.findMany({
        take: 8,
        orderBy: { createdAt: 'desc' },
        where: { isDeleted: false },
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

  async getSupplierScoringData(params: {
    engineeringSupplierIds: string[];
    incomingSupplierIds: string[];
    processTeamIds: string[];
    since: Date;
  }) {
    const recentEngineeringWhere = buildSupplierEngineeringIssueWhere({
      since: params.since,
      supplierIds: params.engineeringSupplierIds,
    });
    const allEngineeringWhere = buildSupplierEngineeringIssueWhere({
      supplierIds: params.engineeringSupplierIds,
    });
    const inspectionSourceOr: Prisma.inspectionsWhereInput[] = [];
    if (params.incomingSupplierIds.length > 0) {
      inspectionSourceOr.push({
        category: 'INCOMING',
        supplierId: { in: params.incomingSupplierIds },
      });
    }
    if (params.processTeamIds.length > 0) {
      inspectionSourceOr.push({
        category: 'PROCESS',
        teamId: { in: params.processTeamIds },
      });
    }

    const [
      incomingStats,
      engineeringStats,
      engineeringStatusStats,
      records,
      engineeringTotalStats,
    ] = await Promise.all([
      prisma.inspections.groupBy({
        by: ['category', 'supplierId', 'teamId', 'result'],
        where: {
          OR: inspectionSourceOr,
          isDeleted: false,
          inspectionDate: { gte: params.since },
        },
        _count: { id: true },
        _sum: { quantity: true },
      }),
      prisma.quality_records.groupBy({
        by: ['supplierId'],
        where: recentEngineeringWhere,
        _sum: { lossAmount: true, quantity: true },
        _count: { id: true },
      }),
      prisma.quality_records.groupBy({
        by: ['supplierId', 'status'],
        where: recentEngineeringWhere,
        _count: { id: true },
      }),
      prisma.quality_records.findMany({
        where: recentEngineeringWhere,
        select: {
          supplierId: true,
          supplierName: true,
          lossAmount: true,
          severity: true,
          date: true,
        },
        orderBy: { date: 'desc' },
      }),
      prisma.quality_records.groupBy({
        by: ['supplierId'],
        where: allEngineeringWhere,
        _count: { id: true },
      }),
    ]);

    return {
      engineeringStats,
      engineeringStatusStats,
      engineeringTotalStats,
      incomingStats,
      records,
    };
  },

  async getWeeklyReportIssues(params: { end: Date; start: Date }) {
    return prisma.quality_records.findMany({
      where: {
        isDeleted: false,
        date: { gte: params.start, lte: params.end },
      },
    });
  },

  async getDailyReportInspections(params: {
    end: Date;
    realName?: string;
    start: Date;
    username: string;
  }) {
    return prisma.inspections.findMany({
      where: {
        isDeleted: false,
        inspectionDate: { gte: params.start, lte: params.end },
        OR: [
          { inspector: params.username },
          { inspector: params.realName || '' },
        ],
      },
      include: {
        process: { select: { name: true } },
        work_order: { select: { projectName: true, customerName: true } },
      },
    });
  },

  async getDailyReportIssues(params: {
    end: Date;
    start: Date;
    username: string;
  }) {
    return prisma.quality_records.findMany({
      where: {
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

  async getReportPeriodMetrics(params: { end: Date; start: Date }) {
    const [newIssues, closedIssues, internalLossAgg] = await Promise.all([
      prisma.quality_records.count({
        where: {
          createdAt: { gte: params.start, lte: params.end },
          isDeleted: false,
        },
      }),
      prisma.quality_records.count({
        where: {
          createdAt: { gte: params.start, lte: params.end },
          status: 'CLOSED',
          isDeleted: false,
        },
      }),
      prisma.quality_records.aggregate({
        _sum: { lossAmount: true },
        where: {
          date: { gte: params.start, lte: params.end },
          isDeleted: false,
        },
      }),
    ]);
    return {
      closedIssues,
      internalLoss: Number(internalLossAgg._sum.lossAmount || 0),
      newIssues,
    };
  },

  async getReportDefectRows(params: { end: Date; start: Date }) {
    return prisma.quality_records.findMany({
      where: { date: { gte: params.start, lte: params.end }, isDeleted: false },
      select: { defectCategoryId: true, defectType: true },
    });
  },

  async getReportTopRiskProjects(params: { end: Date; start: Date }) {
    return InspectionReportStatisticsService.getTopRiskProjects(params);
  },

  async getReportSupplierPerformance(params: { end: Date; start: Date }) {
    return InspectionReportStatisticsService.getSupplierPerformance(params);
  },

  async getReportMajorEvents(params: { end: Date; start: Date }) {
    return prisma.quality_records.findMany({
      where: { date: { gte: params.start, lte: params.end }, isDeleted: false },
      orderBy: { lossAmount: 'desc' },
      take: 3,
    });
  },

  async getWelderScoreStats(options?: {
    welderIds?: string[];
    welderNames?: string[];
  }) {
    const welderIds = [
      ...new Set(
        (options?.welderIds ?? [])
          .map((id) => String(id || '').trim())
          .filter(Boolean),
      ),
    ];
    const welderNames = [
      ...new Set(
        (options?.welderNames ?? [])
          .map((name) => String(name || '').trim())
          .filter(Boolean),
      ),
    ];
    const idFilter = welderIds.length > 0;
    const nameFilter = welderNames.length > 0;
    if (!idFilter && !nameFilter) {
      return prisma.quality_records.groupBy({
        by: ['responsibleWelderId', 'responsibleWelder', 'severity'],
        where: { isDeleted: false },
        _count: { id: true },
      });
    }
    const orFilters: Prisma.quality_recordsWhereInput[] = [];
    if (idFilter) {
      orFilters.push({ responsibleWelderId: { in: welderIds } });
    }
    if (nameFilter) {
      // Historical rows without a canonical id fall back to exact name
      // matching; ambiguous names are ignored by the resolver later.
      orFilters.push({
        responsibleWelderId: null,
        responsibleWelder: { in: welderNames },
      });
    }
    return prisma.quality_records.groupBy({
      by: ['responsibleWelderId', 'responsibleWelder', 'severity'],
      where: { isDeleted: false, OR: orFilters },
      _count: { id: true },
    });
  },

  async getWorkOrderAggregateInspections(workOrderNumber: string) {
    return prisma.inspections.findMany({
      where: { isDeleted: false, workOrderNumber },
      orderBy: [{ inspectionDate: 'desc' }],
      include: {
        items: {
          orderBy: [{ order: 'asc' }],
          select: { checkItem: true, result: true },
        },
        process: { select: { name: true } },
      },
    });
  },

  async getStatsForDashboard(params: { weekStart: Date; yearStart: Date }) {
    const baseWhere: Prisma.quality_recordsWhereInput = {
      isDeleted: false,
    };
    const [yearAggregate, weekAggregate, weekCount, yearTypeStats] =
      await Promise.all([
        prisma.quality_records.aggregate({
          where: { ...baseWhere, date: { gte: params.yearStart } },
          _count: { id: true },
          _sum: { lossAmount: true },
        }),
        prisma.quality_records.aggregate({
          where: { ...baseWhere, date: { gte: params.weekStart } },
          _sum: { lossAmount: true },
        }),
        prisma.quality_records.count({
          where: { ...baseWhere, date: { gte: params.weekStart } },
        }),
        InspectionReportStatisticsService.getDefectDistribution(
          params.yearStart,
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
