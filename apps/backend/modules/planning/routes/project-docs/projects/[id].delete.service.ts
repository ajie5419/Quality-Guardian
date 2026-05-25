import type { H3Event } from 'h3';

import { FileStorageService } from '~/modules/file-storage/file-storage.service';
import { logApiError } from '~/utils/api-logger';
import { verifyAccessToken } from '~/utils/jwt-utils';
import prisma from '~/utils/prisma';
import { isPrismaNotFoundError } from '~/utils/prisma-error';
import { getRequiredRouterParam } from '~/utils/route-param';

export async function project_docs_projects_id_delete(event: H3Event) {
  const userinfo = await verifyAccessToken(event);
  if (!userinfo) return unAuthorizedResponse(event);

  const id = getRequiredRouterParam(event, 'id', 'ID is required');
  if (typeof id !== 'string') {
    return id;
  }

  try {
    await prisma.doc_projects.update({
      where: { id },
      data: { isDeleted: true, updatedAt: new Date() },
    });
    await FileStorageService.softDeleteReferences({
      bizId: String(id),
      bizType: 'doc_project',
    });

    return useResponseSuccess({ message: 'Deleted' });
  } catch (error) {
    logApiError('project-docs-projects', error, undefined, event);
    if (isPrismaNotFoundError(error)) {
      return notFoundResponse(event, 'Project not found');
    }
    return internalServerErrorResponse(event, 'Delete failed');
  }
}
