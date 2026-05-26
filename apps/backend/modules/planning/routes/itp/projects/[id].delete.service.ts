import type { H3Event } from 'h3';

import { buildGovernedWriteFieldsForTable } from '~/governance/master-data/master-data-governance-write';
import { FileStorageService } from '~/modules/file-storage/file-storage.service';
import { recordBusinessAuditLog } from '~/modules/system-log/audit-log';
import { logApiError } from '~/utils/api-logger';
import { awaitMockDelay } from '~/utils/index';
import { verifyAccessToken } from '~/utils/jwt-utils';
import prisma from '~/utils/prisma';
import { isPrismaNotFoundError } from '~/utils/prisma-error';
import { getRequiredRouterParam } from '~/utils/route-param';

export async function itp_projects_id_delete(event: H3Event) {
  await awaitMockDelay();
  const userinfo = verifyAccessToken(event);
  const id = getRequiredRouterParam(event, 'id', 'ID required');
  if (typeof id !== 'string') {
    return id;
  }

  try {
    const governedFields = buildGovernedWriteFieldsForTable('quality_plans', {
      projectName: undefined,
    });
    const deleted = await prisma.quality_plans.update({
      where: { id },
      data: {
        ...governedFields,
        isDeleted: true,
      },
    });
    await FileStorageService.softDeleteReferences({
      bizId: String(id),
      bizType: 'quality_plan',
    });

    await recordBusinessAuditLog(event, {
      userId: userinfo?.id,
      action: 'DELETE',
      targetType: 'planning_itp_project',
      targetId: String(id),
      detailsTemplate: '删除 ITP 项目: {{projectName}}',
      detailsVariables: {
        projectName: deleted.projectName,
      },
    });

    return useResponseSuccess(null);
  } catch (error) {
    logApiError('itp-projects', error, undefined, event);
    if (isPrismaNotFoundError(error)) {
      return notFoundResponse(event, 'ITP 项目不存在');
    }
    return internalServerErrorResponse(event, '删除 ITP 项目失败');
  }
}
