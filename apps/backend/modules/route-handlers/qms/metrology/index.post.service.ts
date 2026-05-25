import { defineEventHandler, readBody } from 'h3';
import { z } from 'zod';
import { MetrologyService } from '~/modules/metrology/metrology.service';
import { logApiError } from '~/utils/api-logger';
import { recordBusinessAuditLog } from '~/utils/audit-log';
import { verifyAccessToken } from '~/utils/jwt-utils';
import { isPrismaUniqueConstraintError } from '~/utils/prisma-error';
import {
  badRequestResponse,
  conflictResponse,
  internalServerErrorResponse,
  unAuthorizedResponse,
  useResponseSuccess,
} from '~/utils/response';

const createMetrologySchema = z.record(z.string(), z.unknown());

export default defineEventHandler(async (event) => {
  const userinfo = verifyAccessToken(event);
  if (!userinfo) {
    return unAuthorizedResponse(event);
  }

  try {
    const body = createMetrologySchema.parse(await readBody(event));
    const created = await MetrologyService.create(body, userinfo.username);

    await recordBusinessAuditLog(event, {
      userId: userinfo.id,
      action: 'CREATE',
      targetType: 'metrology',
      targetId: String(created.id),
      detailsTemplate: '新增计量器具: {{instrumentName}} ({{instrumentCode}})',
      detailsVariables: {
        instrumentCode: created.instrumentCode,
        instrumentName: created.instrumentName,
      },
    });

    return useResponseSuccess(created);
  } catch (error: unknown) {
    logApiError('metrology-create', error, undefined, event);
    if (
      error instanceof Error &&
      (error.message === '量具名称不能为空' ||
        error.message === '编号不能为空' ||
        error.message === '有效期格式无效')
    ) {
      return badRequestResponse(event, error.message);
    }
    if (isPrismaUniqueConstraintError(error)) {
      return conflictResponse(event, '编号已存在');
    }
    return internalServerErrorResponse(event, '新建计量器具失败');
  }
});
