import { defineEventHandler, getQuery } from 'h3';
import { logApiError } from '~/utils/api-logger';
import prisma from '~/utils/prisma';
import {
  badRequestResponse,
  internalServerErrorResponse,
  useResponseSuccess,
} from '~/utils/response';

export default defineEventHandler(async (event) => {
  const query = getQuery(event);
  const workOrderNumber = String(query.workOrderNumber || '').trim();
  if (!workOrderNumber) {
    return badRequestResponse(event, '工单号不能为空');
  }

  try {
    const list = await prisma.work_order_requirements.findMany({
      where: {
        isDeleted: false,
        status: 'active',
        workOrderNumber,
      },
      orderBy: [{ updatedAt: 'desc' }],
      select: { processName: true },
    });

    const processNames = [...new Set(
      list.map((item) => String(item.processName || '').trim()).filter(Boolean),
    )];
    return useResponseSuccess(
      processNames.map((processName) => ({ processName })),
    );
  } catch (error) {
    logApiError('public-inspection-request-process-list', error);
    return internalServerErrorResponse(event, '获取工单工序失败');
  }
});
