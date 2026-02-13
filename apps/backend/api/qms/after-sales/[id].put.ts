import { defineEventHandler, readBody, setResponseStatus } from 'h3';
import { SystemLogService } from '~/services/system-log.service';
import { buildAfterSalesUpdateData } from '~/utils/after-sales-payload';
import { logApiError } from '~/utils/api-logger';
import { verifyAccessToken } from '~/utils/jwt-utils';
import prisma from '~/utils/prisma';
import { isPrismaNotFoundError } from '~/utils/prisma-error';
import {
  unAuthorizedResponse,
  useResponseError,
  useResponseSuccess,
} from '~/utils/response';
import { getRequiredRouterParam } from '~/utils/route-param';

export default defineEventHandler(async (event) => {
  const userinfo = verifyAccessToken(event);
  if (!userinfo) {
    return unAuthorizedResponse(event);
  }

  const id = getRequiredRouterParam(event, 'id', '缺少ID');
  if (typeof id !== 'string') {
    return id;
  }

  try {
    const body = await readBody(event);
    const bodyRecord = body as Record<string, unknown>;
    const { costsChanged, data: updateData } =
      buildAfterSalesUpdateData(bodyRecord);

    if (costsChanged) {
      const current = await prisma.after_sales.findUnique({
        where: { id },
        select: { laborTravelCost: true, materialCost: true },
      });
      if (!current) {
        setResponseStatus(event, 404);
        return useResponseError('售后记录不存在');
      }

      const materialCost = Number(
        updateData.materialCost ?? current.materialCost ?? 0,
      );
      const laborTravelCost = Number(
        updateData.laborTravelCost ?? current.laborTravelCost ?? 0,
      );
      updateData.qualityLoss = materialCost + laborTravelCost;
    }

    await prisma.after_sales.update({
      where: { id },
      data: updateData,
    });

    await SystemLogService.recordAuditLog({
      userId: String(userinfo.id),
      action: 'UPDATE',
      targetType: 'after_sales',
      targetId: String(id),
      details: `修改售后记录: ${id}`,
    });

    return useResponseSuccess(null);
  } catch (error: unknown) {
    logApiError('after-sales', error);
    setResponseStatus(event, isPrismaNotFoundError(error) ? 404 : 500);
    return useResponseError(
      isPrismaNotFoundError(error) ? '售后记录不存在' : '更新售后记录失败',
    );
  }
});
