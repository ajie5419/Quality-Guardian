import { defineEventHandler, readBody, setResponseStatus } from 'h3';
import { nanoid } from 'nanoid';
import { SystemLogService } from '~/services/system-log.service';
import { logApiError } from '~/utils/api-logger';
import { verifyAccessToken } from '~/utils/jwt-utils';
import prisma from '~/utils/prisma';
import { normalizeQualityLossStatus } from '~/utils/quality-loss-status';
import { getMissingRequiredFields } from '~/utils/request-validation';
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
    const missingFields = getMissingRequiredFields(body, ['type']);
    if (missingFields.length > 0) {
      setResponseStatus(event, 400);
      return useResponseError(`缺少必填字段: ${missingFields[0]}`);
    }

    const lossId = `QL-${new Date().getFullYear()}-${nanoid(6).toUpperCase()}`;

    const newItem = await prisma.quality_losses.create({
      data: {
        lossId,
        occurDate: new Date(body.date || Date.now()),
        type: body.type,
        amount: Number(body.amount) || 0,
        actualClaim: Number(body.actualClaim) || 0,
        description: body.description,
        respDept: body.responsibleDepartment,
        status: normalizeQualityLossStatus(body.status || 'Pending'),
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
    setResponseStatus(event, 500);
    return useResponseError('创建质量损失记录失败');
  }
});
