import type {
  WorkOrderItem,
  WorkOrderListResult,
  WorkOrderSummaryItem,
} from '@qgs/shared';

import { Prisma } from '@prisma/client';
import { createModuleLogger } from '~/utils/logger';
import prisma from '~/utils/prisma';
import { addYearsToDate } from '~/utils/work-order';
import {
  mapToDisplayStatus,
  WORK_ORDER_STATUS,
} from '~/utils/work-order-status';

import { formatDateString } from './base.service';
import { DataScopeService } from './data-scope.service';

// 创建模块级 logger
const logger = createModuleLogger('WorkOrderService');

// 抽离常量
const WO_CONSTANTS = {
  DEFAULT_PAGE: 1,
  DEFAULT_PAGE_SIZE: 20,
  DEFAULT_WARRANTY_YEARS: 1,
  STATUS: WORK_ORDER_STATUS,
};

const getWarrantyStatus = (deliveryDate: Date | null) => {
  if (!deliveryDate) {
    return '否';
  }
  const expiryDate = addYearsToDate(
    deliveryDate,
    WO_CONSTANTS.DEFAULT_WARRANTY_YEARS,
  );
  return new Date() <= expiryDate ? '是' : '否';
};

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

interface WorkOrderListParams {
  page?: number;
  pageSize?: number;
  granularity?: string;
  startDate?: string;
  endDate?: string;
  productName?: string;
  year?: number;
  projectName?: string;
  status?: string;
  workOrderNumber?: string;
  ignoreYearFilter?: boolean;
  keyword?: string;
  ids?: string[];
  userContext?: { userId: string; username?: string };
}

type WorkOrderDashboardStats = {
  completed: number;
  inProgress: number;
  pieData: Array<{ name: string; value: number }>;
  progressPercent: number;
  rankings: Array<{
    division: string;
    productName: string;
    warrantyCount: number;
  }>;
  total: number;
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
    if (keyword?.trim()) {
      whereCondition.OR = [
        { workOrderNumber: { contains: keyword.trim() } },
        { projectName: { contains: keyword.trim() } },
      ];
    }

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
    );
  }
  return whereCondition;
}

