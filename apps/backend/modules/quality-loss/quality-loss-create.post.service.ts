import { defineEventHandler, readBody } from 'h3';
import { z } from 'zod';
import { QualityLossIndexQueue } from '~/modules/quality-loss';
import { resolveQualityLossDepartmentWrite } from '~/modules/quality-loss/quality-loss-department-write';
import { resolveManualQualityLossContext } from '~/modules/quality-loss/quality-loss-manual-context';
import {
  buildQualityLossCreateDataWithCanonical,
  buildQualityLossCreateResponse,
  createQualityLossId,
} from '~/modules/quality-loss/quality-loss-payload';
import { SystemLogService } from '~/modules/system-log/system-log.service';
import { logApiError } from '~/utils/api-logger';
import { businessErrorResponse, isBusinessError } from '~/utils/business-error';
import { getCurrentUser } from '~/utils/current-user';
import prisma from '~/utils/prisma';
import {
  badRequestResponse,
  internalServerErrorResponse,
  useResponseSuccess,
} from '~/utils/response';

const bodySchema = z
  .object({
    partName: z.string().trim().min(1),
    responsibleDepartmentId: z.string().trim().min(1),
    type: z.string().trim().min(1),
    workOrderNumber: z.string().trim().min(1),
  })
  .passthrough();

export default defineEventHandler(async (event) => {
  const userinfo = getCurrentUser(event);

  try {
    const parsedBody = bodySchema.safeParse(await readBody(event));
    if (!parsedBody.success) {
      const missingField = parsedBody.error.issues[0]?.path[0] || 'body';
      return badRequestResponse(event, `缺少必填字段: ${String(missingField)}`);
    }
    const body = parsedBody.data;
    const context = await resolveManualQualityLossContext(body);

    const lossId = createQualityLossId();

    const createData = await buildQualityLossCreateDataWithCanonical(
      { ...body, ...context },
      lossId,
      { createdBy: String(userinfo.id || '') || undefined },
    );
    const newItem = await prisma.$transaction(async (tx) => {
      const departmentWrite = await resolveQualityLossDepartmentWrite(
        tx,
        body.responsibleDepartmentId,
      );
      const newItem = await tx.quality_losses.create({
        data: { ...createData, ...departmentWrite },
      });
      await QualityLossIndexQueue.enqueue(
        tx,
        [{ source: 'MANUAL', sourcePk: newItem.id }],
        'quality-loss.created',
      );
      return newItem;
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
    if (isBusinessError(error)) return businessErrorResponse(event, error);
    logApiError('quality-loss', error, undefined, event);
    return internalServerErrorResponse(event, '创建质量损失记录失败');
  }
});
