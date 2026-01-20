import { defineEventHandler, getRouterParam, readBody } from 'h3';
import { MOCK_DELAY } from '~/utils/index';
import prisma from '~/utils/prisma';

export default defineEventHandler(async (event) => {
  await new Promise((resolve) => setTimeout(resolve, MOCK_DELAY));
  const id = getRouterParam(event, 'id');
  const body = await readBody(event);

  if (!id) return { code: -1, message: 'ID required' };

  try {
    const updated = await prisma.dfmea.update({
      where: { id },
      data: {
        item: body.item,
        failureMode: body.failureMode,
        effect: body.effects || body.effect,
        severity: Number(body.severity),
        occurrence: Number(body.occurrence),
        detection: Number(body.detection),
        rpn: Number(body.severity) * Number(body.occurrence) * Number(body.detection),
        order: Number(body.order || 0),
        updatedAt: new Date(),
      },
    });

    return {
      code: 0,
      data: updated,
      message: 'ok',
    };
  } catch (error) {
    console.error('Update DFMEA item error:', error);
    return { code: -1, message: '更新失败' };
  }
});
