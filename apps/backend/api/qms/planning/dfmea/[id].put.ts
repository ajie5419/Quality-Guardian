import { defineEventHandler, readBody } from 'h3';
import { logApiError } from '~/utils/api-logger';
import {
  calculateDfmeaRpn,
  normalizeDfmeaEffect,
  parseDfmeaOrder,
  parseDfmeaScore,
} from '~/utils/dfmea';
import { awaitMockDelay } from '~/utils/index';
import prisma from '~/utils/prisma';
import { isPrismaNotFoundError } from '~/utils/prisma-error';
import {
  internalServerErrorResponse,
  notFoundResponse,
  useResponseSuccess,
} from '~/utils/response';
import { getRequiredRouterParam } from '~/utils/route-param';

export default defineEventHandler(async (event) => {
  await awaitMockDelay();
  const id = getRequiredRouterParam(event, 'id', 'ID required');
  if (typeof id !== 'string') {
    return id;
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
    if (isPrismaNotFoundError(error)) {
      return notFoundResponse(event, 'DFMEA 条目不存在');
    }
    return internalServerErrorResponse(event, '更新 DFMEA 条目失败');
  }
});
