import type { H3Event } from 'h3';

import {
  parseItpQuantitativeItems,
  stringifyItpQuantitativeItems,
} from '~/modules/planning/itp';
import { logApiError } from '~/utils/api-logger';
import { recordBusinessAuditLog } from '~/utils/audit-log';
import { awaitMockDelay } from '~/utils/index';
import { verifyAccessToken } from '~/utils/jwt-utils';
import prisma from '~/utils/prisma';
import { isPrismaNotFoundError } from '~/utils/prisma-error';
import { getRequiredRouterParam } from '~/utils/route-param';

export async function itp_id_put(event: H3Event) {
  await awaitMockDelay();
  const userinfo = verifyAccessToken(event);
  const id = getRequiredRouterParam(event, 'id', 'ID required');
  if (typeof id !== 'string') {
    return id;
  }

  try {
    const body = await readBody(event);
    const baseUpdateData = {
      processStep: body.processStep,
      activity: body.activity,
      controlPoint: body.controlPoint,
      acceptanceCriteria: body.acceptanceCriteria,
      referenceDoc: body.referenceDoc,
      frequency: body.frequency,
      verifyingDocument: body.verifyingDocument,
      isQuantitative:
        body.isQuantitative === undefined ? undefined : !!body.isQuantitative,
      quantitativeItems:
        body.quantitativeItems === undefined
          ? undefined
          : stringifyItpQuantitativeItems(body.quantitativeItems),
      order: body.order === undefined ? undefined : Number(body.order),
    };
    const governedCanonicalIds = await buildGovernedCanonicalWritePairForTable(
      'itp_items',
      baseUpdateData as Record<string, unknown>,
    );
    const governedFields = buildGovernedWriteFieldsForTable(
      'itp_items',
      baseUpdateData as Record<string, unknown>,
    );
    const updated = await prisma.itp_items.update({
      where: { id },
      data: {
        ...baseUpdateData,
        ...governedFields,
        ...governedCanonicalIds,
      },
    });

    await recordBusinessAuditLog(event, {
      userId: userinfo?.id,
      action: 'UPDATE',
      targetType: 'planning_itp_item',
      targetId: String(id),
      detailsTemplate: '修改 ITP 条目: {{item}}',
      detailsVariables: {
        item: updated.processStep || updated.activity || id,
      },
    });

    return useResponseSuccess({
      ...updated,
      quantitativeItems: parseItpQuantitativeItems(updated.quantitativeItems),
    });
  } catch (error) {
    logApiError('itp', error, undefined, event);
    if (isPrismaNotFoundError(error)) {
      return notFoundResponse(event, 'ITP 条目不存在');
    }
    return internalServerErrorResponse(event, '更新 ITP 条目失败');
  }
}
