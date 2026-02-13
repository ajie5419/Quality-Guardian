import { defineEventHandler, readBody, setResponseStatus } from 'h3';
import { logApiError } from '~/utils/api-logger';
import {
  buildProjectBomCreateData,
  mapProjectBomItem,
  normalizeBomProjectStatus,
  normalizeBomText,
} from '~/utils/bom';
import { MOCK_DELAY } from '~/utils/index';
import { upsertPlanningProjectByWorkOrder } from '~/utils/planning-project';
import prisma from '~/utils/prisma';
import {
  badRequestResponse,
  useResponseError,
  useResponseSuccess,
} from '~/utils/response';

export default defineEventHandler(async (event) => {
  await new Promise((resolve) => setTimeout(resolve, MOCK_DELAY));
  const body = await readBody(event);
  const workOrderNumber = normalizeBomText(body.workOrderNumber);
  if (!workOrderNumber) {
    return badRequestResponse(event, '缺少必填字段: workOrderNumber');
  }

  try {
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
            projectName:
              normalizeBomText(body.projectName) || projectName || value,
            status: normalizeBomProjectStatus(body.status),
          },
        }),
    });

    if (upsertResult.code === 'MISSING_WORK_ORDER') {
      return badRequestResponse(event, '工单不存在');
    }

    const bomProject =
      upsertResult.code === 'CONFLICT'
        ? await prisma.bom_projects.findUnique({
            where: { workOrderNumber },
            select: { id: true },
          })
        : upsertResult.data;
    if (!bomProject) {
      setResponseStatus(event, 500);
      return useResponseError('BOM 项目状态异常');
    }

    const newItem = await prisma.project_boms.create({
      data: buildProjectBomCreateData(workOrderNumber, body),
    });

    return useResponseSuccess({
      ...mapProjectBomItem(newItem),
      projectId: bomProject.id,
    });
  } catch (error) {
    logApiError('bom', error);
    setResponseStatus(event, 500);
    return useResponseError('添加物料失败');
  }
});
