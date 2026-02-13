import { QMS_DEFAULT_VALUES } from '@qgs/shared';
import { defineEventHandler, readBody, setResponseStatus } from 'h3';
import { SystemLogService } from '~/services/system-log.service';
import {
  createAfterSalesId,
  getNextAfterSalesSerialNumber,
} from '~/utils/after-sales-id';
import { buildAfterSalesCreateData } from '~/utils/after-sales-payload';
import { logApiError } from '~/utils/api-logger';
import { verifyAccessToken } from '~/utils/jwt-utils';
import prisma from '~/utils/prisma';
import {
  unAuthorizedResponse,
  useResponseError,
  useResponseSuccess,
} from '~/utils/response';

export default defineEventHandler(async (event) => {
  const userinfo = await verifyAccessToken(event);
  if (!userinfo) {
    return unAuthorizedResponse(event);
  }

  try {
    const body = await readBody(event);
    if (!body?.workOrderNumber) {
      setResponseStatus(event, 400);
      return useResponseError('缺少必填字段: workOrderNumber');
    }

    const serialNumber = await getNextAfterSalesSerialNumber();

    const newItem = await prisma.after_sales.create({
      data: buildAfterSalesCreateData(body, {
        defaultWorkOrderNumber: QMS_DEFAULT_VALUES.UNKNOWN_WORK_ORDER,
        id: createAfterSalesId(),
        serialNumber,
      }),
    });

    await SystemLogService.recordAuditLog({
      userId: String(userinfo.id),
      action: 'CREATE',
      targetType: 'after_sales',
      targetId: String(newItem.id),
      details: `新增售后记录: ${newItem.projectName} (${newItem.id})`,
    });

    return useResponseSuccess(newItem);
  } catch (error: unknown) {
    logApiError('after-sales-create', error);
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error';
    setResponseStatus(event, 500);
    return useResponseError(`创建售后记录失败: ${errorMessage}`);
  }
});
