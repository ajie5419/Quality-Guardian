import { defineEventHandler, readBody } from 'h3';
import { logApiError } from '~/utils/api-logger';
import {
  calculateDfmeaRpn,
  normalizeDfmeaEffect,
  normalizeDfmeaText,
  parseDfmeaOrder,
  parseDfmeaScore,
} from '~/utils/dfmea';
import { MOCK_DELAY } from '~/utils/index';
import prisma from '~/utils/prisma';
import { getMissingRequiredFields } from '~/utils/request-validation';
import {
  badRequestResponse,
  internalServerErrorResponse,
  useResponseSuccess,
} from '~/utils/response';

export default defineEventHandler(async (event) => {
  await new Promise((resolve) => setTimeout(resolve, MOCK_DELAY));

  try {
    const body = (await readBody(event)) as Record<string, unknown>;
    const projectId = normalizeDfmeaText(body.projectId);
    const missingFields = getMissingRequiredFields({ projectId }, [
      'projectId',
    ]);
    if (missingFields.length > 0) {
      return badRequestResponse(event, `缺少必填字段: ${missingFields[0]}`);
    }

    const severity = parseDfmeaScore(body.severity, 5);
    const occurrence = parseDfmeaScore(body.occurrence, 5);
    const detection = parseDfmeaScore(body.detection, 5);

    const newItem = await prisma.dfmea.create({
      data: {
        projectId: String(projectId),
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
    return internalServerErrorResponse(event, '添加 DFMEA 条目失败');
  }
});
