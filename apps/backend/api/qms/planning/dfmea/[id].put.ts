import {
  defineEventHandler,
  getRouterParam,
  readBody,
  setResponseStatus,
} from 'h3';
import { logApiError } from '~/utils/api-logger';
import {
  calculateDfmeaRpn,
  normalizeDfmeaEffect,
  parseDfmeaOrder,
  parseDfmeaScore,
} from '~/utils/dfmea';
import { MOCK_DELAY } from '~/utils/index';
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
    const body = (await readBody(event)) as Record<string, unknown>;
    const severity = parseDfmeaScore(body.severity, 5);
    const occurrence = parseDfmeaScore(body.occurrence, 5);
    const detection = parseDfmeaScore(body.detection, 5);

    const updated = await prisma.dfmea.update({
      where: { id },
      data: {
        item: String(body.item ?? ''),
        failureMode: String(body.failureMode ?? ''),
        effect: normalizeDfmeaEffect(body),
        severity,
        occurrence,
        detection,
        rpn: calculateDfmeaRpn(severity, occurrence, detection),
        order: parseDfmeaOrder(body.order),
        updatedAt: new Date(),
      },
    });

    return useResponseSuccess(updated);
  } catch (error) {
    logApiError('dfmea', error);
    setResponseStatus(
      event,
      (error as { code?: string }).code === 'P2025' ? 404 : 500,
    );
    return useResponseError('更新 DFMEA 条目失败');
  }
});
