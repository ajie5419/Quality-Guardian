import { defineEventHandler, getRouterParam } from 'h3';
import { MOCK_DELAY } from '~/utils/index';
import prisma from '~/utils/prisma';

export default defineEventHandler(async (event) => {
  await new Promise((resolve) => setTimeout(resolve, MOCK_DELAY));
  const id = getRouterParam(event, 'id');

  if (!id) return { code: -1, message: 'ID required' };

  try {
    // 软删除
    await prisma.itp_items.update({
      where: { id },
      data: { isDeleted: true },
    });

    return {
      code: 0,
      message: 'deleted',
    };
  } catch (error) {
    console.error('Delete ITP item error:', error);
    return { code: -1, message: '删除失败' };
  }
});
