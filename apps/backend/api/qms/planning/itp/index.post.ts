import { defineEventHandler, readBody } from 'h3';
import { MOCK_DELAY } from '~/utils/index';
import prisma from '~/utils/prisma';

export default defineEventHandler(async (event) => {
  await new Promise((resolve) => setTimeout(resolve, MOCK_DELAY));
  const body = await readBody(event);
  const { projectId, ...itemData } = body;

  if (!projectId) {
    return { code: -1, message: 'projectId is required' };
  }

  try {
    const plan = await prisma.quality_plans.findUnique({
      where: { id: projectId },
      include: { items: true },
    });

    if (!plan) {
      return { code: -1, message: 'Quality plan not found' };
    }

    const itpItems = plan.items || [];
    const maxOrder =
      itpItems.length > 0 ? Math.max(...itpItems.map((i) => i.order || 0)) : 0;

    const newItem = await prisma.itp_items.create({
      data: {
        projectId,
        processStep: itemData.processStep,
        activity: itemData.activity,
        controlPoint: itemData.controlPoint,
        acceptanceCriteria: itemData.acceptanceCriteria,
        referenceDoc: itemData.referenceDoc,
        frequency: itemData.frequency,
        verifyingDocument: itemData.verifyingDocument,
        isQuantitative: !!itemData.isQuantitative,
        quantitativeItems: itemData.quantitativeItems
          ? JSON.stringify(itemData.quantitativeItems)
          : '[]',
        order: itemData.order || maxOrder + 1,
      },
    });

    return {
      code: 0,
      data: {
        ...newItem,
        quantitativeItems: JSON.parse(newItem.quantitativeItems || '[]'),
      },
      message: 'created',
    };
  } catch (error) {
    console.error('Create ITP item error:', error);
    return { code: -1, message: '创建失败' };
  }
});
