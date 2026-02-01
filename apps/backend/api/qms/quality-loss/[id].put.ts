import { defineEventHandler, getRouterParam, readBody } from 'h3';
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

  const id = getRouterParam(event, 'id');
  if (!id) {
    return useResponseError('请求缺少 ID 参数');
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

    let syncedStatus;
    if (body.status) {
      syncedStatus = body.status === 'Confirmed' ? 'CLOSED' : 'OPEN';
    }

    if (source === 'Internal') {
      // 内部质量损失：更新质量记录表 (quality_records)
      await prisma.quality_records.update({
        where: { id: pk },
        data: {
          recoveredAmount: actualClaimValue,
          // 同步状态：Confirmed -> CLOSED, others -> OPEN
          status: syncedStatus,
          updatedAt: new Date(),
        },
      });
    } else if (source === 'External') {
      // 外部质量损失：更新售后表 (after_sales)
      await prisma.after_sales.update({
        where: { id: pk },
        data: {
          actualClaim: actualClaimValue,
          // 同步状态：Confirmed -> CLOSED, others -> OPEN
          claimStatus: syncedStatus,
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
      if (body.status) updateData.status = body.status;

      // 查找条件：手工录入的记录，ID 可能是 QL-编号 或 CUID
      const whereCondition = String(id).startsWith('QL-')
        ? { lossId: id }
        : { id: pk };

      await prisma.quality_losses.update({
        where: whereCondition,
        data: updateData,
      });
    }

    return useResponseSuccess({ message: '更新成功', success: true });
  } catch (error: unknown) {
    logApiError('quality-loss', error);
    const err = error as { message?: string };
    return useResponseError(`数据更新失败：${err.message || '数据库操作异常'}`);
  }
});
