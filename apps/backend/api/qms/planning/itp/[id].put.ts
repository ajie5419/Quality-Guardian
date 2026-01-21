import { defineEventHandler, getRouterParam, readBody } from 'h3';
import { MOCK_DELAY } from '~/utils/index';
import prisma from '~/utils/prisma';

export default defineEventHandler(async (event) => {
  await new Promise((resolve) => setTimeout(resolve, MOCK_DELAY));
  const id = getRouterParam(event, 'id');
  const body = await readBody(event);

  if (!id) return { code: -1, message: 'ID required' };

  try {
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
        quantitativeItems: body.quantitativeItems
          ? JSON.stringify(body.quantitativeItems)
          : undefined,
        order: body.order === undefined ? undefined : Number(body.order),
      },
    });

    return {
      code: 0,
      data: {
        ...updated,
        quantitativeItems: updated.quantitativeItems
          ? JSON.parse(updated.quantitativeItems)
          : [],
      },
      message: 'updated',
    };
  } catch (error) {
    console.error('Update ITP item error:', error);
    return { code: -1, message: '更新失败' };
  }
});
