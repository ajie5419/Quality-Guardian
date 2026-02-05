import { defineEventHandler, getRouterParam, readBody } from 'h3';
import { logApiError } from '~/utils/api-logger';
import { MOCK_DELAY } from '~/utils/index';
import prisma from '~/utils/prisma';
import { useResponseError, useResponseSuccess } from '~/utils/response';

export default defineEventHandler(async (event) => {
  await new Promise((resolve) => setTimeout(resolve, MOCK_DELAY));
  const id = getRouterParam(event, 'id');
  const body = await readBody(event);

  if (!id) return { code: -1, message: 'ID required' };

  try {
    // 关键修复：改为局部更新逻辑
    const updateData: Record<string, unknown> = {
      updatedAt: new Date(),
    };

    if (body.status !== undefined)
      updateData.planStatus = (body.status as string).toUpperCase();
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

    return useResponseSuccess(updated);
  } catch (error: unknown) {
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error';
    logApiError('projects', error);
    return useResponseError(`更新失败: ${errorMessage}`);
  }
});
