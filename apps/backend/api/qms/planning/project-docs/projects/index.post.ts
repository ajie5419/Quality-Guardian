import { defineEventHandler, readBody, setResponseStatus } from 'h3';
import { logApiError } from '~/utils/api-logger';
import { verifyAccessToken } from '~/utils/jwt-utils';
import {
  normalizePlanningWorkOrderNumber,
  upsertPlanningProjectByWorkOrder,
} from '~/utils/planning-project';
import prisma from '~/utils/prisma';
import { getMissingRequiredFields } from '~/utils/request-validation';
import {
  badRequestResponse,
  unAuthorizedResponse,
  useResponseError,
  useResponseSuccess,
} from '~/utils/response';

export default defineEventHandler(async (event) => {
  const userinfo = verifyAccessToken(event);
  if (!userinfo) return unAuthorizedResponse(event);

  try {
    const body = await readBody(event);
    const workOrderNumber = normalizePlanningWorkOrderNumber(
      body.workOrderNumber,
    );

    const missingFields = getMissingRequiredFields({ workOrderNumber }, [
      'workOrderNumber',
    ]);
    if (missingFields.length > 0) {
      return badRequestResponse(event, '工单号不能为空');
    }

    const upsertResult = await upsertPlanningProjectByWorkOrder({
      workOrderNumber,
      findExistingByWorkOrderNumber: (value) =>
        prisma.doc_projects.findUnique({
          where: { workOrderNumber: value },
          select: { id: true, isDeleted: true },
        }),
      restoreProjectById: (id) =>
        prisma.doc_projects.update({
          where: { id },
          data: { isDeleted: false, updatedAt: new Date() },
        }),
      createProject: ({ projectName, workOrderNumber: value }) =>
        prisma.doc_projects.create({
          data: {
            workOrderNumber: value,
            projectName,
            status: 'active',
          },
        }),
    });

    if (upsertResult.code === 'MISSING_WORK_ORDER') {
      return badRequestResponse(event, '工单不存在');
    }
    if (upsertResult.code === 'CONFLICT') {
      setResponseStatus(event, 409);
      return useResponseError('该工单已在项目资料列表中');
    }

    return useResponseSuccess(upsertResult.data);
  } catch (error) {
    logApiError('project-docs-projects', error);
    setResponseStatus(event, 500);
    return useResponseError('添加项目资料失败');
  }
});
