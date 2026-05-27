import type { H3Event } from 'h3';

import {
  calculateDfmeaRpn,
  normalizeDfmeaEffect,
  normalizeDfmeaText,
  parseDfmeaOrder,
  parseDfmeaScore,
} from '~/modules/planning/dfmea';
import { logApiError } from '~/utils/api-logger';
import {
  buildGovernedCanonicalWritePairForTable,
  buildGovernedWriteFieldsForTable,
} from '~/utils/governed-write';
import { awaitMockDelay } from '~/utils/index';
import prisma from '~/utils/prisma';
import { isPrismaNotFoundError } from '~/utils/prisma-error';
import { getRequiredRouterParam } from '~/utils/route-param';

export async function dfmea_id_put(event: H3Event) {
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
    const cause =
      body.cause === undefined
        ? undefined
        : normalizeDfmeaText(body.cause) || null;
    const baseUpdateData = {
      item: String(body.item ?? ''),
      failureMode: String(body.failureMode ?? ''),
      effect: normalizeDfmeaEffect(body),
      cause,
      severity,
      occurrence,
      detection,
      rpn: calculateDfmeaRpn(severity, occurrence, detection),
      order: parseDfmeaOrder(body.order),
      updatedAt: new Date(),
    };
    const governedCanonicalIds = await buildGovernedCanonicalWritePairForTable(
      'dfmea',
      baseUpdateData as Record<string, unknown>,
    );
    const governedFields = buildGovernedWriteFieldsForTable(
      'dfmea',
      baseUpdateData as Record<string, unknown>,
    );

    const updated = await prisma.dfmea.update({
      where: { id },
      data: {
        ...baseUpdateData,
        ...governedFields,
        ...governedCanonicalIds,
      },
    });

    return useResponseSuccess(updated);
  } catch (error) {
    logApiError('dfmea', error, undefined, event);
    if (isPrismaNotFoundError(error)) {
      return notFoundResponse(event, 'DFMEA 条目不存在');
    }
    return internalServerErrorResponse(event, '更新 DFMEA 条目失败');
  }
}
