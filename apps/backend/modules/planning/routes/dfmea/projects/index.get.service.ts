import type { H3Event } from 'h3';

import { logApiError } from '~/utils/api-logger';
import { awaitMockDelay } from '~/utils/index';
import prisma from '~/utils/prisma';

export async function dfmea_projects_index_get(event: H3Event) {
  await awaitMockDelay();

  try {
    const projects = await prisma.dfmea_projects.findMany({
      where: { isDeleted: false },
      orderBy: { createdAt: 'desc' },
    });

    return useListResponseSuccess(projects);
  } catch (error) {
    logApiError('dfmea-projects', error, undefined, event);
    return internalServerErrorResponse(event, '获取 DFMEA 项目失败');
  }
}
