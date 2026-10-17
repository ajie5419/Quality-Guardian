import type { UpdatedAtCursor } from '~/utils/query-helpers';

import prisma from '~/utils/prisma';
import { buildUpdatedAtCursorWhere } from '~/utils/query-helpers';

import { resolveRequestWorkOrderNumbers } from './inspection-request-work-orders';

const inspectionRequestSyncSelect = {
  category: true,
  closedAt: true,
  id: true,
  isDeleted: true,
  linkedIssueId: true,
  linkedIssueNo: true,
  partId: true,
  partName: true,
  processId: true,
  processName: true,
  quantity: true,
  reporterId: true,
  requestNo: true,
  status: true,
  inspectionResult: true,
  submittedAt: true,
  supplierId: true,
  supplierName: true,
  team: true,
  teamId: true,
  unqualifiedQuantity: true,
  updatedAt: true,
  workOrderNumber: true,
  workOrders: { select: { workOrderNumber: true } },
} as const;

export const InspectionRequestSyncService = {
  /**
   * Read-only incremental feed of inspection requests for the fulfillment
   * sync. Includes soft-deleted rows; `workOrderNumbers` merges the primary
   * work order with every linked one (deduplicated, primary first).
   */
  async listSyncPage(cursor: undefined | UpdatedAtCursor, take: number) {
    const rows = await prisma.qms_inspection_requests.findMany({
      where: buildUpdatedAtCursorWhere(cursor, (afterKey) => ({
        id: { gt: afterKey },
      })),
      orderBy: [{ updatedAt: 'asc' }, { id: 'asc' }],
      select: inspectionRequestSyncSelect,
      take,
    });
    return rows.map(({ workOrders, ...row }) => ({
      ...row,
      workOrderNumbers: resolveRequestWorkOrderNumbers({
        workOrderNumber: row.workOrderNumber,
        workOrders,
      }),
    }));
  },
};
