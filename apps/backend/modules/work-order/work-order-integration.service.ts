import type { H3Event } from 'h3';

import type {
  FulfillmentWorkOrderCancelInput,
  FulfillmentWorkOrderCreateInput,
  FulfillmentWorkOrderUpdateInput,
} from './work-order-integration.schema';
import type { WorkOrderScopeWhere } from './work-order-versioned-write.service';

import { ErrorCode, WORK_ORDER_STATUS } from '@qgs/shared';
import { UserService } from '~/modules/user';
import { logApiError } from '~/utils/api-logger';
import { BusinessError, isBusinessError } from '~/utils/business-error';
import { MasterDataGovernanceKernel } from '~/utils/canonical-master-data';
import prisma from '~/utils/prisma';

import {
  FULFILLMENT_WORK_ORDER_SELECT,
  toFulfillmentWorkOrder,
} from './work-order-fulfillment-dto';
import { parseRequiredDate } from './work-order-query';
import { applyVersionedWorkOrderUpdate } from './work-order-versioned-write.service';
import {
  buildWorkOrderGovernedFields,
  buildWorkOrderUpdateData,
  createOrRestoreWorkOrder,
} from './work-order-write.service';

/** Audit channel shown on writes made by the fulfillment system. */
const AUDIT_CHANNEL = '履约系统';

/**
 * The fulfillment system is a trusted confidential client that owns the
 * permissions of its own users, so QMS row-level DataScope does not apply to
 * these writes. Every write is still a versioned compare-and-set and is
 * audited under the acting QMS user.
 */
const systemClientScope: WorkOrderScopeWhere = async (baseWhere) => baseWhere;

function badRequest(message: string) {
  return new BusinessError(ErrorCode.BAD_REQUEST, message, 400);
}

async function assertActor(actorUserId: string) {
  const actor = await UserService.findExistingById(actorUserId);
  if (!actor) throw badRequest('操作人无效：QMS 中不存在该用户或已删除');
  return actor.id;
}

/**
 * Validates the canonical customer / division IDs up front so an unknown or
 * disabled reference is a 400 with a message fulfillment users can act on.
 */
async function assertCanonicalReferences(input: {
  customerNameId?: string;
  divisionId?: null | string;
}) {
  const checks = [
    {
      configKey: 'customerName',
      id: input.customerNameId,
      message: '客户无效：QMS 中不存在或已停用',
    },
    {
      configKey: 'division',
      id: input.divisionId,
      message: '事业部无效：QMS 中不存在或已停用',
    },
  ];
  for (const check of checks) {
    if (!check.id) continue;
    const name = await MasterDataGovernanceKernel.resolveCanonicalNameById({
      canonicalId: check.id,
      configKey: check.configKey,
      fallbackName: null,
    });
    if (!name) throw badRequest(check.message);
  }
}

async function findActiveWorkOrder(workOrderNumber: string) {
  return prisma.work_orders.findFirst({
    where: { isDeleted: false, workOrderNumber },
    select: FULFILLMENT_WORK_ORDER_SELECT,
  });
}

async function requireActiveWorkOrder(workOrderNumber: string) {
  const row = await findActiveWorkOrder(workOrderNumber);
  if (!row) {
    throw new BusinessError(
      ErrorCode.NOT_FOUND,
      `工单不存在或已删除: ${workOrderNumber}`,
      404,
    );
  }
  return row;
}

async function readBack(workOrderNumber: string) {
  return toFulfillmentWorkOrder(await requireActiveWorkOrder(workOrderNumber));
}

/** Clearing the division clears both the snapshot name and the canonical ID. */
function divisionInput(divisionId: null | string | undefined) {
  return divisionId === null
    ? { division: null, divisionId: null }
    : { divisionId };
}

export const WorkOrderIntegrationService = {
  async create(event: H3Event, input: FulfillmentWorkOrderCreateInput) {
    const actorUserId = await assertActor(input.actorUserId);
    await assertCanonicalReferences(input);
    const governed = await buildWorkOrderGovernedFields({
      customerNameId: input.customerNameId,
      divisionId: input.divisionId ?? undefined,
    });
    const customerName = governed.customerName;
    if (!customerName) throw badRequest('客户无效：QMS 中不存在或已停用');
    const row = await createOrRestoreWorkOrder(
      event,
      {
        data: {
          ...governed,
          customerName,
          deliveryDate: parseRequiredDate(input.deliveryDate),
          effectiveTime: null,
          isDeleted: false,
          multiStationEnabled: false,
          projectName: input.projectName ?? null,
          quantity: input.quantity,
          status: WORK_ORDER_STATUS.OPEN,
          updatedAt: new Date(),
        },
        workOrderNumber: input.workOrderNumber,
      },
      actorUserId,
      AUDIT_CHANNEL,
    );
    return readBack(row.workOrderNumber);
  },

  async update(
    event: H3Event,
    workOrderNumber: string,
    input: FulfillmentWorkOrderUpdateInput,
  ) {
    if (
      input.workOrderNumber !== undefined &&
      input.workOrderNumber.trim() !== workOrderNumber
    ) {
      throw badRequest('不允许修改工单号');
    }
    const actorUserId = await assertActor(input.actorUserId);
    const current = await requireActiveWorkOrder(workOrderNumber);
    if (current.status === WORK_ORDER_STATUS.CANCELLED) {
      throw badRequest('工单已取消，不能修改');
    }
    await assertCanonicalReferences(input);
    const updateData = await buildWorkOrderUpdateData(workOrderNumber, {
      customerNameId: input.customerNameId,
      ...divisionInput(input.divisionId),
      deliveryDate: input.deliveryDate,
      projectName: input.projectName,
      quantity: input.quantity,
      status: input.status,
    });
    await applyVersionedWorkOrderUpdate(event, {
      actorUserId,
      auditChannel: AUDIT_CHANNEL,
      expectedVersion: input.version,
      id: workOrderNumber,
      scopeWhere: systemClientScope,
      updateData,
      writeGuard: { status: { not: WORK_ORDER_STATUS.CANCELLED } },
    });
    return readBack(workOrderNumber);
  },

  /** Cancelling an already cancelled order returns it unchanged (idempotent). */
  async cancel(
    event: H3Event,
    workOrderNumber: string,
    input: FulfillmentWorkOrderCancelInput,
  ) {
    const actorUserId = await assertActor(input.actorUserId);
    const current = await requireActiveWorkOrder(workOrderNumber);
    if (current.status === WORK_ORDER_STATUS.CANCELLED) {
      return toFulfillmentWorkOrder(current);
    }
    try {
      await applyVersionedWorkOrderUpdate(event, {
        actorUserId,
        auditChannel: AUDIT_CHANNEL,
        auditTemplate: '取消工单: {{workOrderNumber}} ({{customerName}})',
        expectedVersion: input.version,
        id: workOrderNumber,
        scopeWhere: systemClientScope,
        updateData: {
          status: WORK_ORDER_STATUS.CANCELLED,
          updatedAt: new Date(),
        },
      });
    } catch (error) {
      logApiError('fulfillment-work-order-cancel', error, undefined, event);
      // A concurrent cancel may win the version race; that is still a cancel.
      if (
        isBusinessError(error) &&
        error.code === ErrorCode.OPTIMISTIC_LOCK_CONFLICT
      ) {
        const latest = await findActiveWorkOrder(workOrderNumber);
        if (latest?.status === WORK_ORDER_STATUS.CANCELLED) {
          return toFulfillmentWorkOrder(latest);
        }
      }
      throw error;
    }
    return readBack(workOrderNumber);
  },
};
