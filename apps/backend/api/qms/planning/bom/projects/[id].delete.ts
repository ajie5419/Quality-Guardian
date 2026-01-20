import { defineEventHandler, getRouterParam } from 'h3';
import { MOCK_DELAY } from '~/utils/index';
import { getMetadata, setMetadata } from '~/utils/metadata';
import prisma from '~/utils/prisma';

export default defineEventHandler(async (event) => {
  await new Promise((resolve) => setTimeout(resolve, MOCK_DELAY));
  const id = getRouterParam(event, 'id'); // id is workOrderNumber

  if (!id) return { code: -1, message: 'ID is required' };

  try {
    // 1. Delete metadata
    const metadataMap = await getMetadata<Record<string, unknown>>(
      'BOM_PROJECT_METADATA',
      {},
    );
    if (metadataMap[id]) {
      Reflect.deleteProperty(metadataMap, id);
      await setMetadata('BOM_PROJECT_METADATA', metadataMap);
    }

    // 2. Cascade delete BOM items from database
    await prisma.project_boms.deleteMany({
      where: { work_order_number: id },
    });

    return {
      code: 0,
      data: null,
      message: 'ok',
    };
  } catch (error) {
    console.error('Failed to delete BOM project:', error);
    return { code: -1, message: 'Delete failed' };
  }
});
