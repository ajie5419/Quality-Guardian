import { defineEventHandler, getRouterParam, readBody } from 'h3';
import { MOCK_DELAY } from '~/utils/index';
import { getMetadata, setMetadata } from '~/utils/metadata';

export default defineEventHandler(async (event) => {
  await new Promise((resolve) => setTimeout(resolve, MOCK_DELAY));
  const id = getRouterParam(event, 'id'); // id is workOrderNumber
  const body = await readBody(event);

  if (!id) return { code: -1, message: 'ID is required' };

  try {
    const metadataMap = await getMetadata<Record<string, unknown>>(
      'BOM_PROJECT_METADATA',
      {},
    );

    const existingMeta = (metadataMap[id] as Record<string, unknown>) || {};
    const updatedMeta = {
      ...existingMeta,
      ...body,
      updatedAt: new Date().toISOString(),
    };

    metadataMap[id] = updatedMeta;
    await setMetadata('BOM_PROJECT_METADATA', metadataMap);

    return {
      code: 0,
      data: { id, ...updatedMeta },
      message: 'ok',
    };
  } catch (error) {
    console.error('Failed to update BOM project metadata:', error);
    return { code: -1, message: 'Update failed' };
  }
});
