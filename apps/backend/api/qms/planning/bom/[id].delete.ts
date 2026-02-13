import { defineEventHandler, getRouterParam, setResponseStatus } from 'h3';
import { logApiError } from '~/utils/api-logger';
import { MOCK_DELAY } from '~/utils/index';
import prisma from '~/utils/prisma';
import { useResponseError, useResponseSuccess } from '~/utils/response';

export default defineEventHandler(async (event) => {
  await new Promise((resolve) => setTimeout(resolve, MOCK_DELAY));
  const id = getRouterParam(event, 'id');

  if (!id) {
    setResponseStatus(event, 400);
    return useResponseError('ID required');
  }

  try {
    // 物理删除，因为 BOM 通常不需要软删除，或者可以加 isDeleted 字段
    await prisma.project_boms.delete({
      where: { id },
    });

    return useResponseSuccess(null);
  } catch (error) {
    logApiError('bom', error);
    const errorCode = (error as { code?: string }).code;
    setResponseStatus(event, errorCode === 'P2025' ? 404 : 500);
    return useResponseError(
      errorCode === 'P2025'
        ? 'BOM item not found'
        : 'Failed to delete BOM item',
    );
  }
});
