import { defineEventHandler, readBody } from 'h3';
import { SystemLogService } from '~/services/system-log.service';
import { logApiError } from '~/utils/api-logger';
import { verifyAccessToken } from '~/utils/jwt-utils';
import prisma from '~/utils/prisma';
import {
  unAuthorizedResponse,
  useResponseError,
  useResponseSuccess,
} from '~/utils/response';

export default defineEventHandler(async (event) => {
  const userinfo = verifyAccessToken(event);
  if (!userinfo) {
    return unAuthorizedResponse(event);
  }

  try {
    const body = await readBody(event);

    const lossId = `QL-${new Date().getFullYear()}${Math.floor(Math.random() * 10_000)}`;

    const newItem = await prisma.quality_losses.create({
      data: {
        lossId,
        occurDate: new Date(body.date || Date.now()),
        type: body.type,
        amount: Number(body.amount) || 0,
        actualClaim: Number(body.actualClaim) || 0,
        description: body.description,
        respDept: body.responsibleDepartment,
        status: body.status || 'Pending',
        isDeleted: false,
      },
    });

    await SystemLogService.recordAuditLog({
      userId: String(userinfo.id),
      action: 'CREATE',
      targetType: 'quality_loss',
      targetId: String(newItem.id),
      details: `新增质量损失记录: ${newItem.type} (${newItem.amount})`,
    });

    return useResponseSuccess({
      ...newItem,
      id: newItem.lossId,
      date: newItem.occurDate.toISOString().split('T')[0],
      responsibleDepartment: newItem.respDept,
    });
  } catch (error) {
    logApiError('quality-loss', error);
    return useResponseError('创建质量损失记录失败');
  }
});
