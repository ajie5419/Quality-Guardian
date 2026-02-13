import { defineEventHandler, readBody, setResponseStatus } from 'h3';
import { logApiError } from '~/utils/api-logger';
import { MOCK_DELAY } from '~/utils/index';
import {
  parseItpQuantitativeItems,
  stringifyItpQuantitativeItems,
} from '~/utils/itp';
import { isPrismaNotFoundError } from '~/utils/planning-project';
import prisma from '~/utils/prisma';
import { useResponseError, useResponseSuccess } from '~/utils/response';
import { getRequiredRouterParam } from '~/utils/route-param';

export default defineEventHandler(async (event) => {
  await new Promise((resolve) => setTimeout(resolve, MOCK_DELAY));
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

    return useResponseSuccess({
      ...updated,
      quantitativeItems: parseItpQuantitativeItems(updated.quantitativeItems),
    });
  } catch (error) {
    logApiError('itp', error);
    setResponseStatus(event, isPrismaNotFoundError(error) ? 404 : 500);
    return useResponseError(
      isPrismaNotFoundError(error) ? 'ITP 条目不存在' : '更新 ITP 条目失败',
    );
  }
});
