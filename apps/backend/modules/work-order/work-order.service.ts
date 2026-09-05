import type {
  WorkOrderDashboardStats,
  WorkOrderDashboardSummary,
  WorkOrderItem,
  WorkOrderListResult,
  WorkOrderParams,
  WorkOrderSummaryItem,
} from '@qgs/shared';
import type {
  AnalyticsAccessContext,
  ResolvedDataScope,
} from '~/modules/data-scope';

import { Prisma } from '@prisma/client';
import {
  addYearsToDate,
  createIdentityAggregateItem,
  QMS_DEFAULT_VALUES,
} from '@qgs/shared';
import { DataScopeService } from '~/modules/data-scope';
import { MasterDataGovernanceKernel } from '~/utils/canonical-master-data';
import { EXPORT_QUERY_TAKE } from '~/utils/export-constants';
import { createModuleLogger } from '~/utils/logger';
import prisma from '~/utils/prisma';
import { buildKeywordOr, parsePagination } from '~/utils/query-helpers';

import {
  buildScopedWorkOrderWhere,
  mapWorkOrderItems,
  WO_CONSTANTS,
} from './work-order-list-dto';

// 创建模块级 logger
const logger = createModuleLogger('WorkOrderService');

/**
 * 获取指定年份的起止时间
 */
const getYearDateRange = (year?: number) => {
  const now = new Date();
  const targetYear = year || now.getFullYear();

  const start = new Date(`${targetYear}-01-01T00:00:00.000Z`);
  const end = new Date(`${targetYear}-12-31T23:59:59.999Z`);

  return { start, end, isCurrentYear: targetYear === now.getFullYear() };
};

type WorkOrderListParams = WorkOrderParams & {
  dataScope?: ResolvedDataScope;
};

const isValidDate = (value?: string) => {
  if (!value) return false;
  return !Number.isNaN(new Date(value).getTime());
};

export async function buildWorkOrderWhereCondition(
  params: WorkOrderListParams,
): Promise<Prisma.work_ordersWhereInput> {
  const {
    year,
    projectName,
    productName,
    status,
    workOrderNumber,
    ignoreYearFilter = false,
    keyword,
    ids,
    startDate,
    endDate,
    userContext,
  } = params;

  const {
    start: startOfYear,
    end: endOfYear,
    isCurrentYear,
  } = getYearDateRange(year);

  let whereCondition: Prisma.work_ordersWhereInput = {
    isDeleted: false,
  };

  if (ids && ids.length > 0) {
    whereCondition.workOrderNumber = { in: ids };
  } else {
    const productKeyword = (productName || projectName || '').trim();
    if (productKeyword) {
      whereCondition.projectName = { contains: productKeyword };
    }
    if (workOrderNumber?.trim()) {
      whereCondition.workOrderNumber = { contains: workOrderNumber.trim() };
    }
    if (status?.trim()) {
      whereCondition.status = status.trim() as
        | any
        | Prisma.Enumwork_orders_statusFilter<'work_orders'>;
    }
    const keywordOr = buildKeywordOr(keyword, [
      'workOrderNumber',
      'projectName',
    ] as const);
    if (keywordOr) Object.assign(whereCondition, keywordOr);

    if (!ignoreYearFilter) {
      if (isValidDate(startDate) && isValidDate(endDate)) {
        whereCondition.deliveryDate = {
          gte: new Date(`${startDate}T00:00:00.000Z`),
          lte: new Date(`${endDate}T23:59:59.999Z`),
        };
      } else if (isCurrentYear) {
        whereCondition.AND = [
          {
            OR: [
              { deliveryDate: { gte: startOfYear, lte: endOfYear } },
              {
                deliveryDate: { lt: startOfYear },
                status: {
                  in: [
                    WO_CONSTANTS.STATUS.OPEN,
                    WO_CONSTANTS.STATUS.IN_PROGRESS,
                  ],
                },
              },
            ],
          },
        ];
      } else if (year && year < new Date().getFullYear()) {
        whereCondition.AND = [
          { deliveryDate: { gte: startOfYear, lte: endOfYear } },
          {
            status: {
              notIn: [
                WO_CONSTANTS.STATUS.OPEN,
                WO_CONSTANTS.STATUS.IN_PROGRESS,
              ],
            },
          },
        ];
      } else {
        whereCondition.deliveryDate = { gte: startOfYear, lte: endOfYear };
      }
    }
  }

  if (userContext?.userId) {
    whereCondition = await DataScopeService.buildWorkOrderWhere(
      whereCondition,
      {
        userId: userContext.userId,
        username: userContext.username,
      },
      params.dataScope,
    );
  }
  return whereCondition;
}

