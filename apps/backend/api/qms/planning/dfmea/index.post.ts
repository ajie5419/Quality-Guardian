import { defineEventHandler, readBody, setResponseStatus } from 'h3';
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

  try {
    const body = (await readBody(event)) as Record<string, unknown>;
    const projectId = String(body.projectId ?? '').trim();
    if (!projectId) {
      setResponseStatus(event, 400);
      return useResponseError('缺少必填字段: projectId');
    }

    const severity = parseDfmeaScore(body.severity, 5);
    const occurrence = parseDfmeaScore(body.occurrence, 5);
    const detection = parseDfmeaScore(body.detection, 5);

    const newItem = await prisma.dfmea.create({
      data: {
        projectId,
        item: String(body.item ?? ''),
        failureMode: String(body.failureMode ?? ''),
        effect: normalizeDfmeaEffect(body),
        severity,
        occurrence,
        detection,
        rpn: calculateDfmeaRpn(severity, occurrence, detection),
        order: parseDfmeaOrder(body.order),
        status: 'OPEN',
        updatedAt: new Date(),
      },
    });

    return useResponseSuccess(newItem);
  } catch (error) {
    logApiError('dfmea', error);
    setResponseStatus(event, 500);
    return useResponseError('添加 DFMEA 条目失败');
  }
});
