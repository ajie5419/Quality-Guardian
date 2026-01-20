import { defineEventHandler, readBody } from 'h3';
import { nanoid } from 'nanoid';
import { MOCK_DELAY } from '~/utils/index';
import { getMetadata, setMetadata } from '~/utils/metadata';

export default defineEventHandler(async (event) => {
  await new Promise((resolve) => setTimeout(resolve, MOCK_DELAY));
  const body = await readBody(event);

  const id = body.workOrderNumber || `BOM-PROJ-${nanoid(6).toUpperCase()}`;

  try {
    const metadataMap = await getMetadata<Record<string, unknown>>(
      'BOM_PROJECT_METADATA',
      {},
    );

    const newProject = {
      id,
      projectName: body.projectName,
      workOrderNumber: body.workOrderNumber,
      version: body.version || 'V1.0',
      status: body.status || 'draft',
      description: body.description || '',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      createdBy: 'admin',
    };

    metadataMap[id] = newProject;
    await setMetadata('BOM_PROJECT_METADATA', metadataMap);

    return {
      code: 0,
      data: newProject,
      message: 'ok',
    };
  } catch (error) {
    console.error('Failed to create BOM project metadata:', error);
    return { code: -1, message: 'Creation failed' };
  }
});
