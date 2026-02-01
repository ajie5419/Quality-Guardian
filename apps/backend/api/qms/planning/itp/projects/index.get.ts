import { defineEventHandler } from 'h3';
import { logApiError } from '~/utils/api-logger';
import { MOCK_DELAY } from '~/utils/index';
import prisma from '~/utils/prisma';

export default defineEventHandler(async () => {
  await new Promise((resolve) => setTimeout(resolve, MOCK_DELAY));

  try {
    const projects = await prisma.quality_plans.findMany({
      where: { isDeleted: false },
      orderBy: { createdAt: 'desc' },
    });

    const mapped = projects.map((p) => ({
      id: p.id,
      projectName: p.projectName,
      workOrderId: p.workOrderNumber,
      version: p.version?.toString() || 'V1.0',
      status: p.planStatus?.toLowerCase() || 'draft',
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
    }));

    return {
      code: 0,
      data: mapped,
      message: 'ok',
    };
  } catch (error) {
    logApiError('projects', error);
    return { code: 0, data: [], message: 'error' };
  }
});
