import { defineEventHandler, getQuery } from 'h3';
import { logApiError } from '~/utils/api-logger';
import { MOCK_DELAY } from '~/utils/index';
import { normalizeItpText, parseItpQuantitativeItems } from '~/utils/itp';
import prisma from '~/utils/prisma';
import {
  badRequestResponse,
  internalServerErrorResponse,
  useResponseSuccess,
} from '~/utils/response';

export default defineEventHandler(async (event) => {
  await new Promise((resolve) => setTimeout(resolve, MOCK_DELAY));
  const query = getQuery(event);
  const projectId = normalizeItpText(query.projectId);

  if (!projectId) {
    return badRequestResponse(event, 'projectId required');
  }

  try {
    // Correctly fetch from the relation table instead of the legacy JSON column
    const items = await prisma.itp_items.findMany({
      where: {
        projectId,
        isDeleted: false,
      },
      orderBy: {
        order: 'asc',
      },
    });

    return useResponseSuccess(
      items.map((item) => ({
        ...item,
        quantitativeItems: parseItpQuantitativeItems(item.quantitativeItems),
      })),
    );
  } catch (error) {
    logApiError('itp', error);
    return internalServerErrorResponse(event, '获取 ITP 条目失败');
  }
});
