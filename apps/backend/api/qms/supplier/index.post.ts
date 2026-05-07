import { defineEventHandler, readBody } from 'h3';
import { logApiError } from '~/utils/api-logger';
import { recordBusinessAuditLog } from '~/utils/audit-log';
import { verifyAccessToken } from '~/utils/jwt-utils';
import prisma from '~/utils/prisma';
import { isPrismaUniqueConstraintError } from '~/utils/prisma-error';
import {
  badRequestResponse,
  conflictResponse,
  internalServerErrorResponse,
  unAuthorizedResponse,
  useResponseSuccess,
} from '~/utils/response';
import { buildSupplierCreateData } from '~/utils/supplier';

export default defineEventHandler(async (event) => {
  const userinfo = verifyAccessToken(event);
  if (!userinfo) {
    return unAuthorizedResponse(event);
  }

  try {
    const body = await readBody(event);
    const createData = buildSupplierCreateData(body as Record<string, unknown>);
    if (!createData) {
      return badRequestResponse(event, '缺少必填字段: name');
    }

    const newSupplier = await prisma.suppliers.create({
      data: createData,
    });

    await recordBusinessAuditLog(event, {
      userId: userinfo.id,
      action: 'CREATE',
      targetType: 'supplier',
      targetId: String(newSupplier.id),
      details: `新增供应商/外协单位: ${newSupplier.name}`,
    });

    return useResponseSuccess(newSupplier);
  } catch (error: unknown) {
    logApiError('supplier', error);
    if (isPrismaUniqueConstraintError(error)) {
      return conflictResponse(event, '供应商名称已存在');
    }
    return internalServerErrorResponse(event, '创建供应商失败');
  }
});
