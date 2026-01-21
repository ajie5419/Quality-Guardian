import { defineEventHandler, getRouterParam, readBody } from 'h3';
import { MOCK_DELAY } from '~/utils/index';
import prisma from '~/utils/prisma';

export default defineEventHandler(async (event) => {
  await new Promise((resolve) => setTimeout(resolve, MOCK_DELAY));
  const id = getRouterParam(event, 'id');
  const body = await readBody(event);

  if (!id) return { code: -1, message: 'ID required' };

  try {
    // 关键修复：改为局部更新逻辑
    const updateData: any = {
      updatedAt: new Date(),
    };

    if (body.status !== undefined)
      updateData.planStatus = body.status.toUpperCase();
    if (body.projectName !== undefined)
      updateData.projectName = body.projectName;
    if (body.workOrderId !== undefined)
      updateData.workOrderNumber = body.workOrderId;
    if (body.customerName !== undefined)
      updateData.customer = body.customerName;

    const updated = await prisma.quality_plans.update({
      where: { id },
      data: updateData,
    });

    return {
      code: 0,
      data: updated,
      message: 'ok',
    };
  } catch (error) {
    console.error('Update ITP project error:', error);
    return { code: -1, message: '更新失败' };
  }
});
