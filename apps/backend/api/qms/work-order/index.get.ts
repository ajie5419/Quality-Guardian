import { defineEventHandler, getQuery } from 'h3';
import { verifyAccessToken } from '~/utils/jwt-utils';
import prisma from '~/utils/prisma';
import { unAuthorizedResponse, useResponseSuccess } from '~/utils/response';

export default defineEventHandler(async (event) => {
  const userinfo = verifyAccessToken(event);
  if (!userinfo) {
    return unAuthorizedResponse(event);
  }

  // 获取分页与过滤参数
  const query = getQuery(event);
  const page = Number.parseInt(String(query.page || 1));
  const pageSize = Number.parseInt(String(query.pageSize || 20));
  const year = query.year;
  const projectName = query.projectName ? String(query.projectName) : undefined;
  const statusFilter = query.status ? String(query.status) : undefined;
  const workOrderNumber = query.workOrderNumber
    ? String(query.workOrderNumber)
    : undefined;

  // 年份过滤逻辑
  const now = new Date();
  const actualCurrentYear = now.getFullYear(); // 动态获取当前系统年份
  const selectedYear = year ? Number.parseInt(String(year)) : actualCurrentYear;

  const startOfSelectedYear = new Date(`${selectedYear}-01-01T00:00:00.000Z`);
  const endOfSelectedYear = new Date(`${selectedYear}-12-31T23:59:59.999Z`);

  try {
    // 基础查询条件
    const whereCondition: any = {
      isDeleted: false,
      ...(projectName && projectName.trim() !== ''
        ? { projectName: { contains: projectName.trim() } }
        : {}),
      ...(workOrderNumber && workOrderNumber.trim() !== ''
        ? { workOrderNumber: { contains: workOrderNumber.trim() } }
        : {}),
      ...(statusFilter && statusFilter.trim() !== ''
        ? { status: statusFilter.trim() }
        : {}),
    };

    /**
     * 动态跨年展示逻辑实现：
     * 1. 结转逻辑：只有“未开始” (OPEN) 和 “进行中” (IN_PROGRESS) 的工单会结转到【当前年份】。
     * 2. 归口逻辑：已完成 (COMPLETED) 或已取消的工单始终留在其【计划交期年份】页面。
     */
    if (selectedYear === actualCurrentYear) {
      // 场景 A: 查看【当前年份】页面
      whereCondition.AND = [
        {
          OR: [
            // 1. 计划交期就在本年的工单 (无论什么状态)
            {
              deliveryDate: {
                gte: startOfSelectedYear,
                lte: endOfSelectedYear,
              },
            },
            // 2. 计划交期在往年，但目前仍未完成的工单 (跨年结转)
            {
              deliveryDate: { lt: startOfSelectedYear },
              status: { in: ['OPEN', 'IN_PROGRESS'] },
            },
          ],
        },
      ];
    } else if (selectedYear < actualCurrentYear) {
      // 场景 B: 查看【历史年份】页面
      whereCondition.AND = [
        { deliveryDate: { gte: startOfSelectedYear, lte: endOfSelectedYear } },
        {
          // 排除掉那些已经结转到当前年的活跃工单（即：只显示该年已完成或已取消的）
          status: { notIn: ['OPEN', 'IN_PROGRESS'] },
        },
      ];
    } else {
      // 场景 C: 查看【未来年份】页面 (仅显示该年计划)
      whereCondition.deliveryDate = {
        gte: startOfSelectedYear,
        lte: endOfSelectedYear,
      };
    }

    // 1. 获取当前页列表
    // 2. 获取总数
    // 3. 获取全量概要数据（用于仪表盘统计，仅拉取必要字段以节省 RDS 资源）
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

    // 数据映射与状态转换
    const items = workOrders.map((wo) => {
      let displayStatus = '未开始';
      if (wo.status === 'COMPLETED') {
        displayStatus = '已完成';
      } else if (wo.status === 'IN_PROGRESS') {
        displayStatus = '进行中';
      }

      return {
        ...wo,
        id: wo.workOrderNumber,
        deliveryDate: wo.deliveryDate
          ? wo.deliveryDate.toISOString().split('T')[0]
          : null,
        effectiveTime: wo.effectiveTime
          ? wo.effectiveTime.toISOString().split('T')[0]
          : null,
        createTime: wo.createdAt
          ? wo.createdAt.toISOString().replace('T', ' ').split('.')[0]
          : null,
        status: displayStatus,
      };
    });

    // 返回结构包含 summary 用于前端仪表盘计算
    return useResponseSuccess({
      items,
      total,
      summary: summaryData, // 确保仪表盘在分页情况下依然能展示全量统计
    });
  } catch (error) {
    console.error('Failed to fetch work orders with pagination:', error);
    return useResponseSuccess({ items: [], total: 0, summary: [] });
  }
});
