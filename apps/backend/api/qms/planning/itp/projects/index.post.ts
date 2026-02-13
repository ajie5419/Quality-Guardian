import { defineEventHandler, readBody, setResponseStatus } from 'h3';
import { logApiError } from '~/utils/api-logger';
import { MOCK_DELAY } from '~/utils/index';
import {
  createItpProjectId,
  normalizeItpPlanStatus,
  normalizeItpText,
} from '~/utils/itp';
import prisma from '~/utils/prisma';
import { useResponseError, useResponseSuccess } from '~/utils/response';

export default defineEventHandler(async (event) => {
  await new Promise((resolve) => setTimeout(resolve, MOCK_DELAY));
  const body = await readBody(event);
  const projectName = normalizeItpText(body.projectName);
  if (!projectName) {
    setResponseStatus(event, 400);
    return useResponseError('缺少必填字段: projectName');
  }

  try {
    const newProject = await prisma.quality_plans.create({
      data: {
        id: createItpProjectId(),
        projectName,
        workOrderNumber: normalizeItpText(body.workOrderId) || '',
        customer: normalizeItpText(body.customerName) || 'Default Customer',
        version: 1,
        planStatus: normalizeItpPlanStatus(body.status),
        preparedBy: 'admin',
        updatedAt: new Date(),
        itpItems: '[]',
      },
    });

    return useResponseSuccess({
      ...newProject,
      status: newProject.planStatus?.toLowerCase(),
      workOrderId: newProject.workOrderNumber,
    });
  } catch (error: unknown) {
    logApiError('itp-project-create', error);
    const errorCode = (error as { code?: string }).code;
    setResponseStatus(event, errorCode === 'P2003' ? 400 : 500);
    return useResponseError(
      errorCode === 'P2003' ? '关联工单不存在' : '创建 ITP 项目失败',
    );
  }
});
