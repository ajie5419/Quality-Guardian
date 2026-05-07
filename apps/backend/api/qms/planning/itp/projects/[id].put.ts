import { defineEventHandler, readBody } from 'h3';
import { logApiError } from '~/utils/api-logger';
import { recordBusinessAuditLog } from '~/utils/audit-log';
import { awaitMockDelay } from '~/utils/index';
import { buildItpProjectUpdateData } from '~/utils/itp';
import { verifyAccessToken } from '~/utils/jwt-utils';
import prisma from '~/utils/prisma';
import { isPrismaNotFoundError } from '~/utils/prisma-error';
import {
  internalServerErrorResponse,
  notFoundResponse,
  useResponseSuccess,
} from '~/utils/response';
import { getRequiredRouterParam } from '~/utils/route-param';

export default defineEventHandler(async (event) => {
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

    const updated = await prisma.quality_plans.update({
      where: { id },
      data: updateData,
    });

    await recordBusinessAuditLog(event, {
      userId: userinfo?.id,
      action: 'UPDATE',
      targetType: 'planning_itp_project',
      targetId: String(id),
      details: `修改 ITP 项目: ${updated.projectName}`,
    });

    return useResponseSuccess(updated);
  } catch (error: unknown) {
    logApiError('itp-projects', error);
    if (isPrismaNotFoundError(error)) {
      return notFoundResponse(event, 'ITP 项目不存在');
    }
    return internalServerErrorResponse(event, '更新 ITP 项目失败');
  }
});
