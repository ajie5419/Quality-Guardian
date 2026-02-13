import { defineEventHandler, setResponseStatus } from 'h3';
import { logApiError } from '~/utils/api-logger';
import { verifyAccessToken } from '~/utils/jwt-utils';
import prisma from '~/utils/prisma';
import {
  unAuthorizedResponse,
  useResponseError,
  useResponseSuccess,
} from '~/utils/response';

export default defineEventHandler(async (event) => {
  const userinfo = await verifyAccessToken(event);
  if (!userinfo) return unAuthorizedResponse(event);

  try {
    const projects = await prisma.doc_projects.findMany({
      where: { isDeleted: false },
      include: {
        work_order: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    const result = projects.map((p) => ({
      id: p.id,
      workOrderNumber: p.workOrderNumber,
      projectName: p.projectName,
      status: p.status,
      customerName: p.work_order.customerName,
      division: p.work_order.division,
      deliveryDate: p.work_order.deliveryDate,
    }));

    return useResponseSuccess(result);
  } catch (error) {
    logApiError('project-docs-projects', error);
    setResponseStatus(event, 500);
    return useResponseError('获取项目资料列表失败');
  }
});
