import { defineEventHandler, getQuery } from 'h3';
import { logApiError } from '~/utils/api-logger';
import prisma from '~/utils/prisma';
import {
  internalServerErrorResponse,
  useResponseSuccess,
} from '~/utils/response';
import { parseWorkOrderListQuery } from '~/utils/work-order';

export default defineEventHandler(async (event) => {
  const query = getQuery(event) as Record<string, unknown>;
  const params = parseWorkOrderListQuery({
    ...query,
    ignoreYearFilter: true,
    pageSize: query.pageSize || 20,
  });

  try {
    const where = {
      isDeleted: false,
      ...(params.keyword
        ? {
            OR: [
              { workOrderNumber: { contains: params.keyword } },
              { projectName: { contains: params.keyword } },
            ],
          }
        : (params.workOrderNumber
          ? { workOrderNumber: { contains: params.workOrderNumber } }
          : {})),
    };
    const [items, total] = await Promise.all([
      prisma.work_orders.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (params.page - 1) * params.pageSize,
        take: params.pageSize,
        select: {
          projectName: true,
          quantity: true,
          status: true,
          workOrderNumber: true,
        },
      }),
      prisma.work_orders.count({ where }),
    ]);
    return useResponseSuccess({
      items: items.map((item) => ({
        createTime: null,
        customerName: null,
        deliveryDate: null,
        id: item.workOrderNumber,
        projectName: item.projectName || null,
        quantity: item.quantity || 0,
        status: item.status,
        workOrderNumber: item.workOrderNumber,
      })),
      total,
    });
  } catch (error) {
    logApiError('public-inspection-request-work-order-list', error);
    return internalServerErrorResponse(event, '获取工单列表失败');
  }
});
