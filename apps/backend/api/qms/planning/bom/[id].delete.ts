import { defineEventHandler, getRouterParam } from 'h3';
import { logApiError } from '~/utils/api-logger';
import { MOCK_DELAY } from '~/utils/index';
import prisma from '~/utils/prisma';

export default defineEventHandler(async (event) => {
  await new Promise((resolve) => setTimeout(resolve, MOCK_DELAY));
  const id = getRouterParam(event, 'id');

  if (!id) return { code: -1, message: 'ID required' };

  try {
    // 物理删除，因为 BOM 通常不需要软删除，或者可以加 isDeleted 字段
    await prisma.project_boms.delete({
      where: { id },
    });

    return {
      code: 0,
      data: null,
      message: 'ok',
    };
  } catch (error) {
    logApiError('bom', error);
    return { code: -1, message: '删除失败' };
  }
});
