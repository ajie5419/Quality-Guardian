import type { H3Event } from 'h3';

import { normalizeDfmeaText } from '~/modules/planning/dfmea';
import { logApiError } from '~/utils/api-logger';
import { awaitMockDelay } from '~/utils/index';
import prisma from '~/utils/prisma';

export async function dfmea_index_get(event: H3Event) {
  await awaitMockDelay();
  const query = getQuery(event);
  const projectId = normalizeDfmeaText(query.projectId);

  try {
    const where = {
      isDeleted: false,
      ...(projectId ? { projectId } : {}),
    };
    const items = await prisma.dfmea.findMany({
      where,
      orderBy: { order: 'asc' },
    });
    return useListResponseSuccess(items);
  } catch (error) {
    logApiError('dfmea', error, undefined, event);
    return internalServerErrorResponse(event, '获取 DFMEA 条目失败');
  }
}
