import { defineEventHandler, readBody, setResponseStatus } from 'h3';
import { nanoid } from 'nanoid';
import { logApiError } from '~/utils/api-logger';
import { MOCK_DELAY } from '~/utils/index';
import prisma from '~/utils/prisma';

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
        planStatus: (body.status?.toUpperCase() as any) || 'DRAFT',
        preparedBy: 'admin',
        updatedAt: new Date(),
        itpItems: '[]',
      },
    });

    return {
      code: 0,
      data: {
        ...newProject,
        status: newProject.planStatus?.toLowerCase(),
        workOrderId: newProject.workOrderNumber,
      },
      message: 'ok',
    };
  } catch (error) {
    logApiError('projects', error);
    setResponseStatus(event, 500);
    return { code: -1, message: '创建失败，请检查关联工单' };
  }
});
