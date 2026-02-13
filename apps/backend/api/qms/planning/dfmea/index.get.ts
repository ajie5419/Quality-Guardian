import { defineEventHandler, getQuery } from 'h3';
import { logApiError } from '~/utils/api-logger';
import { normalizeDfmeaText } from '~/utils/dfmea';
import { awaitMockDelay } from '~/utils/index';
import prisma from '~/utils/prisma';
import {
  internalServerErrorResponse,
  useResponseSuccess,
} from '~/utils/response';

export default defineEventHandler(async (event) => {
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
    return useResponseSuccess(items);
  } catch (error) {
    logApiError('dfmea', error);
    return internalServerErrorResponse(event, '获取 DFMEA 条目失败');
  }
});
