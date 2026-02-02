import { createModuleLogger } from '~/utils/logger';
import prisma from '~/utils/prisma';
import {
  mapToDisplayStatus,
  WORK_ORDER_STATUS,
} from '~/utils/work-order-status';

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
  page: number;
  pageSize: number;
  year?: number;
  projectName?: string;
  status?: string;
  workOrderNumber?: string;
  ignoreYearFilter?: boolean; // 新增参数：是否忽略年份过滤
  keyword?: string; // 新增参数：综合搜索关键词
  ids?: string[]; // 新增参数：用于精确查找一组 ID（回显）
}

export const WorkOrderService = {
  async getList(params: WorkOrderListParams) {
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

    try {
      // 1. 获取时间范围
      const {
        start: startOfYear,
        end: endOfYear,
        isCurrentYear,
      } = getYearDateRange(year);

      // 2. 构建基础查询条件
      const whereCondition: any = {
        isDeleted: false,
      };

      // 2.1 精确 ID 查找 (最高优先级，用于回显)
      if (ids && ids.length > 0) {
        whereCondition.workOrderNumber = { in: ids };
        // 忽略其他所有过滤条件
      } else {
        // 常规过滤
        if (projectName?.trim())
          whereCondition.projectName = { contains: projectName.trim() };
        if (workOrderNumber?.trim())
          whereCondition.workOrderNumber = { contains: workOrderNumber.trim() };
        if (status?.trim()) whereCondition.status = status.trim();

        // 2.2 综合搜索
        if (keyword?.trim()) {
          whereCondition.OR = [
            { workOrderNumber: { contains: keyword.trim() } },
            { projectName: { contains: keyword.trim() } },
          ];
        }

        // 3. 应用跨年逻辑 (仅在不忽略年份过滤时应用)
        if (!ignoreYearFilter) {
          // ... (existing logic)
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
      const items = workOrders.map((wo) => {
        return {
          ...wo,
          id: wo.workOrderNumber,
          deliveryDate: wo.deliveryDate
            ? wo.deliveryDate.toISOString().split('T')[0]
            : null,
          effectiveTime: wo.effectiveTime
            ? wo.effectiveTime.toISOString().split('T')[0]
            : null,
          // 转换为本地时间格式：YYYY-MM-DD HH:mm:ss
          createTime: wo.createdAt
            ? wo.createdAt
                .toLocaleString('zh-CN', {
                  year: 'numeric',
                  month: '2-digit',
                  day: '2-digit',
                  hour: '2-digit',
                  minute: '2-digit',
                  second: '2-digit',
                  hour12: false,
                })
                .replaceAll('/', '-')
            : null,
          status: mapToDisplayStatus(wo.status),
        };
      });

      return {
        items,
        total,
        summary: summaryData,
      };
    } catch (error) {
      logger.error({ err: error }, 'getList 执行失败');
      // 异常兜底
      return {
        items: [],
        total: 0,
        summary: [],
      };
    }
  },
};
