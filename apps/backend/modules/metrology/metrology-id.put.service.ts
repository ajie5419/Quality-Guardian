import { defineEventHandler, readBody } from 'h3';
import { z } from 'zod';
import { MetrologyService } from '~/modules/metrology/metrology.service';
import { recordBusinessAuditLog } from '~/modules/system-log/audit-log';
import { logApiError } from '~/utils/api-logger';
import { getCurrentUser } from '~/utils/current-user';
import {
  isPrismaNotFoundError,
  isPrismaUniqueConstraintError,
} from '~/utils/prisma-error';
import {
  badRequestResponse,
  conflictResponse,
  internalServerErrorResponse,
  notFoundResponse,
  useResponseSuccess,
} from '~/utils/response';
import { getRequiredRouterParam } from '~/utils/route-param';

const updateMetrologySchema = z.record(z.string(), z.unknown());

export default defineEventHandler(async (event) => {
  const userinfo = getCurrentUser(event);

  const id = getRequiredRouterParam(event, 'id', '缺少计量器具ID');
  if (typeof id !== 'string') {
    return id;
  }

  try {
    const body = updateMetrologySchema.parse(await readBody(event));
    const updated = await MetrologyService.updateById(
      id,
      body,
      userinfo.username,
    );

    await recordBusinessAuditLog(event, {
      userId: userinfo.id,
      action: 'UPDATE',
      targetType: 'metrology',
      targetId: String(id),
      detailsTemplate: '修改计量器具: {{instrumentName}} ({{instrumentCode}})',
      detailsVariables: {
        instrumentCode: updated.instrumentCode,
        instrumentName: updated.instrumentName,
      },
    });

    return useResponseSuccess(null);
  } catch (error: unknown) {
    logApiError('metrology-update', error, undefined, event);
    if (
      error instanceof Error &&
      (error.message === '量具名称不能为空' ||
        error.message === '编号不能为空' ||
        error.message === '有效期格式无效')
    ) {
      return badRequestResponse(event, error.message);
    }
    if (isPrismaNotFoundError(error)) {
      return notFoundResponse(event, '计量器具不存在');
    }
    if (isPrismaUniqueConstraintError(error)) {
      return conflictResponse(event, '编号已存在');
    }
    return internalServerErrorResponse(event, '更新计量器具失败');
  }
});
