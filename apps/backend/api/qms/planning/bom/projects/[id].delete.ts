import { defineEventHandler, getRouterParam } from 'h3';
import { logApiError } from '~/utils/api-logger';
import { getMetadata, setMetadata } from '~/utils/metadata';
import prisma from '~/utils/prisma';

export default defineEventHandler(async (event) => {
  const userinfo = verifyAccessToken(event);
  if (!userinfo) return unAuthorizedResponse(event);

  const id = getRouterParam(event, 'id');

  if (!id) return useResponseError('ID is required');

  try {
    // 1. Get project to find workOrderNumber
    const project = await prisma.bom_projects.findUnique({
      where: { id },
    });

    if (!project) return useResponseError('Project not found');

    const workOrderNumber = project.workOrderNumber;

    // 2. Soft delete project
    await prisma.bom_projects.update({
      where: { id },
      data: { isDeleted: true, updatedAt: new Date() },
    });

    // 3. Cascade delete BOM items from database
    await prisma.project_boms.deleteMany({
      where: { work_order_number: workOrderNumber },
    });

    // 4. Delete metadata if exists
    const metadataMap = await getMetadata<Record<string, unknown>>(
      'BOM_PROJECT_METADATA',
      {},
    );
    if (metadataMap[workOrderNumber]) {
      Reflect.deleteProperty(metadataMap, workOrderNumber);
      await setMetadata('BOM_PROJECT_METADATA', metadataMap);
    }

    return useResponseSuccess({ message: 'Deleted' });
  } catch (error) {
    logApiError('projects', error);
    return useResponseError('Delete failed');
  }
});
