import { defineEventHandler, setResponseStatus } from 'h3';
import { logApiError } from '~/utils/api-logger';
import { MOCK_DELAY } from '~/utils/index';
import { toItpPlanStatusText, toItpProjectVersionText } from '~/utils/itp';
import prisma from '~/utils/prisma';
import { useResponseError, useResponseSuccess } from '~/utils/response';

export default defineEventHandler(async (event) => {
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
      version: toItpProjectVersionText(p.version),
      status: toItpPlanStatusText(p.planStatus),
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
    }));

    return useResponseSuccess(mapped);
  } catch (error) {
    logApiError('itp-projects', error);
    setResponseStatus(event, 500);
    return useResponseError('获取 ITP 项目失败');
  }
});
