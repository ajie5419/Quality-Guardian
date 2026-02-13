import { defineEventHandler, getRouterParam, setResponseStatus } from 'h3';
import { logApiError } from '~/utils/api-logger';
import { verifyAccessToken } from '~/utils/jwt-utils';
import { getMetadata, setMetadata } from '~/utils/metadata';
import prisma from '~/utils/prisma';
import {
  unAuthorizedResponse,
  useResponseError,
  useResponseSuccess,
} from '~/utils/response';

export default defineEventHandler(async (event) => {
  const userinfo = verifyAccessToken(event);
  if (!userinfo) return unAuthorizedResponse(event);

  const id = getRouterParam(event, 'id');

  if (!id) {
    setResponseStatus(event, 400);
    return useResponseError('ID is required');
  }

  try {
    // 1. Get project to find workOrderNumber
    const project = await prisma.bom_projects.findUnique({
      where: { id },
    });

    if (!project) {
      setResponseStatus(event, 404);
      return useResponseError('Project not found');
    }

    const workOrderNumber = project.workOrderNumber;

    // 2. Soft delete project
    await prisma.bom_projects.update({
      where: { id },
      data: { isDeleted: true, updatedAt: new Date() },
    });

    // 3. Cascade delete BOM items from database
    const deletedItems = await prisma.project_boms.deleteMany({
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

    return useResponseSuccess({
      deletedItems: deletedItems.count,
      id,
      message: 'Deleted',
    });
  } catch (error) {
    logApiError('bom-projects', error);
    setResponseStatus(
      event,
      (error as { code?: string }).code === 'P2025' ? 404 : 500,
    );
    return useResponseError('Delete failed');
  }
});
