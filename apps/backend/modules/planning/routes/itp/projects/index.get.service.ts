import type { H3Event } from 'h3';

import {
  toItpPlanStatusText,
  toItpProjectVersionText,
} from '~/modules/planning/itp';
import { logApiError } from '~/utils/api-logger';
import { awaitMockDelay } from '~/utils/index';
import prisma from '~/utils/prisma';

export async function itp_projects_index_get(event: H3Event) {
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

    return useListResponseSuccess(mapped);
  } catch (error) {
    logApiError('itp-projects', error, undefined, event);
    return internalServerErrorResponse(event, '获取 ITP 项目失败');
  }
}
