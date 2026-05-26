import type { H3Event } from 'h3';

import { buildGovernedWriteFieldsForTable } from '~/governance/master-data/master-data-governance-write';
import { FileStorageService } from '~/modules/file-storage/file-storage.service';
import {
  normalizeProjectDocuments,
  stringifyProjectDocuments,
} from '~/modules/inspection/project-documents';
import { normalizePlanningProjectName } from '~/modules/planning/planning-project';
import { logApiError } from '~/utils/api-logger';
import { verifyAccessToken } from '~/utils/jwt-utils';
import prisma from '~/utils/prisma';
import { isPrismaNotFoundError } from '~/utils/prisma-error';
import { getRequiredRouterParam } from '~/utils/route-param';

export async function project_docs_projects_id_put(event: H3Event) {
  const userinfo = verifyAccessToken(event);
  if (!userinfo) return unAuthorizedResponse(event);

  const id = getRequiredRouterParam(event, 'id', 'ID is required');
  if (typeof id !== 'string') {
    return id;
  }

  try {
    const body = await readBody(event);
    const documents =
      body.documents === undefined
        ? undefined
        : stringifyProjectDocuments(normalizeProjectDocuments(body.documents));
    const normalizedProjectName = normalizePlanningProjectName(
      body.projectName,
    );
    const governedFields = buildGovernedWriteFieldsForTable('doc_projects', {
      projectName: normalizedProjectName,
    });
    const updated = await prisma.doc_projects.update({
      where: { id },
      data: {
        status:
          body.status === undefined ? undefined : String(body.status).trim(),
        projectName: normalizedProjectName,
        ...governedFields,
        documents,
        updatedAt: new Date(),
      },
    });
    if (body.documents !== undefined) {
      await FileStorageService.registerReferencesFromAttachments({
        attachments: body.documents,
        bizId: String(id),
        bizType: 'doc_project',
        fieldName: 'documents',
      });
    }
    return useResponseSuccess(updated);
  } catch (error) {
    logApiError('project-docs-projects', error, undefined, event);
    if (isPrismaNotFoundError(error)) {
      return notFoundResponse(event, 'Project not found');
    }
    return internalServerErrorResponse(event, '更新失败');
  }
}
