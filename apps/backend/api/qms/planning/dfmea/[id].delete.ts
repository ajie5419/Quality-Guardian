import { defineEventHandler } from 'h3';
import { logApiError } from '~/utils/api-logger';
import { awaitMockDelay } from '~/utils/index';
import { isPrismaNotFoundError } from '~/utils/prisma-error';
import prisma from '~/utils/prisma';
import {
  internalServerErrorResponse,
  notFoundResponse,
  useResponseSuccess,
} from '~/utils/response';
import { getRequiredRouterParam } from '~/utils/route-param';

export default defineEventHandler(async (event) => {
  await awaitMockDelay();
  const id = getRequiredRouterParam(event, 'id', 'ID required');
  if (typeof id !== 'string') {
    return id;
  }

  try {
    // 软删除
    await prisma.dfmea.update({
      where: { id },
      data: { isDeleted: true },
    });

    return useResponseSuccess(null);
  } catch (error) {
    logApiError('dfmea', error);
    if (isPrismaNotFoundError(error)) {
      return notFoundResponse(event, 'DFMEA 条目不存在');
    }
    return internalServerErrorResponse(event, '删除 DFMEA 条目失败');
  }
});
