import { defineEventHandler, readBody } from 'h3';
import { logApiError } from '~/utils/api-logger';
import { recordBusinessAuditLog } from '~/utils/audit-log';
import { awaitMockDelay } from '~/utils/index';
import {
  parseItpQuantitativeItems,
  stringifyItpQuantitativeItems,
} from '~/utils/itp';
import { verifyAccessToken } from '~/utils/jwt-utils';
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
  const userinfo = verifyAccessToken(event);
  const id = getRequiredRouterParam(event, 'id', 'ID required');
  if (typeof id !== 'string') {
    return id;
  }

  try {
    const body = await readBody(event);
    const updated = await prisma.itp_items.update({
      where: { id },
      data: {
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
      },
    });

    await recordBusinessAuditLog(event, {
      userId: userinfo?.id,
      action: 'UPDATE',
      targetType: 'planning_itp_item',
      targetId: String(id),
      details: `修改 ITP 条目: ${updated.processStep || updated.activity || id}`,
    });

    return useResponseSuccess({
      ...updated,
      quantitativeItems: parseItpQuantitativeItems(updated.quantitativeItems),
    });
  } catch (error) {
    logApiError('itp', error);
    if (isPrismaNotFoundError(error)) {
      return notFoundResponse(event, 'ITP 条目不存在');
    }
    return internalServerErrorResponse(event, '更新 ITP 条目失败');
  }
});
