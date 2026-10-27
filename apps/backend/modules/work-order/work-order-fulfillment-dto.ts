import type { Prisma } from '@prisma/client';

/**
 * Work-order shape shared by the fulfillment sync feed and the fulfillment
 * integration write responses (contract v1).
 */
export const FULFILLMENT_WORK_ORDER_SELECT = {
  customerName: true,
  customerNameId: true,
  deliveryDate: true,
  division: true,
  divisionId: true,
  isDeleted: true,
  projectName: true,
  quantity: true,
  status: true,
  updatedAt: true,
  version: true,
  workOrderNumber: true,
} satisfies Prisma.work_ordersSelect;

export type FulfillmentWorkOrderRow = Prisma.work_ordersGetPayload<{
  select: typeof FULFILLMENT_WORK_ORDER_SELECT;
}>;

export function toFulfillmentWorkOrder(row: FulfillmentWorkOrderRow) {
  return {
    customerName: row.customerName,
    customerNameId: row.customerNameId,
    deliveryDate: row.deliveryDate.toISOString(),
    division: row.division,
    divisionId: row.divisionId,
    isDeleted: row.isDeleted,
    projectName: row.projectName,
    quantity: row.quantity,
    status: row.status,
    updatedAt: row.updatedAt.toISOString(),
    version: row.version,
    workOrderNumber: row.workOrderNumber,
  };
}

export type FulfillmentWorkOrder = ReturnType<typeof toFulfillmentWorkOrder>;
