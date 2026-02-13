import { defineEventHandler, readBody, setResponseStatus } from 'h3';
import { logApiError } from '~/utils/api-logger';
import { normalizeBomProjectStatus, normalizeBomText } from '~/utils/bom';
import { verifyAccessToken } from '~/utils/jwt-utils';
import { upsertPlanningProjectByWorkOrder } from '~/utils/planning-project';
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
    const workOrderNumber = normalizeBomText(body.workOrderNumber);

    if (!workOrderNumber) {
      setResponseStatus(event, 400);
      return useResponseError('工单号不能为空');
    }

    const upsertResult = await upsertPlanningProjectByWorkOrder({
      workOrderNumber,
      findExistingByWorkOrderNumber: (value) =>
        prisma.bom_projects.findUnique({
          where: { workOrderNumber: value },
          select: { id: true, isDeleted: true },
        }),
      restoreProjectById: (id) =>
        prisma.bom_projects.update({
          where: { id },
          data: { isDeleted: false, updatedAt: new Date() },
        }),
      createProject: ({ projectName, workOrderNumber: value }) =>
        prisma.bom_projects.create({
          data: {
            workOrderNumber: value,
            projectName,
            status: normalizeBomProjectStatus(body.status),
          },
        }),
    });

    if (upsertResult.code === 'MISSING_WORK_ORDER') {
      setResponseStatus(event, 400);
      return useResponseError('工单不存在');
    }
    if (upsertResult.code === 'CONFLICT') {
      setResponseStatus(event, 409);
      return useResponseError('该工单已在 BOM 策划列表中');
    }

    return useResponseSuccess(upsertResult.data);
  } catch (error) {
    logApiError('bom-projects', error);
    setResponseStatus(event, 500);
    return useResponseError('添加 BOM 项目失败');
  }
});
