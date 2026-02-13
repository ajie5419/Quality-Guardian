import { defineEventHandler } from 'h3';
import { logApiError } from '~/utils/api-logger';
import { awaitMockDelay } from '~/utils/index';
import { isPrismaNotFoundError } from '~/utils/planning-project';
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
    // 物理删除，因为 BOM 通常不需要软删除，或者可以加 isDeleted 字段
    await prisma.project_boms.delete({
      where: { id },
    });

    return useResponseSuccess(null);
  } catch (error) {
    logApiError('bom', error);
    if (isPrismaNotFoundError(error)) {
      return notFoundResponse(event, 'BOM item not found');
    }
    return internalServerErrorResponse(event, 'Failed to delete BOM item');
  }
});
