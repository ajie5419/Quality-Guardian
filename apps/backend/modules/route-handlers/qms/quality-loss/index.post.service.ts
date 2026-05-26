import { defineEventHandler, readBody } from 'h3';
import {
  buildQualityLossCreateDataWithCanonical,
  buildQualityLossCreateResponse,
  createQualityLossId,
} from '~/modules/quality-loss/quality-loss-payload';
import { SystemLogService } from '~/modules/system-log/system-log.service';
import { logApiError } from '~/utils/api-logger';
import { getCurrentUser } from '~/utils/current-user';
import prisma from '~/utils/prisma';
import { getMissingRequiredFields } from '~/utils/request-validation';
import {
  badRequestResponse,
  internalServerErrorResponse,
  useResponseSuccess,
} from '~/utils/response';

export default defineEventHandler(async (event) => {
  const userinfo = getCurrentUser(event);

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

    await SystemLogService.auditLog('quality-loss', 'create', {
      userId: String(userinfo.id),
      targetId: String(newItem.id),
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