export const WorkOrderService = {
  /**
   * 获取工单列表（分页）
   */
  async getList(params: WorkOrderListParams): Promise<WorkOrderListResult> {
    const {
      page = WO_CONSTANTS.DEFAULT_PAGE,
      pageSize = WO_CONSTANTS.DEFAULT_PAGE_SIZE,
    } = params;
    const whereCondition = await buildWorkOrderWhereCondition(params);

    try {
      // 4. 并行查询数据
      const [workOrders, total, summaryData] = await Promise.all([
        prisma.work_orders.findMany({
          where: whereCondition,
          skip: (page - 1) * pageSize,
          take: pageSize,
          orderBy: { createdAt: 'desc' },
        }),
        prisma.work_orders.count({ where: whereCondition }),
        prisma.work_orders.findMany({
          where: whereCondition,
          select: {
            status: true,
            division: true,
            quantity: true,
          },
        }),
      ]);

      const workOrderNumbers = workOrders
        .map((item) => String(item.workOrderNumber || '').trim())
        .filter(Boolean);
      const requirementRows =
        workOrderNumbers.length > 0
          ? await prisma.work_order_requirements.findMany({
              where: {
                isDeleted: false,
                status: 'active',
                workOrderNumber: { in: workOrderNumbers },
              },
              select: {
                confirmStatus: true,
                createdAt: true,
                workOrderNumber: true,
              },
            })
          : [];
      const requirementSummaryMap = buildRequirementSummaryMap(requirementRows);

      // 5. 数据映射与返回
      const items: WorkOrderItem[] = workOrders.map((wo) => {
        const requirementSummary = requirementSummaryMap.get(
          wo.workOrderNumber,
        ) || {
          confirmedRequirements: 0,
          overdueUnconfirmedRequirements: 0,
          plannedRequirements: 0,
        };
        return {
          ...wo,
          confirmedRequirements: requirementSummary.confirmedRequirements,
          id: wo.workOrderNumber,
          deliveryDate: formatDateString(wo.deliveryDate),
          effectiveTime: formatDateString(wo.effectiveTime),
          createTime: wo.createdAt ? wo.createdAt.toISOString() : null,
          overdueUnconfirmedRequirements:
            requirementSummary.overdueUnconfirmedRequirements,
          plannedRequirements: requirementSummary.plannedRequirements,
          status: mapToDisplayStatus(wo.status),
          warrantyStatus: getWarrantyStatus(wo.deliveryDate),
          projectName: wo.projectName || null,
          customerName: wo.customerName || null,
          division: wo.division || null,
          quantity: wo.quantity || 0,
        };
      });

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

  async getDashboardStats(
    params: Omit<WorkOrderListParams, 'page' | 'pageSize'>,
  ): Promise<WorkOrderDashboardStats> {
    const whereCondition = await buildWorkOrderWhereCondition(params);
    const summary = await prisma.work_orders.findMany({
      where: whereCondition,
      select: {
        status: true,
        division: true,
        quantity: true,
        projectName: true,
        deliveryDate: true,
      },
    });
    const divisionProjectMap = new Map<string, number>();
    const divisionProductWarrantyMap = new Map<string, number>();
    let total = 0;
    let completed = 0;
    let inProgress = 0;

    for (const item of summary) {
      total += 1;
      const normalizedStatus = String(item.status || '').toUpperCase();
      if (normalizedStatus === 'COMPLETED') completed += 1;
      if (normalizedStatus === 'IN_PROGRESS') inProgress += 1;

      const division = String(item.division || '其他').trim() || '其他';
      const productName =
        String(item.projectName || '未命名产品').trim() || '未命名产品';
      const quantity = Number(item.quantity) || 0;
      divisionProjectMap.set(
        division,
        (divisionProjectMap.get(division) || 0) + 1,
      );
      if (getWarrantyStatus(item.deliveryDate) === '是') {
        const rankingKey = `${division}__${productName}`;
        divisionProductWarrantyMap.set(
          rankingKey,
          (divisionProductWarrantyMap.get(rankingKey) || 0) + quantity,
        );
      }
    }

    const pieData = [...divisionProjectMap.entries()]
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);

    const rankings = [...divisionProductWarrantyMap.entries()]
      .map(([rankingKey, warrantyCount]) => {
        const [division, productName] = rankingKey.split('__');
        return {
          division: division || '其他',
          productName: productName || '未命名产品',
          warrantyCount,
        };
      })
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

  async getRequirementOverview(
    params: Omit<WorkOrderListParams, 'page' | 'pageSize'>,
  ) {
    const workOrderWhere = await buildWorkOrderWhereCondition(params);
    const requirementWhere: Prisma.work_order_requirementsWhereInput = {
      isDeleted: false,
      status: 'active',
      work_order: workOrderWhere,
    };
    const overdueDate = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);

    const [
      plannedRequirements,
      confirmedRequirements,
      overdueUnconfirmedRequirements,
    ] = await Promise.all([
      prisma.work_order_requirements.count({
        where: requirementWhere,
      }),
      prisma.work_order_requirements.count({
        where: {
          ...requirementWhere,
          confirmStatus: 'CONFIRMED',
        },
      }),
      prisma.work_order_requirements.count({
        where: {
          ...requirementWhere,
          NOT: { confirmStatus: 'CONFIRMED' },
          createdAt: { lt: overdueDate },
        },
      }),
    ]);

    return {
      confirmedRequirements,
      overdueUnconfirmedRequirements,
      pendingRequirements: Math.max(
        plannedRequirements - confirmedRequirements,
        0,
      ),
      plannedRequirements,
    };
  },

  async getRequirementBoard(
    params: Omit<WorkOrderListParams, 'ids'> & {
      filter?: 'all' | 'confirmed' | 'overdue' | 'pending';
    },
  ) {
    const {
      page = WO_CONSTANTS.DEFAULT_PAGE,
      pageSize = WO_CONSTANTS.DEFAULT_PAGE_SIZE,
      filter = 'all',
    } = params;
    const workOrderWhere = await buildWorkOrderWhereCondition(params);
    const overdueDate = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);
    const where: Prisma.work_order_requirementsWhereInput = {
      isDeleted: false,
      status: 'active',
      work_order: workOrderWhere,
    };

    switch (filter) {
      case 'confirmed': {
        where.confirmStatus = 'CONFIRMED';
        break;
      }
      case 'overdue': {
        where.NOT = { confirmStatus: 'CONFIRMED' };
        where.createdAt = { lt: overdueDate };
        break;
      }
      case 'pending': {
        where.NOT = { confirmStatus: 'CONFIRMED' };
        break;
      }
      default: {
        break;
      }
    }

    const [items, total] = await Promise.all([
      prisma.work_order_requirements.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: [{ createdAt: 'desc' }],
        select: {
          attachment: true,
          confirmer: true,
          confirmedAt: true,
          confirmStatus: true,
          createdAt: true,
          id: true,
          partName: true,
          processName: true,
          requirementName: true,
          responsiblePerson: true,
          responsibleTeam: true,
          workOrderNumber: true,
          work_order: {
            select: {
              customerName: true,
              division: true,
              projectName: true,
              status: true,
            },
          },
        },
      }),
      prisma.work_order_requirements.count({ where }),
    ]);

    return {
      items,
      total,
    };
  },
};

function buildRequirementSummaryMap(
  rows: Array<{
    confirmStatus: string;
    createdAt: Date;
    workOrderNumber: string;
  }>,
) {
  const result = new Map<
    string,
    {
      confirmedRequirements: number;
      overdueUnconfirmedRequirements: number;
      plannedRequirements: number;
    }
  >();
  const now = Date.now();
  const tenDaysMs = 10 * 24 * 60 * 60 * 1000;

  for (const row of rows) {
    const workOrderNumber = String(row.workOrderNumber || '').trim();
    if (!workOrderNumber) continue;
    const current = result.get(workOrderNumber) || {
      confirmedRequirements: 0,
      overdueUnconfirmedRequirements: 0,
      plannedRequirements: 0,
    };
    current.plannedRequirements += 1;

    const confirmStatus = String(row.confirmStatus || '')
      .trim()
      .toUpperCase();
    if (confirmStatus === 'CONFIRMED') {
      current.confirmedRequirements += 1;
    } else if (now - new Date(row.createdAt).getTime() > tenDaysMs) {
      current.overdueUnconfirmedRequirements += 1;
    }
    result.set(workOrderNumber, current);
  }

  return result;
}
