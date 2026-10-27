import type { Prisma, work_orders } from '@prisma/client';
import type { H3Event } from 'h3';

import { ErrorCode } from '@qgs/shared';
import { recordBusinessAuditLog } from '~/modules/system-log';
import {
  parseOptionalDate,
  parseRequiredDate,
  parseWorkOrderQuantity,
} from '~/modules/work-order/work-order-query';
import { logApiError } from '~/utils/api-logger';
import { BusinessError } from '~/utils/business-error';
import {
  buildGovernedCanonicalWritePairForTable,
  buildGovernedWriteFieldsForTable,
} from '~/utils/governed-write';
import prisma from '~/utils/prisma';
import {
  isPrismaRequiredValueError,
  isPrismaUniqueConflictError,
} from '~/utils/prisma-error';

import { mapWorkOrderStatus, parseWorkOrderStatus } from './work-order-status';

/**
 * Session-independent work-order write building blocks shared by the QMS
 * route service and the fulfillment integration. Callers authenticate and
 * resolve the acting user; everything here only needs that user's ID.
 */

/**
 * Appends the write channel (e.g. 履约系统) to an audit entry so writes made
 * through an integration are distinguishable from QMS UI edits.
 */
export function withAuditChannel(
  detailsTemplate: string,
  detailsVariables: Record<string, unknown>,
  channel?: string,
) {
  if (!channel) return { detailsTemplate, detailsVariables };
  return {
    detailsTemplate: `${detailsTemplate} · 来源: {{channel}}`,
    detailsVariables: { ...detailsVariables, channel },
  };
}

export async function buildWorkOrderGovernedFields(
  input: Record<string, unknown>,
) {
  const governedFields = buildGovernedWriteFieldsForTable('work_orders', input);
  const canonicalFields = await buildGovernedCanonicalWritePairForTable(
    'work_orders',
    input,
  );
  return { ...governedFields, ...canonicalFields };
}

/**
 * Interactive work-order writes must reject an unrecognized status instead of
 * silently defaulting to OPEN, which would persist an unintended value under a
 * 200 response. Batch import keeps the lenient mapWorkOrderStatus behavior for
 * legacy spreadsheet values (PRODUCT_DECISION).
 */
export function resolveInteractiveStatus(status: unknown) {
  if (status === undefined || status === null || status === '') {
    return mapWorkOrderStatus(status);
  }
  const parsed = parseWorkOrderStatus(status);
  if (!parsed) {
    throw new BusinessError('BAD_REQUEST', `无效的工单状态: ${String(status)}`);
  }
  return parsed;
}

function hasGovernedInput(body: Record<string, unknown>) {
  return (
    body.customerName !== undefined ||
    body.customerNameId !== undefined ||
    body.division !== undefined ||
    body.divisionId !== undefined
  );
}

/**
 * Builds the partial update payload for an interactive edit. Undefined fields
 * stay untouched; customer/division go through the governed canonical write.
 */
export async function buildWorkOrderUpdateData(
  id: string,
  body: Record<string, unknown>,
) {
  const updateData: Record<string, unknown> = { updatedAt: new Date() };
  if (hasGovernedInput(body)) {
    Object.assign(
      updateData,
      await buildWorkOrderGovernedFields({
        customerName: body.customerName,
        customerNameId: body.customerNameId,
        division: body.division,
        divisionId: body.divisionId,
      }),
    );
  }
  if (body.projectName !== undefined) updateData.projectName = body.projectName;
  if (body.quantity !== undefined && body.quantity !== null)
    updateData.quantity = parseWorkOrderQuantity(body.quantity, 1);
  if (body.multiStationEnabled !== undefined)
    updateData.multiStationEnabled = body.multiStationEnabled === true;
  if (body.deliveryDate !== undefined && body.deliveryDate !== null)
    updateData.deliveryDate = parseRequiredDate(body.deliveryDate);
  if (body.effectiveTime !== undefined)
    updateData.effectiveTime = parseOptionalDate(body.effectiveTime);
  if (body.workOrderNumber && body.workOrderNumber !== id)
    updateData.workOrderNumber = body.workOrderNumber;
  if (body.status !== undefined && body.status !== null) {
    updateData.status = resolveInteractiveStatus(body.status);
  }
  return updateData;
}

export interface WorkOrderCreateInput {
  data: Omit<Prisma.work_ordersUncheckedCreateInput, 'workOrderNumber'>;
  workOrderNumber: string;
}

/**
 * Creates a work order, or restores a soft-deleted one with the same number
 * (PRODUCT_DECISION: restore-on-create). An active duplicate is a 409
 * WORK_ORDER_EXISTS. The audit entry is recorded for `actorUserId`.
 */
export async function createOrRestoreWorkOrder(
  event: H3Event,
  input: WorkOrderCreateInput,
  actorUserId: number | string,
  auditChannel?: string,
): Promise<work_orders> {
  const { data, workOrderNumber } = input;
  try {
    const existing = await prisma.work_orders.findUnique({
      where: { workOrderNumber },
    });
    if (existing && !existing.isDeleted) {
      throw new BusinessError(
        ErrorCode.WORK_ORDER_EXISTS,
        `工单号 ${workOrderNumber} 已存在且未删除`,
        409,
      );
    }
    const row = existing?.isDeleted
      ? // qms-arch-allow R-SCOPE: create-restore of a soft-deleted work order;
        // the workOrderNumber uniqueness check replaces scope here
        // (PRODUCT_DECISION: restore-on-create semantics).
        await prisma.work_orders.update({ where: { workOrderNumber }, data })
      : await prisma.work_orders.create({ data: { workOrderNumber, ...data } });
    await recordBusinessAuditLog(event, {
      userId: actorUserId,
      action: existing?.isDeleted ? 'UPDATE' : 'CREATE',
      targetType: 'work_order',
      targetId: String(row.workOrderNumber),
      ...withAuditChannel(
        existing?.isDeleted
          ? '恢复工单: {{workOrderNumber}} ({{customerName}})'
          : '新增工单: {{workOrderNumber}} ({{customerName}})',
        {
          customerName: row.customerName,
          workOrderNumber: row.workOrderNumber,
        },
        auditChannel,
      ),
    });
    return row;
  } catch (error) {
    logApiError('work-order-create', error, undefined, event);
    if (isPrismaUniqueConflictError(error))
      throw new BusinessError(
        ErrorCode.WORK_ORDER_EXISTS,
        `工单号 ${workOrderNumber} 已存在`,
        409,
      );
    if (isPrismaRequiredValueError(error))
      throw new BusinessError(ErrorCode.BAD_REQUEST, '请求参数错误', 400);
    throw error;
  }
}
