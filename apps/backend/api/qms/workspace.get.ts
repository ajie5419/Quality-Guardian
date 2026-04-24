import { defineEventHandler } from 'h3';
import { logApiError } from '~/utils/api-logger';
import { verifyAccessToken } from '~/utils/jwt-utils';
import prisma from '~/utils/prisma';
import {
  internalServerErrorResponse,
  unAuthorizedResponse,
  useResponseSuccess,
} from '~/utils/response';
import { buildRequirementSummaryMap } from '~/utils/work-order-requirement-summary';

export default defineEventHandler(async (event) => {
  const userinfo = await verifyAccessToken(event);
  if (!userinfo) {
    return unAuthorizedResponse(event);
  }

  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Run queries in parallel
    const [
      workOrders,
      openIssues,
      todayWorkOrders,
      todayInspections,
      todayIssues,
      openIssuesCount,
      recentIssues,
    ] = await Promise.all([
      // 1. 获取所有工单（实际工单数据）
      prisma.work_orders.findMany({
        where: { isDeleted: false },
        take: 6,
        orderBy: { createdAt: 'desc' },
      }),
      // 2. 获取未关闭的工程问题
      prisma.quality_records.findMany({
        where: { status: 'OPEN', isDeleted: false },
        take: 5,
        orderBy: { createdAt: 'desc' },
      }),
      // 3. 今日统计
      prisma.work_orders.count({
        where: { createdAt: { gte: today }, isDeleted: false },
      }),
      prisma.inspections.count({
        where: { createdAt: { gte: today }, isDeleted: false },
      }),
      prisma.quality_records.count({
        where: { createdAt: { gte: today }, isDeleted: false },
      }),
      prisma.quality_records.count({
        where: { status: 'OPEN', isDeleted: false },
      }),
      // 4. 最近的问题记录
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
    const projectItems = workOrders.map((wo) => {
      let color = '#999';
      if (wo.status === 'IN_PROGRESS') {
        color = '#1890ff';
      } else if (wo.status === 'COMPLETED') {
        color = '#52c41a';
      }
      const summary = requirementSummaryMap.get(wo.workOrderNumber) || {
        confirmedRequirements: 0,
        overdueUnconfirmedRequirements: 0,
        plannedRequirements: 0,
      };

      return {
        id: wo.workOrderNumber,
        title: wo.workOrderNumber,
        content: wo.projectName || wo.customerName,
        group: wo.division || '未分配',
        date: wo.createdAt
          ? new Date(wo.createdAt).toLocaleDateString('zh-CN')
          : '',
        plannedRequirements: summary.plannedRequirements,
        confirmedRequirements: summary.confirmedRequirements,
        overdueUnconfirmedRequirements: summary.overdueUnconfirmedRequirements,
        color,
        icon: 'lucide:clipboard-list',
        url: '/qms/work-order',
      };
    });

    const todoItems = openIssues.map((issue) => ({
      id: issue.id,
      title: `[${issue.workOrderNumber || '无工单'}] ${issue.partName}`,
      content: issue.description || '',
      date: issue.createdAt
        ? new Date(issue.createdAt).toLocaleString('zh-CN')
        : '',
      completed: issue.status === 'CLOSED',
    }));

    const trendItems = recentIssues.map((issue) => ({
      avatar: 'svg:avatar-1',
      title: issue.inspector || '系统',
      content: `${issue.status === 'CLOSED' ? '关闭' : '创建'}了问题 <a>${issue.partName}</a>`,
      date: issue.createdAt ? formatRelativeTime(issue.createdAt) : '',
    }));

    return useResponseSuccess({
      projectItems,
      todoItems,
      trendItems,
      stats: {
        todayWorkOrders,
        todayInspections,
        todayIssues,
        openIssuesCount,
      },
    });
  } catch (error) {
    logApiError('workspace', error);
    return internalServerErrorResponse(event, 'Failed to fetch workspace data');
  }
});

function formatRelativeTime(date: Date | string): string {
  const now = new Date();
  const d = new Date(date);
  const diff = now.getTime() - d.getTime();
  const minutes = Math.floor(diff / 60_000);
  const hours = Math.floor(diff / 3_600_000);
  const days = Math.floor(diff / 86_400_000);
  if (minutes < 1) return '刚刚';
  if (minutes < 60) return `${minutes}分钟前`;
  if (hours < 24) return `${hours}小时前`;
  if (days < 7) return `${days}天前`;
  return d.toLocaleDateString('zh-CN');
}
