import {
  defineEventHandler,
  getRouterParam,
  readBody,
  setResponseStatus,
} from 'h3';
import { logApiError } from '~/utils/api-logger';
import { MOCK_DELAY } from '~/utils/index';
import { normalizeItpPlanStatus } from '~/utils/itp';
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
    const body = await readBody(event);
    const updateData: Record<string, unknown> = {
      updatedAt: new Date(),
    };

    if (body.status !== undefined)
      updateData.planStatus = normalizeItpPlanStatus(body.status);
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
    logApiError('itp-projects', error);
    setResponseStatus(
      event,
      (error as { code?: string }).code === 'P2025' ? 404 : 500,
    );
    return useResponseError(`更新失败: ${errorMessage}`);
  }
});
