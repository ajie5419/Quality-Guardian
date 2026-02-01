import { defineEventHandler, readBody } from 'h3';
import { logApiError } from '~/utils/api-logger';
import { MOCK_DELAY } from '~/utils/index';
import prisma from '~/utils/prisma';

export default defineEventHandler(async (event) => {
  await new Promise((resolve) => setTimeout(resolve, MOCK_DELAY));
  const body = await readBody(event);

  try {
    const newItem = await prisma.dfmea.create({
      data: {
        projectId: body.projectId,
        item: body.item,
        failureMode: body.failureMode,
        effect: body.effects || body.effect,
        severity: Number(body.severity || 5),
        occurrence: Number(body.occurrence || 5),
        detection: Number(body.detection || 5),
        rpn:
          Number(body.severity || 5) *
          Number(body.occurrence || 5) *
          Number(body.detection || 5),
        order: Number(body.order || 0),
        status: 'OPEN',
        updatedAt: new Date(),
      },
    });

    return {
      code: 0,
      data: newItem,
      message: 'ok',
    };
  } catch (error) {
    logApiError('dfmea', error);
    return { code: -1, message: '添加条目失败' };
  }
});
