import type {
  WorkOrderItem,
  WorkOrderListResult,
  WorkOrderSummaryItem,
} from '@qgs/shared';

import { Prisma } from '@prisma/client';
import { createModuleLogger } from '~/utils/logger';
import prisma from '~/utils/prisma';
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
  STATUS: WORK_ORDER_STATUS,
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
  rankings: Array<{ division: string; totalQuantity: number }>;
  total: number;
};

export const WorkOrderService = {
  /**
   * 获取工单列表（分页）
   */
  async getList(params: WorkOrderListParams): Promise<WorkOrderListResult> {
    const {
      page = WO_CONSTANTS.DEFAULT_PAGE,
      pageSize = WO_CONSTANTS.DEFAULT_PAGE_SIZE,
      year,
      projectName,
      status,
      workOrderNumber,
      ignoreYearFilter = false,
      keyword,
      ids,
    } = params;

    // 1. 获取时间范围
    const {
      start: startOfYear,
      end: endOfYear,
      isCurrentYear,
    } = getYearDateRange(year);

    // 2. 构建基础查询条件
    let whereCondition: Prisma.work_ordersWhereInput = {
      isDeleted: false,
    };

    // 2.1 精确 ID 查找 (最高优先级，用于回显)
    if (ids && ids.length > 0) {
      whereCondition.workOrderNumber = { in: ids };
    } else {
      // 常规过滤
      if (projectName?.trim()) {
        whereCondition.projectName = { contains: projectName.trim() };
      }
      if (workOrderNumber?.trim()) {
        whereCondition.workOrderNumber = { contains: workOrderNumber.trim() };
      }
      if (status?.trim()) {
        whereCondition.status = status.trim() as
          | any
          | Prisma.Enumwork_orders_statusFilter<'work_orders'>;
      }

      // 2.2 综合搜索
      if (keyword?.trim()) {
        whereCondition.OR = [
          { workOrderNumber: { contains: keyword.trim() } },
          { projectName: { contains: keyword.trim() } },
        ];
      }

      // 3. 应用跨年逻辑 (仅在不忽略年份过滤时应用)
      if (!ignoreYearFilter) {
        if (isCurrentYear) {
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

    if (params.userContext?.userId) {
      whereCondition = await DataScopeService.buildWorkOrderWhere(
        whereCondition,
        {
          userId: params.userContext.userId,
          username: params.userContext.username,
        },
      );
    }

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

      // 5. 数据映射与返回
      const items: WorkOrderItem[] = workOrders.map((wo) => {
        return {
          ...wo,
          id: wo.workOrderNumber,
          deliveryDate: formatDateString(wo.deliveryDate),
          effectiveTime: formatDateString(wo.effectiveTime),
          createTime: wo.createdAt ? wo.createdAt.toISOString() : null,
          status: mapToDisplayStatus(wo.status),
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
    const listResult = await this.getList({
      ...params,
      page: 1,
      pageSize: 1,
    });
    const summary = listResult.summary || [];

    const divisionProjectMap = new Map<string, number>();
    const divisionQuantityMap = new Map<string, number>();
    let total = 0;
    let completed = 0;
    let inProgress = 0;

    for (const item of summary) {
      total += 1;
      const normalizedStatus = String(item.status || '').toUpperCase();
      if (normalizedStatus === 'COMPLETED') completed += 1;
      if (normalizedStatus === 'IN_PROGRESS') inProgress += 1;

      const division = String(item.division || '其他').trim() || '其他';
      const quantity = Number(item.quantity) || 0;
      divisionProjectMap.set(
        division,
        (divisionProjectMap.get(division) || 0) + 1,
      );
      divisionQuantityMap.set(
        division,
        (divisionQuantityMap.get(division) || 0) + quantity,
      );
    }

    const pieData = [...divisionProjectMap.entries()]
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);

    const rankings = [...divisionQuantityMap.entries()]
      .map(([division, totalQuantity]) => ({ division, totalQuantity }))
      .sort((a, b) => b.totalQuantity - a.totalQuantity);

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
