import { quality_plans_planStatus } from '@prisma/client';
import { defineEventHandler, readBody } from 'h3';
import { nanoid } from 'nanoid';
import { logApiError } from '~/utils/api-logger';
import { MOCK_DELAY } from '~/utils/index';
import prisma from '~/utils/prisma';
import { useResponseError, useResponseSuccess } from '~/utils/response';

export default defineEventHandler(async (event) => {
  await new Promise((resolve) => setTimeout(resolve, MOCK_DELAY));
  const body = await readBody(event);

  try {
    const newProject = await prisma.quality_plans.create({
      data: {
        id: `ITP-PROJ-${nanoid(6).toUpperCase()}`,
        projectName: body.projectName,
        workOrderNumber: body.workOrderId || '', // 这里传的是工单号
        customer: body.customerName || 'Default Customer',
        version: 1,
        planStatus:
          (body.status?.toUpperCase() as quality_plans_planStatus) || 'DRAFT',
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
    return useResponseError(`创建项目失败: ${errorMessage}`);
  }
});
