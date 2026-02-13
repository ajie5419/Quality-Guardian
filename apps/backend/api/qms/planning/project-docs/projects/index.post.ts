import { defineEventHandler, readBody, setResponseStatus } from 'h3';
import { logApiError } from '~/utils/api-logger';
import { verifyAccessToken } from '~/utils/jwt-utils';
import prisma from '~/utils/prisma';
import {
  unAuthorizedResponse,
  useResponseError,
  useResponseSuccess,
} from '~/utils/response';

export default defineEventHandler(async (event) => {
  const userinfo = verifyAccessToken(event);
  if (!userinfo) return unAuthorizedResponse(event);

  try {
    const body = await readBody(event);
    const workOrderNumber = String(body.workOrderNumber ?? '').trim();

    if (!workOrderNumber) {
      setResponseStatus(event, 400);
      return useResponseError('工单号不能为空');
    }

    const wo = await prisma.work_orders.findUnique({
      where: { workOrderNumber },
    });

    if (!wo) {
      setResponseStatus(event, 400);
      return useResponseError('工单不存在');
    }

    const existing = await prisma.doc_projects.findUnique({
      where: { workOrderNumber },
    });

    if (existing) {
      if (existing.isDeleted) {
        const restored = await prisma.doc_projects.update({
          where: { id: existing.id },
          data: { isDeleted: false, updatedAt: new Date() },
        });
        return useResponseSuccess(restored);
      }
      setResponseStatus(event, 409);
      return useResponseError('该工单已在项目资料列表中');
    }

    const newProject = await prisma.doc_projects.create({
      data: {
        workOrderNumber,
        projectName: wo.projectName || workOrderNumber,
        status: 'active',
      },
    });

    return useResponseSuccess(newProject);
  } catch (error) {
    logApiError('project-docs-projects', error);
    setResponseStatus(event, 500);
    return useResponseError('添加项目资料失败');
  }
});
