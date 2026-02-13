import { defineEventHandler, readBody, setResponseStatus } from 'h3';
import { logApiError } from '~/utils/api-logger';
import { MOCK_DELAY } from '~/utils/index';
import { createItpProjectId, normalizeItpPlanStatus } from '~/utils/itp';
import prisma from '~/utils/prisma';
import { useResponseError, useResponseSuccess } from '~/utils/response';

export default defineEventHandler(async (event) => {
  await new Promise((resolve) => setTimeout(resolve, MOCK_DELAY));
  const body = await readBody(event);
  const projectName = String(body.projectName ?? '').trim();
  if (!projectName) {
    setResponseStatus(event, 400);
    return useResponseError('缺少必填字段: projectName');
  }

  try {
    const newProject = await prisma.quality_plans.create({
      data: {
        id: createItpProjectId(),
        projectName,
        workOrderNumber: body.workOrderId || '', // 这里传的是工单号
        customer: body.customerName || 'Default Customer',
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
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error';
    setResponseStatus(
      event,
      (error as { code?: string }).code === 'P2003' ? 400 : 500,
    );
    return useResponseError(`创建项目失败: ${errorMessage}`);
  }
});
