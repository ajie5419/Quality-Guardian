import { defineEventHandler, readBody } from 'h3';
import { logApiError } from '~/utils/api-logger';
import { MOCK_DELAY } from '~/utils/index';
import {
  buildItpItemCreateData,
  getMaxItpItemOrder,
  normalizeItpText,
  parseItpQuantitativeItems,
} from '~/utils/itp';
import prisma from '~/utils/prisma';
import { getMissingRequiredFields } from '~/utils/request-validation';
import {
  badRequestResponse,
  internalServerErrorResponse,
  notFoundResponse,
  useResponseSuccess,
} from '~/utils/response';

export default defineEventHandler(async (event) => {
  await new Promise((resolve) => setTimeout(resolve, MOCK_DELAY));
  const body = await readBody(event);
  const projectId = normalizeItpText(body.projectId);
  const itemData = body as Record<string, unknown>;

  const missingFields = getMissingRequiredFields({ projectId }, ['projectId']);
  if (missingFields.length > 0) {
    return badRequestResponse(event, `${missingFields[0]} is required`);
  }

  try {
    const plan = await prisma.quality_plans.findUnique({
      where: { id: projectId },
      include: { items: true },
    });

    if (!plan) {
      return notFoundResponse(event, 'Quality plan not found');
    }

    const maxOrder = getMaxItpItemOrder(plan.items || []);

    const newItem = await prisma.itp_items.create({
      data: buildItpItemCreateData({
        item: itemData,
        order: Number(itemData.order) || maxOrder + 1,
        projectId: String(projectId),
      }),
    });

    return useResponseSuccess({
      ...newItem,
      quantitativeItems: parseItpQuantitativeItems(newItem.quantitativeItems),
    });
  } catch (error) {
    logApiError('itp', error);
    return internalServerErrorResponse(event, '创建 ITP 条目失败');
  }
});
