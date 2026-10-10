import type { WorkOrderItem } from '@qgs/shared';
import type { AnalyticsAccessContext } from '~/modules/data-scope';

import { Prisma } from '@prisma/client';
import { DataScopeService, requireAnalyticsUser } from '~/modules/data-scope';
import { WorkOrderRequirementService } from '~/modules/work-order-requirement';
import { addYearsToDate } from '~/modules/work-order/work-order-query';
import { formatDateString } from '~/utils/query-helpers';

import { mapToDisplayStatus, WORK_ORDER_STATUS } from './work-order-status';

export const WO_CONSTANTS = {
  DEFAULT_PAGE: 1,
  DEFAULT_PAGE_SIZE: 20,
  DEFAULT_WARRANTY_YEARS: 1,
  STATUS: WORK_ORDER_STATUS,
};

export const getWarrantyStatus = (deliveryDate: Date | null) => {
  if (!deliveryDate) {
    return '否';
  }
  const expiryDate = addYearsToDate(
    deliveryDate,
    WO_CONSTANTS.DEFAULT_WARRANTY_YEARS,
  );
  return new Date() <= expiryDate ? '是' : '否';
};

export async function buildScopedWorkOrderWhere(
  baseWhere: Prisma.work_ordersWhereInput,
  access?: AnalyticsAccessContext,
): Promise<Prisma.work_ordersWhereInput> {
  if (!access) return baseWhere;
  const user = requireAnalyticsUser(access);
  return DataScopeService.buildWorkOrderWhere(
    baseWhere,
    user,
    access.dataScope,
  );
}

export async function mapWorkOrderItems(
  workOrders: Array<{
    createdAt: Date | null;
    customerName: null | string;
    deliveryDate: Date | null;
    division: null | string;
    effectiveTime: Date | null;
    multiStationEnabled: boolean;
    projectName: null | string;
    quantity: null | number;
    status: null | string;
    version: number;
    workOrderNumber: null | string;
  }>,
): Promise<WorkOrderItem[]> {
  const workOrderNumbers = workOrders
    .map((item) => String(item.workOrderNumber || '').trim())
    .filter(Boolean);
  const requirementSummaryMap =
    await WorkOrderRequirementService.getSummaryByWorkOrderNumbers(
      workOrderNumbers,
    );
  return workOrders.map((wo) => {
    const requirementSummary = requirementSummaryMap.get(
      wo.workOrderNumber,
    ) || {
      confirmedRequirements: 0,
      overdueUnconfirmedRequirements: 0,
      plannedRequirements: 0,
    };
    return {
      ...wo,
      confirmedRequirements: requirementSummary.confirmedRequirements,
      id: wo.workOrderNumber,
      deliveryDate: formatDateString(wo.deliveryDate),
      effectiveTime: formatDateString(wo.effectiveTime),
      createTime: wo.createdAt ? wo.createdAt.toISOString() : null,
      overdueUnconfirmedRequirements:
        requirementSummary.overdueUnconfirmedRequirements,
      plannedRequirements: requirementSummary.plannedRequirements,
      status: mapToDisplayStatus(wo.status),
      warrantyStatus: getWarrantyStatus(wo.deliveryDate),
      projectName: wo.projectName || null,
      customerName: wo.customerName || null,
      division: wo.division || null,
      multiStationEnabled: Boolean(wo.multiStationEnabled),
      quantity: wo.quantity || 0,
      // OPTIMISTIC-LOCK-001: the interactive editor must echo back the
      // version it read, otherwise every UI edit is rejected as a missing
      // lock token.
      version: wo.version,
    };
  });
}
