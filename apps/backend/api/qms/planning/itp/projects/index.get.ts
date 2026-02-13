import { defineEventHandler } from 'h3';
import { logApiError } from '~/utils/api-logger';
import { awaitMockDelay } from '~/utils/index';
import { toItpPlanStatusText, toItpProjectVersionText } from '~/utils/itp';
import prisma from '~/utils/prisma';
import {
  internalServerErrorResponse,
  useResponseSuccess,
} from '~/utils/response';

export default defineEventHandler(async (event) => {
  await awaitMockDelay();

  try {
    const projects = await prisma.quality_plans.findMany({
      where: { isDeleted: false },
      orderBy: { createdAt: 'desc' },
    });

    const mapped = projects.map((p) => ({
      id: p.id,
      projectName: p.projectName,
      workOrderId: p.workOrderNumber,
      version: toItpProjectVersionText(p.version),
      status: toItpPlanStatusText(p.planStatus),
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
    }));

    return useResponseSuccess(mapped);
  } catch (error) {
    logApiError('itp-projects', error);
    return internalServerErrorResponse(event, '获取 ITP 项目失败');
  }
});