export const WorkOrderService = {
  async findQualityLossReference(workOrderNumber: string) {
    return prisma.work_orders.findFirst({
      where: { isDeleted: false, workOrderNumber },
      select: {
        projectId: true,
        projectName: true,
        workOrderNumber: true,
      },
    });
  },

  async countCreatedSince(date: Date, access?: AnalyticsAccessContext) {
    const where = await buildScopedWorkOrderWhere(
      {
        createdAt: { gte: date },
        isDeleted: false,
      },
      access,
    );
    return prisma.work_orders.count({
      where,
    });
  },

  async getWorkspaceWorkOrders(access?: AnalyticsAccessContext) {
    const where = await buildScopedWorkOrderWhere({ isDeleted: false }, access);
    return prisma.work_orders.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      select: {
        createdAt: true,
        customerName: true,
        deliveryDate: true,
        division: true,
        projectName: true,
        status: true,
        workOrderNumber: true,
      },
    });
  },

  async getWarrantySeeds(params: {
    maxDeliveryDate: Date;
    minDeliveryDate: Date;
  }) {
    return prisma.work_orders.findMany({
      select: { deliveryDate: true, division: true, quantity: true },
      where: {
        isDeleted: false,
        deliveryDate: {
          gt: params.minDeliveryDate,
          lte: params.maxDeliveryDate,
        },
      },
    });
  },

  async getStatsForDashboard(
    params: {
      weekStart: Date;
      yearStart: Date;
    },
    access?: AnalyticsAccessContext,
  ): Promise<WorkOrderDashboardSummary> {
    const baseWhere = { isDeleted: false };
    const yearWhere = await buildScopedWorkOrderWhere(
      { ...baseWhere, createdAt: { gte: params.yearStart } },
      access,
    );
    const weekWhere = await buildScopedWorkOrderWhere(
      { ...baseWhere, createdAt: { gte: params.weekStart } },
      access,
    );
    const recentWhere = await buildScopedWorkOrderWhere(baseWhere, access);
    const [yearAggregate, weekCount, recentWorkOrders] = await Promise.all([
      prisma.work_orders.aggregate({
        where: yearWhere,
        _count: { workOrderNumber: true },
      }),
      prisma.work_orders.count({
        where: weekWhere,
      }),
      prisma.work_orders.findMany({
        where: recentWhere,
        take: 5,
        orderBy: { createdAt: 'desc' },
        select: {
          workOrderNumber: true,
          projectName: true,
          status: true,
          customerName: true,
        },
      }),
    ]);

    return {
      totalCount: yearAggregate._count.workOrderNumber || 0,
      weeklyCount: weekCount || 0,
      recentWorkOrders,
    };
  },

  /**
   * 获取工单列表（分页）
   */
  async getList(params: WorkOrderListParams): Promise<WorkOrderListResult> {
    const { skip, take } = parsePagination({
      page: params.page ?? WO_CONSTANTS.DEFAULT_PAGE,
      pageSize: params.pageSize ?? WO_CONSTANTS.DEFAULT_PAGE_SIZE,
    });
    const whereCondition = await buildWorkOrderWhereCondition(params);

    try {
      // 4. 并行查询数据
      const [workOrders, total, summaryData] = await Promise.all([
        prisma.work_orders.findMany({
          where: whereCondition,
          skip,
          take,
          orderBy: { createdAt: 'desc' },
        }),
        prisma.work_orders.count({ where: whereCondition }),
        // governance-allow-direct-canonical-read: summary list reads aggregate labels only.
        prisma.work_orders.findMany({
          where: whereCondition,
          select: {
            division: true,
            quantity: true,
            status: true,
          },
        }),
      ]);

      const items = await mapWorkOrderItems(workOrders);

      const summary: WorkOrderSummaryItem[] = summaryData.map((s) => ({
        status: s.status,
        division: s.division || null,
        quantity: s.quantity || 0,
      }));

      return {
        items,
        total,
        summary,
      };
    } catch (error) {
      logger.error({ err: error, params }, 'getList 执行失败');
      throw error;
    }
  },

  /**
   * Bounded export read (PERF-QMS-001 / PHASE-1A): same filters and DataScope
   * as the interactive list but reads at most EXPORT_QUERY_TAKE rows and
   * never goes through the interactive page-size cap (100).
   */
  async getListForExport(
    params: Omit<WorkOrderListParams, 'page' | 'pageSize'>,
  ): Promise<{ items: WorkOrderItem[]; total: number }> {
    const whereCondition = await buildWorkOrderWhereCondition(params);
    const [workOrders, total] = await Promise.all([
      prisma.work_orders.findMany({
        where: whereCondition,
        orderBy: { createdAt: 'desc' },
        take: EXPORT_QUERY_TAKE,
      }),
      prisma.work_orders.count({ where: whereCondition }),
    ]);
    const items = await mapWorkOrderItems(workOrders);
    return { items, total };
  },

  async getDashboardStats(
    params: Omit<WorkOrderListParams, 'page' | 'pageSize'>,
  ): Promise<WorkOrderDashboardStats> {
    const whereCondition = await buildWorkOrderWhereCondition(params);
    // Database aggregation (PERF-QMS-001 / PHASE-1B): status/division counts
    // and the warranty quantity sums are computed with groupBy so the endpoint
    // never loads every work order into Node. The warranty subset is the same
    // rows getWarrantyStatus() would accept: deliveryDate within the last
    // DEFAULT_WARRANTY_YEARS.
    const warrantyCutoff = addYearsToDate(
      new Date(),
      -WO_CONSTANTS.DEFAULT_WARRANTY_YEARS,
    );
    const [statusGroups, divisionGroups, warrantyGroups] = await Promise.all([
      prisma.work_orders.groupBy({
        by: ['status'],
        where: whereCondition,
        _count: { workOrderNumber: true },
      }),
      prisma.work_orders.groupBy({
        by: ['divisionId'],
        where: whereCondition,
        _count: { workOrderNumber: true },
      }),
      prisma.work_orders.groupBy({
        by: ['divisionId', 'projectId'],
        where: {
          AND: [whereCondition, { deliveryDate: { gte: warrantyCutoff } }],
        },
        _sum: { quantity: true },
      }),
    ]);
    const divisionProjectMap = new Map<null | string, number>();
    const divisionWarrantyMap = new Map<
      null | string,
      { projects: Map<null | string, number>; warrantyCount: number }
    >();
    let total = 0;
    let completed = 0;
    let inProgress = 0;

    for (const group of statusGroups) {
      total += group._count.workOrderNumber;
      const normalizedStatus = String(group.status || '').toUpperCase();
      if (normalizedStatus === 'COMPLETED') {
        completed += group._count.workOrderNumber;
      }
      if (normalizedStatus === 'IN_PROGRESS') {
        inProgress += group._count.workOrderNumber;
      }
    }
    for (const group of divisionGroups) {
      divisionProjectMap.set(
        String(group.divisionId || '').trim() || null,
        group._count.workOrderNumber,
      );
    }
    for (const group of warrantyGroups) {
      const divisionId = String(group.divisionId || '').trim() || null;
      const projectId = String(group.projectId || '').trim() || null;
      const quantity = Number(group._sum.quantity) || 0;
      const current = divisionWarrantyMap.get(divisionId) || {
        projects: new Map<null | string, number>(),
        warrantyCount: 0,
      };
      current.projects.set(
        projectId,
        (current.projects.get(projectId) || 0) + quantity,
      );
      current.warrantyCount += quantity;
      divisionWarrantyMap.set(divisionId, current);
    }

    const [divisionNames, projectNames] = await Promise.all([
      MasterDataGovernanceKernel.resolveCanonicalNamesByIds({
        canonicalIds: [
          ...divisionProjectMap.keys(),
          ...divisionWarrantyMap.keys(),
        ],
        configKey: 'division',
      }),
      MasterDataGovernanceKernel.resolveCanonicalNamesByIds({
        canonicalIds: [...divisionWarrantyMap.values()].flatMap((item) => [
          ...item.projects.keys(),
        ]),
        configKey: 'projectName',
      }),
    ]);

    const pieData = [...divisionProjectMap.entries()]
      .map(([id, value]) =>
        createIdentityAggregateItem({
          canonicalName: id ? divisionNames.get(id) : null,
          id,
          missingName: QMS_DEFAULT_VALUES.UNASSIGNED,
          value,
        }),
      )
      .sort((a, b) => b.value - a.value);

    const rankings = [...divisionWarrantyMap.entries()]
      .map(([divisionId, value]) => ({
        division: createIdentityAggregateItem({
          canonicalName: divisionId ? divisionNames.get(divisionId) : null,
          id: divisionId,
          missingName: QMS_DEFAULT_VALUES.UNASSIGNED,
          value: value.warrantyCount,
        }),
        projects: [...value.projects.entries()]
          .map(([projectId, quantity]) =>
            createIdentityAggregateItem({
              canonicalName: projectId ? projectNames.get(projectId) : null,
              id: projectId,
              value: quantity,
            }),
          )
          .sort((a, b) => a.name.localeCompare(b.name)),
        warrantyCount: value.warrantyCount,
      }))
      .sort((a, b) => b.warrantyCount - a.warrantyCount);

    return {
      total,
      inProgress,
      completed,
      progressPercent: total > 0 ? Math.round((completed / total) * 100) : 0,
      pieData,
      rankings,
    };
  },
};
