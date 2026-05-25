import { defineEventHandler, readBody } from 'h3';
import { SystemLogService } from '~/modules/system-log/system-log.service';
import { logApiError } from '~/utils/api-logger';
import { verifyAccessToken } from '~/utils/jwt-utils';
import prisma from '~/utils/prisma';
import {
  buildQualityLossCreateDataWithCanonical,
  buildQualityLossCreateResponse,
  createQualityLossId,
} from '~/utils/quality-loss-payload';
import { getMissingRequiredFields } from '~/utils/request-validation';
import {
  badRequestResponse,
  internalServerErrorResponse,
  unAuthorizedResponse,
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
      return badRequestResponse(event, `缺少必填字段: ${missingFields[0]}`);
    }

    const lossId = createQualityLossId();

    const newItem = await prisma.quality_losses.create({
      data: await buildQualityLossCreateDataWithCanonical(
        body as Record<string, unknown>,
        lossId,
      ),
    });

    await SystemLogService.recordAuditLog({
      userId: String(userinfo.id),
      action: 'CREATE',
      targetType: 'quality_loss',
      targetId: String(newItem.id),
      detailsTemplate: '新增质量损失记录: {{type}} ({{amount}})',
      detailsVariables: {
        amount: newItem.amount,
        type: newItem.type,
      },
    });

    return useResponseSuccess(buildQualityLossCreateResponse(newItem));
  } catch (error) {
    logApiError('quality-loss', error, undefined, event);
    return internalServerErrorResponse(event, '创建质量损失记录失败');
  }
});
