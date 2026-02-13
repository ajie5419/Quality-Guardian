import { defineEventHandler, readBody, setResponseStatus } from 'h3';
import { SystemLogService } from '~/services/system-log.service';
import { logApiError } from '~/utils/api-logger';
import { verifyAccessToken } from '~/utils/jwt-utils';
import prisma from '~/utils/prisma';
import {
  normalizeQualityLossStatus,
  toAfterSalesClaimStatus,
  toQualityRecordStatus,
} from '~/utils/quality-loss-status';
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

  const id = getRequiredRouterParam(event, 'id', '请求缺少 ID 参数');
  if (typeof id !== 'string') {
    return id;
  }

  try {
    const body = await readBody(event);
    const source = body.lossSource || 'Manual';
    const pk = body.pk || id;

    // 统一处理数值转化，防止 NaN 导致数据库报错
    const actualClaimValue =
      body.actualClaim === undefined
        ? undefined
        : Number.parseFloat(String(body.actualClaim)) || 0;
    const amountValue =
      body.amount === undefined
        ? undefined
        : Number.parseFloat(String(body.amount)) || 0;

    const normalizedStatus = body.status
      ? normalizeQualityLossStatus(body.status)
      : undefined;

    if (source === 'Internal') {
      // 内部质量损失：更新质量记录表 (quality_records)
      await prisma.quality_records.update({
        where: { id: pk },
        data: {
          recoveredAmount: actualClaimValue,
          ...(normalizedStatus
            ? { status: toQualityRecordStatus(normalizedStatus) }
            : {}),
          updatedAt: new Date(),
        },
      });
    } else if (source === 'External') {
      // 外部质量损失：更新售后表 (after_sales)
      await prisma.after_sales.update({
        where: { id: pk },
        data: {
          actualClaim: actualClaimValue,
          ...(normalizedStatus
            ? { claimStatus: toAfterSalesClaimStatus(normalizedStatus) }
            : {}),
          updatedAt: new Date(),
        },
      });
    } else {
      // 手工录入损失：更新损失表 (quality_losses)
      const updateData: Record<string, unknown> = {
        updatedAt: new Date(),
      };

      if (body.date) updateData.occurDate = new Date(body.date);
      if (body.type) updateData.type = body.type;
      if (amountValue !== undefined) updateData.amount = amountValue;
      if (actualClaimValue !== undefined)
        updateData.actualClaim = actualClaimValue;
      if (body.description !== undefined)
        updateData.description = body.description;
      if (body.responsibleDepartment)
        updateData.respDept = body.responsibleDepartment;
      if (normalizedStatus) updateData.status = normalizedStatus;

      // 查找条件：手工录入的记录，ID 可能是 QL-编号 或 CUID
      const whereCondition = String(id).startsWith('QL-')
        ? { lossId: id }
        : { id: pk };

      await prisma.quality_losses.update({
        where: whereCondition,
        data: updateData,
      });
    }

    let targetType = 'quality_loss';
    if (source === 'Internal') targetType = 'inspection_issue';
    else if (source === 'External') targetType = 'after_sales';

    await SystemLogService.recordAuditLog({
      userId: String(userinfo.id),
      action: 'UPDATE',
      targetType,
      targetId: String(id),
      details: `修改质量损失相关记录: ${id}${source === 'Manual' ? '' : ` (${source} 来源)`}`,
    });

    return useResponseSuccess({ message: '更新成功', success: true });
  } catch (error: unknown) {
    logApiError('quality-loss', error);
    const err = error as { message?: string };
    setResponseStatus(event, 500);
    return useResponseError(`数据更新失败：${err.message || '数据库操作异常'}`);
  }
});
