import { defineEventHandler, readBody } from 'h3';
import { logApiError } from '~/utils/api-logger';
import {
  calculateDfmeaRpn,
  normalizeDfmeaEffect,
  normalizeDfmeaText,
  parseDfmeaOrder,
  parseDfmeaScore,
} from '~/utils/dfmea';
import { awaitMockDelay } from '~/utils/index';
import {
  buildGovernedCanonicalWritePairForTable,
  buildGovernedWriteFieldsForTable,
} from '~/utils/master-data-governance-write';
import prisma from '~/utils/prisma';
import { getMissingRequiredFields } from '~/utils/request-validation';
import {
  badRequestResponse,
  internalServerErrorResponse,
  useResponseSuccess,
} from '~/utils/response';

export default defineEventHandler(async (event) => {
  await awaitMockDelay();

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
    const cause = normalizeDfmeaText(body.cause) || null;
    const baseCreateData = {
      projectId: String(projectId),
      item: String(body.item ?? ''),
      failureMode: String(body.failureMode ?? ''),
      effect: normalizeDfmeaEffect(body),
      cause,
      severity,
      occurrence,
      detection,
      rpn: calculateDfmeaRpn(severity, occurrence, detection),
      order: parseDfmeaOrder(body.order),
      status: 'OPEN' as const,
      updatedAt: new Date(),
    };
    const governedCanonicalIds = await buildGovernedCanonicalWritePairForTable(
      'dfmea',
      baseCreateData as Record<string, unknown>,
    );
    const governedFields = buildGovernedWriteFieldsForTable(
      'dfmea',
      baseCreateData as Record<string, unknown>,
    );

    const newItem = await prisma.dfmea.create({
      data: {
        ...baseCreateData,
        ...governedFields,
        ...governedCanonicalIds,
      },
    });

    return useResponseSuccess(newItem);
  } catch (error) {
    logApiError('dfmea', error, undefined, event);
    return internalServerErrorResponse(event, '添加 DFMEA 条目失败');
  }
});
