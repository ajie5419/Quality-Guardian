import { defineEventHandler, readBody } from 'h3';
import { SystemLogService } from '~/services/system-log.service';
import { logApiError } from '~/utils/api-logger';
import { verifyAccessToken } from '~/utils/jwt-utils';
import prisma from '~/utils/prisma';
import { isPrismaNotFoundError } from '~/utils/prisma-error';
import {
  normalizeQualityLossSource,
  QUALITY_LOSS_SOURCE,
  toAfterSalesClaimStatus,
  toQualityLossTargetType,
  toQualityRecordStatus,
} from '~/utils/quality-loss-status';
import {
  parseQualityLossUpdateBody,
  resolveQualityLossUpdateTarget,
} from '~/utils/quality-loss-update';
import {
  badRequestResponse,
  internalServerErrorResponse,
  notFoundResponse,
  unAuthorizedResponse,
  useResponseSuccess,
} from '~/utils/response';
import { getRequiredRouterParam } from '~/utils/route-param';

export default defineEventHandler(async (event) => {
  const userinfo = verifyAccessToken(event);
  if (!userinfo) {
    return unAuthorizedResponse(event);
  }

  const id = getRequiredRouterParam(event, 'id', '请求缺少 ID 参数');
  if (typeof id !== 'string') {
    return id;
  }

  try {
    const body = (await readBody(event)) as Record<string, unknown>;
    const source = normalizeQualityLossSource(
      body.lossSource as string | undefined,
    );
    const parsedBody = parseQualityLossUpdateBody(body);
    if ('message' in parsedBody) {
      return badRequestResponse(event, parsedBody.message);
    }

    const target = await resolveQualityLossUpdateTarget({
      client: prisma,
      pathId: id,
      pk: body.pk,
      source,
    });
    if ('message' in target) {
      return badRequestResponse(event, target.message);
    }

    await prisma.$transaction(async (tx) => {
      if (target.source === QUALITY_LOSS_SOURCE.INTERNAL) {
        await tx.quality_records.update({
          where: target.where,
          data: {
            recoveredAmount: parsedBody.actualClaim,
            ...(parsedBody.status
              ? { status: toQualityRecordStatus(parsedBody.status) }
              : {}),
            updatedAt: new Date(),
          },
        });
        return;
      }

      if (target.source === QUALITY_LOSS_SOURCE.EXTERNAL) {
        await tx.after_sales.update({
          where: target.where,
          data: {
            actualClaim: parsedBody.actualClaim,
            ...(parsedBody.status
              ? { claimStatus: toAfterSalesClaimStatus(parsedBody.status) }
              : {}),
            updatedAt: new Date(),
          },
        });
        return;
      }

      await tx.quality_losses.update({
        where: target.where,
        data: {
          ...(parsedBody.occurDate ? { occurDate: parsedBody.occurDate } : {}),
          ...(parsedBody.type ? { type: parsedBody.type } : {}),
          ...(parsedBody.amount === undefined
            ? {}
            : { amount: parsedBody.amount }),
          ...(parsedBody.actualClaim === undefined
            ? {}
            : { actualClaim: parsedBody.actualClaim }),
          ...(body.description === undefined
            ? {}
            : { description: body.description }),
          ...(parsedBody.respDept ? { respDept: parsedBody.respDept } : {}),
          ...(parsedBody.status ? { status: parsedBody.status } : {}),
          updatedAt: new Date(),
        },
      });
    });

    const targetType = toQualityLossTargetType(source);
    try {
      await SystemLogService.recordAuditLog({
        userId: String(userinfo.id),
        action: 'UPDATE',
        targetType,
        targetId: String(id),
        details: `修改质量损失相关记录: ${id}${source === QUALITY_LOSS_SOURCE.MANUAL ? '' : ` (${source} 来源)`}`,
      });
    } catch (logError) {
      logApiError('quality-loss-log', logError);
    }

    return useResponseSuccess({ message: '更新成功' });
  } catch (error: unknown) {
    logApiError('quality-loss', error);
    if (isPrismaNotFoundError(error)) {
      return notFoundResponse(event, '目标记录不存在');
    }
    const err = error as { message?: string };
    return internalServerErrorResponse(
      event,
      `数据更新失败：${err.message || '数据库操作异常'}`,
    );
  }
});
