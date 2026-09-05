import type { H3Event } from 'h3';
import type { UserSession } from '~/utils/jwt-utils';

import { Prisma } from '@prisma/client';
import { DataScopeService } from '~/modules/data-scope';
import { recordBusinessAuditLog } from '~/modules/system-log';
import { logApiError } from '~/utils/api-logger';
import { BusinessError } from '~/utils/business-error';
import prisma from '~/utils/prisma';
import { isPrismaNotFoundError } from '~/utils/prisma-error';

export async function buildScopedWorkOrderWhere(
  baseWhere: Prisma.work_ordersWhereInput,
  event: H3Event,
  userinfo: UserSession,
) {
  return DataScopeService.buildWorkOrderWhere(
    baseWhere,
    {
      userId: String(userinfo.id || userinfo.userId || ''),
      username: userinfo.username,
    },
    event.context.dataScope,
  );
}

/**
 * Versioned scoped update (OPTIMISTIC-LOCK-001). The write is keyed by
 * `{ workOrderNumber, version }` plus the resolved DataScope and increments
 * the version atomically, so a stale editor never overwrites a newer edit.
 * A count of 0 is classified 404 (missing/out of scope) or 409 (stale).
 */
export async function updateWorkOrderVersioned(
  event: H3Event,
  id: string,
  updateData: Record<string, unknown>,
  userinfo: UserSession,
  expectedVersion: number,
): Promise<void> {
  try {
    const current = await prisma.work_orders.findFirst({
      where: await buildScopedWorkOrderWhere(
        { workOrderNumber: id, isDeleted: false },
        event,
        userinfo,
      ),
      select: { customerName: true, version: true, workOrderNumber: true },
    });
    if (!current) {
      throw new BusinessError('NOT_FOUND', `工单不存在: ${id}`, 404);
    }
    const where = await buildScopedWorkOrderWhere(
      { version: expectedVersion, workOrderNumber: id },
      event,
      userinfo,
    );
    const result = await prisma.work_orders.updateMany({
      where,
      data: { ...updateData, version: { increment: 1 } },
    });
    if (result.count === 0) {
      const exists = await prisma.work_orders.findFirst({
        where: await buildScopedWorkOrderWhere(
          { isDeleted: false, workOrderNumber: id },
          event,
          userinfo,
        ),
        select: { workOrderNumber: true },
      });
      if (!exists) {
        throw new BusinessError('NOT_FOUND', `工单不存在: ${id}`, 404);
      }
      throw new BusinessError(
        'OPTIMISTIC_LOCK_CONFLICT',
        '记录已被其他用户修改，请刷新后重试',
        409,
      );
    }
    if (result.count !== 1) {
      throw new BusinessError('NOT_FOUND', `工单不存在: ${id}`, 404);
    }
    await recordBusinessAuditLog(event, {
      userId: userinfo.id,
      action: 'UPDATE',
      targetType: 'work_order',
      targetId: String(id),
      detailsTemplate: '修改工单: {{workOrderNumber}} ({{customerName}})',
      detailsVariables: {
        customerName: current.customerName,
        workOrderNumber: current.workOrderNumber,
        oldVersion: current.version,
        newVersion: expectedVersion + 1,
      },
    });
  } catch (error) {
    logApiError('work-order', error, undefined, event);
    if (isPrismaNotFoundError(error))
      throw new BusinessError('NOT_FOUND', `工单不存在: ${id}`, 404);
    throw error;
  }
}

/**
 * Versioned scoped soft-delete (OPTIMISTIC-LOCK-001). A user delete carries
 * the client version so a stale delete cannot remove a newer edit; system
 * cleanup paths omit it and stay force-delete.
 */
export async function deleteWorkOrderVersioned(
  event: H3Event,
  id: string,
  userinfo: UserSession,
  expectedVersion?: number,
): Promise<void> {
  try {
    const current = await prisma.work_orders.findFirst({
      where: await buildScopedWorkOrderWhere(
        { workOrderNumber: id, isDeleted: false },
        event,
        userinfo,
      ),
      select: { customerName: true, version: true, workOrderNumber: true },
    });
    if (!current) {
      throw new BusinessError('NOT_FOUND', '工单不存在', 404);
    }
    const where = await buildScopedWorkOrderWhere(
      expectedVersion === undefined
        ? { workOrderNumber: id }
        : { version: expectedVersion, workOrderNumber: id },
      event,
      userinfo,
    );
    const result = await prisma.work_orders.updateMany({
      where,
      data: {
        isDeleted: true,
        updatedAt: new Date(),
        ...(expectedVersion === undefined ? {} : { version: { increment: 1 } }),
      },
    });
    if (expectedVersion === undefined && result.count !== 1) {
      throw new BusinessError('NOT_FOUND', '工单不存在', 404);
    }
    if (result.count === 0 && expectedVersion !== undefined) {
      const exists = await prisma.work_orders.findFirst({
        where: await buildScopedWorkOrderWhere(
          { isDeleted: false, workOrderNumber: id },
          event,
          userinfo,
        ),
        select: { workOrderNumber: true },
      });
      if (!exists) {
        throw new BusinessError('NOT_FOUND', '工单不存在', 404);
      }
      throw new BusinessError(
        'OPTIMISTIC_LOCK_CONFLICT',
        '记录已被其他用户修改，请刷新后重试',
        409,
      );
    }
    await recordBusinessAuditLog(event, {
      userId: userinfo.id,
      action: 'DELETE',
      targetType: 'work_order',
      targetId: String(id),
      detailsTemplate: '删除工单: {{workOrderNumber}} ({{customerName}})',
      detailsVariables: {
        customerName: current.customerName,
        workOrderNumber: current.workOrderNumber,
        oldVersion: current.version,
        newVersion:
          expectedVersion === undefined ? undefined : expectedVersion + 1,
      },
    });
  } catch (error) {
    logApiError('work-order', error, undefined, event);
    if (isPrismaNotFoundError(error)) {
      throw new BusinessError('NOT_FOUND', '工单不存在', 404);
    }
    throw error;
  }
}
