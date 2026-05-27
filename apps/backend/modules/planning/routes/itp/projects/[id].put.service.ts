import type { H3Event } from 'h3';

import { FileStorageService } from '~/modules/file-storage/file-storage.service';
import { buildItpProjectUpdateData } from '~/modules/planning/itp';
import { recordBusinessAuditLog } from '~/modules/system-log/audit-log';
import { logApiError } from '~/utils/api-logger';
import { buildGovernedWriteFieldsForTable } from '~/utils/governed-write';
import { awaitMockDelay } from '~/utils/index';
import { verifyAccessToken } from '~/utils/jwt-utils';
import prisma from '~/utils/prisma';
import { isPrismaNotFoundError } from '~/utils/prisma-error';
import { getRequiredRouterParam } from '~/utils/route-param';

export async function itp_projects_id_put(event: H3Event) {
  await awaitMockDelay();
  const userinfo = verifyAccessToken(event);
  const id = getRequiredRouterParam(event, 'id', 'ID required');
  if (typeof id !== 'string') {
    return id;
  }

  try {
    const body = await readBody(event);
    const updateData = buildItpProjectUpdateData(
      body as Record<string, unknown>,
    );
    const governedFields = buildGovernedWriteFieldsForTable('quality_plans', {
      ...updateData,
      projectName: updateData.projectName,
    });

    const updated = await prisma.quality_plans.update({
      where: { id },
      data: {
        ...updateData,
        ...governedFields,
      },
    });

    if ((body as Record<string, unknown>).documents !== undefined) {
      await FileStorageService.registerReferencesFromAttachments({
        attachments: (body as Record<string, unknown>).documents,
        bizId: String(id),
        bizType: 'quality_plan',
        fieldName: 'documents',
      });
    }

    await recordBusinessAuditLog(event, {
      userId: userinfo?.id,
      action: 'UPDATE',
      targetType: 'planning_itp_project',
      targetId: String(id),
      detailsTemplate: '修改 ITP 项目: {{projectName}}',
      detailsVariables: {
        projectName: updated.projectName,
      },
    });

    return useResponseSuccess(updated);
  } catch (error: unknown) {
    logApiError('itp-projects', error, undefined, event);
    if (isPrismaNotFoundError(error)) {
      return notFoundResponse(event, 'ITP 项目不存在');
    }
    return internalServerErrorResponse(event, '更新 ITP 项目失败');
  }
}
