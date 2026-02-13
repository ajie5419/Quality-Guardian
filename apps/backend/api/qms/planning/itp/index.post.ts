import { defineEventHandler, readBody, setResponseStatus } from 'h3';
import { logApiError } from '~/utils/api-logger';
import { MOCK_DELAY } from '~/utils/index';
import {
  buildItpItemCreateData,
  getMaxItpItemOrder,
  parseItpQuantitativeItems,
} from '~/utils/itp';
import prisma from '~/utils/prisma';
import { useResponseError, useResponseSuccess } from '~/utils/response';

export default defineEventHandler(async (event) => {
  await new Promise((resolve) => setTimeout(resolve, MOCK_DELAY));
  const body = await readBody(event);
  const { projectId, ...itemData } = body;

  if (!projectId) {
    setResponseStatus(event, 400);
    return useResponseError('projectId is required');
  }

  try {
    const plan = await prisma.quality_plans.findUnique({
      where: { id: projectId },
      include: { items: true },
    });

    if (!plan) {
      setResponseStatus(event, 404);
      return useResponseError('Quality plan not found');
    }

    const maxOrder = getMaxItpItemOrder(plan.items || []);

    const newItem = await prisma.itp_items.create({
      data: buildItpItemCreateData({
        item: itemData,
        order: Number(itemData.order) || maxOrder + 1,
        projectId,
      }),
    });

    return useResponseSuccess({
      ...newItem,
      quantitativeItems: parseItpQuantitativeItems(newItem.quantitativeItems),
    });
  } catch (error) {
    logApiError('itp', error);
    setResponseStatus(event, 500);
    return useResponseError('创建 ITP 条目失败');
  }
});
