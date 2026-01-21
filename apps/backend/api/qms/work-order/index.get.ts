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
  let dateFilter: Record<string, Date> | undefined;
  if (year) {
    const y = Number.parseInt(String(year));
    dateFilter = {
      gte: new Date(`${y}-01-01T00:00:00.000Z`),
      lte: new Date(`${y}-12-31T23:59:59.999Z`),
    };
  }

  try {
    // 构造查询条件
    const whereCondition: any = {
      isDeleted: false,
      ...(dateFilter ? { deliveryDate: dateFilter } : {}),
      ...(projectName ? { projectName: { contains: projectName } } : {}),
      ...(workOrderNumber
        ? { workOrderNumber: { contains: workOrderNumber } }
        : {}),
      ...(statusFilter ? { status: statusFilter } : {}),
    };

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
